import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditLogs, me, residents, transactions } from "../data/seed.js";
import { applyResidentMask, canAction, canSeeRestricted } from "./authz.js";
import { extractBearer, issueDevToken, newWebAuthnChallenge, verifyAccessToken, verifyWebAuthnStub } from "./auth.js";

const port = Number(process.env.PORT || 8787);
const distDir = resolve("apps/web/dist");
const legacyDir = resolve("apps/web-legacy");
const webRoot = existsSync(distDir) ? distDir : legacyDir;

const state = {
  residents: structuredClone(residents),
  transactions: structuredClone(transactions),
  certificates: [],
  auditLogs: structuredClone(auditLogs),
  linkEvents: [],
  jobs: [],
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function pdf(res, filename, body) {
  res.writeHead(200, {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${filename}"`,
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { resolveBody({}); }
    });
  });
}

// ユーザ解決:
//   1. Authorization: Bearer <jwt> があれば検証してクレームから構築
//   2. X-Dev-Roles ヘッダで roles を上書き（テスト用）
//   3. 何もなければ seed の既定ユーザ
function currentUser(req) {
  const token = extractBearer(req);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      return {
        userId: payload.sub,
        fullName: payload.name,
        department: payload.department,
        roles: payload.roles ?? [],
      };
    }
  }
  const override = req.headers["x-dev-roles"];
  if (override && typeof override === "string") {
    return { ...me, roles: override.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  return me;
}

function audit(user, action, resourceType, resourceId, details = {}) {
  state.auditLogs.unshift({
    logId: state.auditLogs.length + 1,
    userId: user.userId,
    ip: "127.0.0.1",
    action, resourceType, resourceId,
    occurredAt: new Date().toISOString(),
    details,
  });
}

function residentVisibleToUser(user, resident) {
  if (!resident) return null;
  return applyResidentMask(user, resident);
}

function searchResidents(user, query = {}) {
  const size = Number(query.size || 50);
  const page = Number(query.page || 1);
  const allowRestricted = canSeeRestricted(user);
  const filtered = state.residents.filter((resident) => {
    if (!query.includeRemoved && resident.movedOutDate) return false;
    if (resident.restrictions?.length && !allowRestricted) return false; // 存在を隠す
    if (query.name && !`${resident.familyNameKanji}${resident.givenNameKanji}`.includes(query.name)) return false;
    if (query.kana && !`${resident.familyNameKana}${resident.givenNameKana}`.includes(query.kana)) return false;
    if (query.birthDate && resident.birthDate !== query.birthDate) return false;
    if (query.sex && resident.sex !== query.sex) return false;
    if (query.residentId && !resident.residentId.includes(query.residentId)) return false;
    if (query.address && !resident.addressText.includes(query.address)) return false;
    if (query.householdHeadOnly && resident.relationToHead !== "本人") return false;
    if (query.foreignerOnly && !resident.foreigner) return false;
    return true;
  });
  return {
    total: filtered.length, page, size,
    items: filtered.slice((page - 1) * size, page * size).map((r) => residentVisibleToUser(user, r)),
  };
}

function nextTransactionId() {
  return `TX-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(state.transactions.length + 1).padStart(4, "0")}`;
}

function createTransaction(typeCode, resident, reasonCode, eventDate, items) {
  const tx = {
    transactionId: nextTransactionId(),
    residentId: resident.residentId,
    householdId: resident.householdId,
    typeCode, reasonCode,
    eventDate,
    processedDate: new Date().toISOString().slice(0, 10),
    receiverOffice: "住民課",
    status: "DRAFT",
    parentTransactionId: null,
    items,
  };
  state.transactions.unshift(tx);
  return tx;
}

function issueCertificate(user, residentId, formId, copies, usageText) {
  const issue = {
    issueId: `CI-${Date.now()}`,
    residentId, formId, copies,
    fee: 300 * copies,
    verifyToken: `V${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    pdfUrl: `/certificates/${residentId}-${formId}.pdf`,
    issuedAt: new Date().toISOString(),
    channel: "WINDOW",
    usageText,
    issuerUserId: user.userId,
  };
  state.certificates.unshift(issue);
  return issue;
}

function codeNotificationFormId(field, operation) {
  if (field === "juminCode" && operation === "ISSUE") return "0010009";
  if (field === "myNumber" && operation === "ISSUE") return "0010010";
  return "0010011";
}

function codeNotificationLabel(field, operation) {
  const target = field === "juminCode" ? "住民票コード" : "個人番号";
  const op = { ISSUE: "付番", CHANGE: "変更", FIX: "修正" }[operation] || operation;
  return `${target}${op}通知`;
}

function generatedDigits(length, prefix) {
  return (prefix + String(Date.now())).repeat(2).slice(0, length);
}

function handleCodeOperation(user, resident, field, body) {
  const operation = body.operation || "ISSUE";
  if (!["ISSUE", "CHANGE", "FIX"].includes(operation)) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: "operation は ISSUE / CHANGE / FIX のいずれかです。" } };
  }
  const length = field === "juminCode" ? 11 : 12;
  const payloadField = field === "juminCode" ? "code" : "number";
  const value = body[payloadField] || generatedDigits(length, field === "juminCode" ? "9" : "8");
  if (!new RegExp(`^\\d{${length}}$`).test(value)) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: `${payloadField} は ${length} 桁の数字で指定してください。` } };
  }
  const current = String(resident[field] || "");
  const hasCurrent = Boolean(current) && !current.includes("*") && !/^0+$/.test(current);
  if (operation === "ISSUE" && hasCurrent) {
    return { status: 409, body: { code: "CURRENT_CODE_EXISTS", message: "現行コードが既に存在します。" } };
  }
  if (operation !== "ISSUE" && !hasCurrent) {
    return { status: 409, body: { code: "CURRENT_CODE_NOT_FOUND", message: "変更・修正対象の現行コードがありません。" } };
  }
  resident[field] = value;
  const certificate = issueCertificate(
    user,
    resident.residentId,
    codeNotificationFormId(field, operation),
    1,
    codeNotificationLabel(field, operation),
  );
  return { status: 201, body: { residentId: resident.residentId, operation, [field]: value, certificate } };
}

function updateForeignerInfo(resident, body) {
  if (!body.residencePeriodEnd) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: "residencePeriodEnd は必須です。" } };
  }
  const info = {
    residenceStatus: body.residenceStatus || "",
    residencePeriodEnd: body.residencePeriodEnd,
    passportNo: body.passportNo || "",
    nationalityFull: body.nationalityFull || "",
    aliasKanji: body.aliasKanji || "",
    specialPermanentResident: Boolean(body.specialPermanentResident),
  };
  resident.foreigner = info;
  resident.nationality = info.nationalityFull || resident.nationality;
  const diffDays = Math.ceil((Date.parse(info.residencePeriodEnd) - Date.now()) / 86400000);
  return {
    status: 200,
    body: { residentId: resident.residentId, ...info, expiresWithin30Days: diffDays <= 30 },
  };
}

function issueForeignerExpiryNotices(user, body = {}) {
  const baseDate = body.baseDate || new Date().toISOString().slice(0, 10);
  const days = Number(body.days || 30);
  const start = Date.parse(baseDate);
  const end = start + days * 86400000;
  const targets = state.residents.filter((resident) => {
    if (resident.movedOutDate || !resident.foreigner?.residencePeriodEnd) return false;
    const expiry = Date.parse(resident.foreigner.residencePeriodEnd);
    return expiry >= start && expiry <= end;
  });
  for (const resident of targets) {
    issueCertificate(user, resident.residentId, "0010012", 1, "在留期間満了事前通知");
  }
  return {
    jobId: `FOREIGNER-${Date.now()}`,
    status: "DONE",
    progress: 100,
    resultUrl: null,
    error: null,
    baseDate,
    days,
    targetCount: targets.length,
    issuedCount: targets.length,
    formId: "0010012",
  };
}

function acceptLinkEvent(partnerId, payload = {}, status = "ACCEPTED", transactionId = null) {
  const event = {
    eventId: state.linkEvents.length + 1,
    partnerId,
    transactionId,
    direction: "INBOUND",
    status,
    payload,
    receivedAt: new Date().toISOString(),
  };
  state.linkEvents.unshift(event);
  return event;
}

function applyKosekiLink(body) {
  const noticeType = body.noticeType || body.kind;
  if (!noticeType) return { status: 400, body: { code: "VALIDATION_ERROR", message: "noticeType は必須です。" } };
  if (noticeType === "BIRTH") {
    if (!body.parentResidentId) return { status: 400, body: { code: "VALIDATION_ERROR", message: "parentResidentId は必須です。" } };
    const parent = state.residents.find((r) => r.residentId === body.parentResidentId && !r.movedOutDate);
    if (!parent) return { status: 404, body: { code: "PARENT_NOT_FOUND", message: "親となる住民が在籍中で見つかりません。" } };
    const eventDate = body.eventDate || new Date().toISOString().slice(0, 10);
    const baby = {
      residentId: `B${String(state.residents.length + 1).padStart(9, "0")}`,
      householdId: parent.householdId,
      familyNameKanji: body.familyNameKanji || parent.familyNameKanji,
      givenNameKanji: body.givenNameKanji || "新生児",
      familyNameKana: body.familyNameKana || parent.familyNameKana,
      givenNameKana: body.givenNameKana || "",
      birthDate: eventDate,
      sex: body.sex || "U",
      addressCode: parent.addressCode,
      addressText: parent.addressText,
      relationToHead: body.relationToHead || "子",
      movedInDate: eventDate,
      movedOutDate: null,
      juminCode: "00000000000",
      myNumber: "000000000000",
      nationality: parent.nationality,
      foreigner: null,
      alias: [],
      restrictions: [],
      validFrom: `${eventDate}T00:00:00+09:00`,
      validTo: null,
    };
    state.residents.push(baby);
    const tx = createTransaction("BIRTH", baby, "BIRTH", eventDate, [{ field: "resident", valueBefore: null, valueAfter: baby.residentId }]);
    tx.status = "APPLIED";
    tx.parentResidentId = body.parentResidentId;
    return { status: 201, body: tx };
  }
  if (noticeType === "DEATH") {
    const resident = state.residents.find((r) => r.residentId === body.residentId);
    if (!resident) return { status: 404, body: { code: "NOT_FOUND", message: "対象住民が見つかりません。" } };
    if (resident.movedOutDate) return { status: 409, body: { code: "ALREADY_REMOVED", message: "既に除票済みです。" } };
    const eventDate = body.eventDate || new Date().toISOString().slice(0, 10);
    resident.movedOutDate = eventDate;
    const tx = createTransaction("DEATH", resident, "DEATH", eventDate, [{ field: "movedOutDate", valueBefore: null, valueAfter: eventDate }]);
    tx.status = "APPLIED";
    return { status: 201, body: tx };
  }
  if (["MARRIAGE", "DIVORCE", "ADOPTION"].includes(noticeType)) {
    const resident = state.residents.find((r) => r.residentId === body.residentId);
    if (!resident) return { status: 404, body: { code: "NOT_FOUND", message: "対象住民が見つかりません。" } };
    if (resident.movedOutDate) return { status: 409, body: { code: "ALREADY_REMOVED", message: "除票済みの住民への戸籍連動は受理できません。" } };
    const eventDate = body.eventDate || new Date().toISOString().slice(0, 10);
    const before = resident.familyNameKanji;
    if (body.newFamilyNameKanji) resident.familyNameKanji = body.newFamilyNameKanji;
    if (body.newFamilyNameKana) resident.familyNameKana = body.newFamilyNameKana;
    const reasonCode = `KOSEKI_${noticeType}`;
    const tx = createTransaction("KOSEKI", resident, reasonCode, eventDate, [
      { field: "familyNameKanji", valueBefore: before, valueAfter: resident.familyNameKanji },
    ]);
    tx.status = "APPLIED";
    tx.kosekiNoticeId = body.kosekiNoticeId || null;
    tx.familyNameChanged = Boolean(body.newFamilyNameKanji);
    return { status: 201, body: tx };
  }
  return { status: 400, body: { code: "VALIDATION_ERROR", message: "noticeType は BIRTH / DEATH / MARRIAGE / DIVORCE / ADOPTION のいずれかです。" } };
}

function minimalCertificatePdf(issue) {
  const lines = [
    "Resident Record Certificate",
    `Issue ID: ${issue.issueId}`,
    `Resident ID: ${issue.residentId}`,
    `Form ID: ${issue.formId}`,
    `Copies: ${issue.copies}`,
    `Fee: ${issue.fee}`,
    `Verify Token: ${issue.verifyToken}`,
    `Issued At: ${issue.issuedAt}`,
    "NOTE: Replace this stub with PDF/A rendering.",
  ];
  const content = `BT\n/F1 12 Tf\n72 760 Td\n${lines.map((line) => `(${escapePdfText(line)}) Tj\n0 -18 Td`).join("")}ET\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream\nendobj\n`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += object;
  }
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function escapePdfText(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

async function handleApi(req, res, reqUrl) {
  const user = currentUser(req);
  const path = reqUrl.pathname.replace(/^\/api\/v1/, "");

  if (req.method === "POST" && path === "/auth/login") {
    const body = await readBody(req);
    // 開発モード: ID/PW は問わず固定ユーザを発行。本番では IdP に委譲。
    const profile = {
      userId: body.employeeId || me.userId,
      fullName: me.fullName,
      department: me.department,
      roles: me.roles,
    };
    const accessToken = issueDevToken(profile);
    return json(res, 200, { accessToken, expiresIn: 3600, me: profile });
  }
  if (req.method === "POST" && path === "/auth/logout") { res.writeHead(204); return res.end(); }
  if (req.method === "GET" && path === "/me") return json(res, 200, user);

  if (req.method === "POST" && path === "/auth/webauthn/challenge") {
    const body = await readBody(req);
    return json(res, 200, newWebAuthnChallenge(body.userId || user.userId));
  }
  if (req.method === "POST" && path === "/auth/webauthn/verify") {
    const body = await readBody(req);
    if (!verifyWebAuthnStub(body.userId || user.userId, body.assertion)) {
      return json(res, 401, { code: "WEBAUTHN_FAILED" });
    }
    const profile = { userId: body.userId || user.userId, fullName: me.fullName, department: me.department, roles: me.roles };
    return json(res, 200, { accessToken: issueDevToken(profile), expiresIn: 3600, me: profile });
  }
  if (req.method === "GET" && path === "/.well-known/openid-configuration") {
    return json(res, 200, {
      issuer: process.env.OIDC_ISSUER || "http://localhost:8787/dev-idp",
      authorization_endpoint: "/auth/login",
      token_endpoint: "/auth/login",
      userinfo_endpoint: "/me",
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["HS256"],
      note: "dev-only stub. Replace with real IdP.",
    });
  }

  if (req.method === "POST" && path === "/residents/search") {
    if (!canAction(user, "SEARCH")) return json(res, 403, { code: "FORBIDDEN", message: "検索権限がありません。" });
    const body = await readBody(req);
    audit(user, "SEARCH", "RESIDENT", "*", body);
    return json(res, 200, searchResidents(user, body));
  }

  const residentMatch = path.match(/^\/residents\/([^/]+)$/);
  if (residentMatch && req.method === "GET") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === residentMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "該当する住民はありません。" });
    const unmask = reqUrl.searchParams.getAll("unmask");
    const masked = applyResidentMask(user, resident, { unmask });
    if (!masked) return json(res, 404, { code: "NOT_FOUND", message: "該当する住民はありません。" });
    audit(user, "VIEW", "RESIDENT", resident.residentId, { unmask });
    return json(res, 200, masked);
  }
  if (residentMatch && req.method === "PUT") {
    if (!canAction(user, "TRANSACTION") && !canAction(user, "MOVE_IN_APPLY")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const resident = state.residents.find((item) => item.residentId === residentMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND" });
    const before = resident.addressText;
    resident.addressText = body.addressText || resident.addressText;
    const tx = createTransaction("MOVE", resident, body.reasonCode || "LIGHT_FIX",
      body.eventDate || new Date().toISOString().slice(0, 10),
      [{ field: "addressText", valueBefore: before, valueAfter: resident.addressText }]);
    tx.status = "APPLIED";
    audit(user, "UPDATE", "RESIDENT", resident.residentId, body);
    return json(res, 200, applyResidentMask(user, resident));
  }

  const historyMatch = path.match(/^\/residents\/([^/]+)\/history$/);
  if (historyMatch && req.method === "GET") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === historyMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "該当する住民はありません。" });
    if (!residentVisibleToUser(user, resident)) {
      return json(res, 404, { code: "NOT_FOUND", message: "該当する住民はありません。" });
    }
    return json(res, 200, state.transactions.filter((tx) => tx.residentId === historyMatch[1]));
  }

  const foreignerMatch = path.match(/^\/residents\/([^/]+)\/foreigner$/);
  if (foreignerMatch && req.method === "PUT") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const resident = state.residents.find((item) => item.residentId === foreignerMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    const result = updateForeignerInfo(resident, body);
    if (result.status === 200) audit(user, "UPDATE", "FOREIGNER", resident.residentId, result.body);
    return json(res, result.status, result.body);
  }

  if (req.method === "POST" && path === "/transactions/in") {
    if (!canAction(user, "MOVE_IN_APPLY") && !canAction(user, "MOVE_IN_RECEIVE") && !canAction(user, "TRANSACTION")) {
      return json(res, 403, { code: "FORBIDDEN" });
    }
    const body = await readBody(req);
    const member = body.members?.[0] || {};
    const resident = {
      residentId: `9${String(state.residents.length + 1).padStart(9, "0")}`,
      householdId: `H-${String(state.residents.length + 100).padStart(5, "0")}`,
      familyNameKanji: member.familyNameKanji || "新規",
      givenNameKanji: member.givenNameKanji || "住民",
      familyNameKana: member.familyNameKana || "シンキ",
      givenNameKana: member.givenNameKana || "ジュウミン",
      birthDate: member.birthDate || "2000-01-01",
      sex: member.sex || "U",
      addressCode: body.addressCode || "",
      addressText: body.addressText || "東京都サンプル市新町1-1",
      relationToHead: member.relationToHead || "本人",
      movedInDate: body.eventDate,
      movedOutDate: null,
      juminCode: "99999999999",
      myNumber: member.myNumber || "999999999999",
      nationality: member.foreigner?.nationalityFull || null,
      foreigner: member.foreigner || null,
      alias: [],
      restrictions: [],
      validFrom: `${body.eventDate}T00:00:00+09:00`,
      validTo: null,
    };
    state.residents.push(resident);
    const tx = createTransaction("IN", resident, "MOVE_IN", body.eventDate,
      [{ field: "resident", valueBefore: null, valueAfter: resident.residentId }]);
    tx.status = "APPLIED";
    audit(user, "CREATE", "TRANSACTION", tx.transactionId, { type: "IN" });
    return json(res, 201, tx);
  }

  if (req.method === "POST" && path === "/transactions/out") {
    if (!canAction(user, "MOVE_OUT_APPLY") && !canAction(user, "MOVE_OUT_RECEIVE") && !canAction(user, "TRANSACTION")) {
      return json(res, 403, { code: "FORBIDDEN" });
    }
    const body = await readBody(req);
    const resident = state.residents.find((item) => item.residentId === body.members?.[0]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND" });
    resident.movedOutDate = body.eventDate;
    const tx = createTransaction("OUT", resident, body.reasonCode || "MOVE_OUT", body.eventDate, [
      { field: "movedOutDate", valueBefore: null, valueAfter: body.eventDate },
      { field: "newAddress", valueBefore: null, valueAfter: body.newAddress },
    ]);
    tx.status = "APPLIED";
    const certificate = issueCertificate(user, resident.residentId, "0010007", 1, "転出証明");
    return json(res, 201, { ...tx, certificate });
  }

  // 出生連動: 親の世帯に新生児を登録
  if (req.method === "POST" && path === "/transactions/birth") {
    if (!canAction(user, "TRANSACTION") && !canAction(user, "MOVE_IN_APPLY")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.parentResidentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "parentResidentId は必須です。" });
    const parent = state.residents.find((r) => r.residentId === body.parentResidentId && !r.movedOutDate);
    if (!parent) return json(res, 404, { code: "PARENT_NOT_FOUND", message: "親となる住民が在籍中で見つかりません。" });
    if (!body.familyNameKanji || !body.givenNameKanji) {
      return json(res, 400, { code: "VALIDATION_ERROR", message: "familyNameKanji / givenNameKanji は必須です。" });
    }
    const eventDate = body.eventDate || new Date().toISOString().slice(0, 10);
    const sex = body.sex || "U";
    if (!["M", "F", "U"].includes(sex)) {
      return json(res, 400, { code: "VALIDATION_ERROR", message: "sex は M / F / U のいずれかです。" });
    }
    const residentId = `B${String(state.residents.length + 1).padStart(9, "0")}`;
    const baby = {
      residentId,
      householdId: parent.householdId,
      familyNameKanji: body.familyNameKanji,
      givenNameKanji: body.givenNameKanji,
      familyNameKana: body.familyNameKana || "",
      givenNameKana: body.givenNameKana || "",
      birthDate: eventDate,
      sex,
      addressCode: parent.addressCode,
      addressText: parent.addressText,
      relationToHead: body.relationToHead || "子",
      movedInDate: eventDate,
      movedOutDate: null,
      juminCode: "00000000000",
      myNumber: "000000000000",
      nationality: parent.nationality,
      foreigner: null,
      alias: [],
      restrictions: [],
      validFrom: `${eventDate}T00:00:00+09:00`,
      validTo: null,
    };
    state.residents.push(baby);
    const tx = createTransaction("BIRTH", baby, "BIRTH", eventDate, [{ field: "resident", valueBefore: null, valueAfter: residentId }]);
    tx.status = "APPLIED";
    tx.parentResidentId = body.parentResidentId;
    audit(user, "CREATE", "TRANSACTION", tx.transactionId, { type: "BIRTH", parent: body.parentResidentId });
    return json(res, 201, tx);
  }

  // 死亡連動: 対象者を消除
  if (req.method === "POST" && path === "/transactions/death") {
    if (!canAction(user, "TRANSACTION") && !canAction(user, "MOVE_OUT_APPLY")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.residentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "residentId は必須です。" });
    const target = state.residents.find((r) => r.residentId === body.residentId);
    if (!target) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    if (target.movedOutDate) return json(res, 409, { code: "ALREADY_REMOVED", message: "既に除票済みです。" });
    const eventDate = body.eventDate || new Date().toISOString().slice(0, 10);
    target.movedOutDate = eventDate;
    const tx = createTransaction("DEATH", target, "DEATH", eventDate, [{ field: "movedOutDate", valueBefore: null, valueAfter: eventDate }]);
    tx.status = "APPLIED";
    audit(user, "UPDATE", "TRANSACTION", tx.transactionId, { type: "DEATH", residentId: target.residentId });
    return json(res, 201, tx);
  }

  if (req.method === "POST" && path === "/transactions/official") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.residentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "residentId は必須です。" });
    const resident = state.residents.find((r) => r.residentId === body.residentId);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    const tx = createTransaction("OFFICIAL", resident, body.reasonCode || "OFFICIAL_FIX", body.eventDate || new Date().toISOString().slice(0, 10), [
      { field: "content", valueBefore: null, valueAfter: body.content || "" },
      { field: "legalBasis", valueBefore: null, valueAfter: body.legalBasis || "" },
    ]);
    tx.status = "DRAFT";
    tx.approvalRoute = body.approvalRoute || ["REVIEW", "ADMIN"];
    audit(user, "CREATE", "OFFICIAL_TRANSACTION", tx.transactionId, body);
    return json(res, 201, tx);
  }

  const approveMatch = path.match(/^\/transactions\/([^/]+)\/approve$/);
  if (approveMatch && req.method === "POST") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const tx = state.transactions.find((item) => item.transactionId === approveMatch[1]);
    if (!tx) return json(res, 404, { code: "NOT_FOUND", message: "対象異動が見つかりません。" });
    if (tx.typeCode !== "OFFICIAL") return json(res, 409, { code: "NOT_APPROVABLE", message: "決裁可能なのは職権異動のみです。" });
    if (["APPLIED", "CANCELLED"].includes(tx.status)) {
      return json(res, 409, { code: "ALREADY_FINALIZED", message: "確定済み異動は決裁できません。" });
    }
    const action = body.action || "APPROVE";
    tx.status = action === "REMAND" ? "DRAFT" : action === "REJECT" ? "CANCELLED" : "APPLIED";
    tx.approval = { action, comment: body.comment || "", approverUserId: user.userId, actedAt: new Date().toISOString() };
    audit(user, "APPROVE", "OFFICIAL_TRANSACTION", tx.transactionId, tx.approval);
    return json(res, 200, { transactionId: tx.transactionId, status: tx.status, step: 1 });
  }

  if (req.method === "POST" && path === "/codes/jumin") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.residentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "residentId は必須です。" });
    const resident = state.residents.find((r) => r.residentId === body.residentId);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    const result = handleCodeOperation(user, resident, "juminCode", body);
    if (result.status === 201) audit(user, "UPDATE", "JUMIN_CODE", body.residentId, { operation: result.body.operation });
    return json(res, result.status, result.body);
  }

  if (req.method === "POST" && path === "/codes/mynumber") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.residentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "residentId は必須です。" });
    const resident = state.residents.find((r) => r.residentId === body.residentId);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    const result = handleCodeOperation(user, resident, "myNumber", body);
    if (result.status === 201) audit(user, "UPDATE", "MY_NUMBER", body.residentId, { operation: result.body.operation });
    return json(res, result.status, result.body);
  }

  if (req.method === "POST" && path === "/transactions/cancel") {
    if (!canAction(user, "CANCEL") && !canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const parent = state.transactions.find((tx) => tx.transactionId === body.transactionId);
    if (!parent) return json(res, 404, { code: "NOT_FOUND" });
    const cancel = {
      ...parent,
      transactionId: nextTransactionId(),
      typeCode: "CANCEL",
      reasonCode: "CANCEL",
      status: "APPLIED",
      parentTransactionId: parent.transactionId,
      items: [{ field: "cancelReason", valueBefore: null, valueAfter: body.reason }],
    };
    state.transactions.unshift(cancel);
    return json(res, 201, cancel);
  }

  if (req.method === "POST" && path === "/certificates/jumin") {
    if (!canAction(user, "ISSUE_CERTIFICATE")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const issue = issueCertificate(user, body.residentId, body.formId || "0010001", Number(body.copies || 1), body.usageText || "窓口請求");
    audit(user, "ISSUE", "CERTIFICATE", issue.issueId, body);
    return json(res, 201, issue);
  }

  const certificatePdfMatch = path.match(/^\/certificates\/([^/]+)\/pdf$/);
  if (certificatePdfMatch && req.method === "GET") {
    const issue = state.certificates.find((item) => item.issueId === certificatePdfMatch[1]);
    if (!issue) return json(res, 404, { code: "NOT_FOUND" });
    return pdf(res, `certificate-${issue.issueId}.pdf`, minimalCertificatePdf(issue));
  }

  const verifyMatch = path.match(/^\/verify\/([^/]+)$/);
  if (verifyMatch && req.method === "GET") {
    const issue = state.certificates.find((item) => item.verifyToken === verifyMatch[1]);
    return json(res, 200, { valid: Boolean(issue), formId: issue?.formId || null, issuedAt: issue?.issuedAt || null, issuerOffice: issue ? "サンプル市 住民課" : null });
  }

  if (req.method === "POST" && path === "/reports/annual") {
    const body = await readBody(req);
    const job = { jobId: `JOB-${Date.now()}`, status: "DONE", progress: 100, resultUrl: `/reports/${body.templateId || "annual"}.xlsx`, error: null };
    state.jobs.unshift(job);
    return json(res, 202, job);
  }

  if (req.method === "POST" && path === "/reports/foreigner-expiring") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const job = issueForeignerExpiryNotices(user, body);
    state.jobs.unshift(job);
    audit(user, "ISSUE", "FOREIGNER_EXPIRY_NOTICE", "*", { targetCount: job.targetCount });
    return json(res, 202, job);
  }

  if (req.method === "POST" && path === "/link/internal/koseki") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const applied = applyKosekiLink(body);
    if (applied.status !== 201) return json(res, applied.status, applied.body);
    const event = acceptLinkEvent("KOSEKI", body, "APPLIED", applied.body.transactionId);
    audit(user, "RECEIVE", "LINK_KOSEKI", String(event.eventId), { transactionId: applied.body.transactionId });
    return json(res, 201, {
      eventId: String(event.eventId),
      partnerId: "KOSEKI",
      status: "APPLIED",
      transactionId: applied.body.transactionId,
      transaction: applied.body,
      receivedAt: event.receivedAt,
    });
  }

  // CS 連携: residentId + fourInfo を受領し、整合を返す
  if (req.method === "POST" && path === "/link/cs/inbound") {
    const body = await readBody(req);
    if (!body?.residentId) {
      const event = acceptLinkEvent("CS", body, "ACCEPTED", null);
      return json(res, 202, { eventId: String(event.eventId), partnerId: "CS", status: "ACCEPTED", receivedAt: event.receivedAt });
    }
    const r = state.residents.find((x) => x.residentId === body.residentId);
    if (!r) {
      const event = acceptLinkEvent("CS", body, "NOT_FOUND", null);
      return json(res, 404, { eventId: String(event.eventId), partnerId: "CS", status: "NOT_FOUND", receivedAt: event.receivedAt });
    }
    const fi = body.fourInfo || {};
    const diffs = [];
    const here = `${r.familyNameKanji ?? ""} ${r.givenNameKanji ?? ""}`;
    if (fi.name && fi.name !== here) diffs.push("name");
    if (fi.birthDate && fi.birthDate !== r.birthDate) diffs.push("birthDate");
    if (fi.sex && fi.sex !== r.sex) diffs.push("sex");
    if (fi.addressText && fi.addressText !== r.addressText) diffs.push("addressText");
    const status = diffs.length === 0 ? "MATCH" : "MISMATCH";
    const event = acceptLinkEvent("CS", body, status, null);
    audit(user, "RECEIVE", "LINK_CS", String(event.eventId), { residentId: body.residentId, status });
    return json(res, 200, {
      eventId: String(event.eventId), partnerId: "CS", status,
      matched: diffs.length === 0, differences: diffs, receivedAt: event.receivedAt,
    });
  }

  // 番号連携: operation 分岐 (ISSUE_LINK / LOOKUP)
  if (req.method === "POST" && path === "/link/number/inbound") {
    const body = await readBody(req);
    const op = String(body?.operation || "ACCEPT").toUpperCase();
    if (op === "ISSUE_LINK") {
      const event = acceptLinkEvent("NUMBER", body, "APPLIED", null);
      return json(res, 200, {
        eventId: String(event.eventId), partnerId: "NUMBER", status: "APPLIED",
        operation: op, symbol: `SYM-${Date.now()}`, receivedAt: event.receivedAt,
      });
    }
    if (op === "LOOKUP") {
      const r = state.residents.find((x) => x.residentId === body?.residentId);
      if (!r) {
        const event = acceptLinkEvent("NUMBER", body, "NOT_FOUND", null);
        return json(res, 404, { eventId: String(event.eventId), partnerId: "NUMBER", status: "NOT_FOUND", receivedAt: event.receivedAt });
      }
      const event = acceptLinkEvent("NUMBER", body, "APPLIED", null);
      return json(res, 200, {
        eventId: String(event.eventId), partnerId: "NUMBER", status: "APPLIED",
        operation: op,
        data: {
          residentId: r.residentId,
          name: `${r.familyNameKanji ?? ""} ${r.givenNameKanji ?? ""}`,
          birthDate: r.birthDate, sex: r.sex, addressText: r.addressText, householdId: r.householdId,
        },
        receivedAt: event.receivedAt,
      });
    }
    const event = acceptLinkEvent("NUMBER", body, "ACCEPTED", null);
    return json(res, 202, { eventId: String(event.eventId), partnerId: "NUMBER", status: "ACCEPTED", receivedAt: event.receivedAt });
  }

  // 庁内他業務: TAX / INSURANCE / ELECTION は 4情報相当を返す
  const internalMatch = path.match(/^\/link\/internal\/([^/]+)$/);
  if (req.method === "POST" && internalMatch) {
    const partnerId = String(internalMatch[1] || "").toUpperCase();
    const body = await readBody(req);
    if (["TAX", "INSURANCE", "ELECTION"].includes(partnerId)) {
      const ids = Array.isArray(body?.residentIds) ? body.residentIds : [];
      if (ids.length === 0) {
        return json(res, 400, { code: "VALIDATION_ERROR", message: "residentIds は必須です（空配列不可）。" });
      }
      const records = ids
        .map((rid) => state.residents.find((r) => r.residentId === rid))
        .filter(Boolean)
        .map((r) => ({
          residentId: r.residentId,
          name: `${r.familyNameKanji ?? ""} ${r.givenNameKanji ?? ""}`,
          birthDate: r.birthDate, sex: r.sex, addressText: r.addressText, householdId: r.householdId,
        }));
      const event = acceptLinkEvent(partnerId, body, "APPLIED", null);
      audit(user, "PROVIDE", "LINK", String(event.eventId), { partnerId, count: records.length });
      return json(res, 200, {
        eventId: String(event.eventId), partnerId, status: "APPLIED",
        count: records.length, residents: records, receivedAt: event.receivedAt,
      });
    }
    const event = acceptLinkEvent(partnerId, body, "ACCEPTED", null);
    audit(user, "RECEIVE", "LINK", String(event.eventId), { partnerId });
    return json(res, 202, { eventId: String(event.eventId), partnerId, status: "ACCEPTED", receivedAt: event.receivedAt });
  }

  // 申請管理 受領のみ
  if (req.method === "POST" && path === "/link/application/inbound") {
    const body = await readBody(req);
    const event = acceptLinkEvent("APPLICATION", body, "ACCEPTED", null);
    audit(user, "RECEIVE", "LINK", String(event.eventId), { partnerId: "APPLICATION" });
    return json(res, 202, { eventId: String(event.eventId), partnerId: "APPLICATION", status: "ACCEPTED", receivedAt: event.receivedAt });
  }

  if (req.method === "POST" && path === "/euc/query") {
    const body = await readBody(req);
    const needsApproval = Boolean(body.includeMyNumber || body.outputFields?.includes("myNumber"));
    return json(res, 202, {
      jobId: `EUC-${Date.now()}`,
      status: needsApproval ? "QUEUED" : "DONE",
      progress: needsApproval ? 10 : 100,
      resultUrl: needsApproval ? null : "/euc/result.csv",
      error: null,
      requiresSecondApproval: needsApproval,
    });
  }

  if (req.method === "POST" && path === "/restrictions") {
    if (!canAction(user, "RESTRICTION_MANAGE")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const target = state.residents.find((r) => r.residentId === body.residentId);
    if (!target) return json(res, 404, { code: "NOT_FOUND" });
    const restriction = {
      id: `R-${Date.now()}`,
      residentId: body.residentId,
      category: body.category || "DV",
      startDate: body.startDate,
      endDate: body.endDate || null,
      scope: body.scope || "SELF",
      releaseRole: "RESTRICTION_RELEASE",
      note: body.note || "",
    };
    target.restrictions = [...(target.restrictions || []), restriction];
    audit(user, "CREATE", "RESTRICTION", restriction.id, body);
    return json(res, 201, restriction);
  }

  const restrictionMatch = path.match(/^\/restrictions\/([^/]+)$/);
  if (restrictionMatch && req.method === "DELETE") {
    if (!canAction(user, "RESTRICTION_MANAGE")) return json(res, 403, { code: "FORBIDDEN" });
    let removed = null;
    for (const r of state.residents) {
      const before = r.restrictions?.length ?? 0;
      r.restrictions = (r.restrictions || []).filter((x) => x.id !== restrictionMatch[1]);
      if (r.restrictions.length < before) { removed = r.residentId; break; }
    }
    if (!removed) return json(res, 404, { code: "NOT_FOUND" });
    audit(user, "DELETE", "RESTRICTION", restrictionMatch[1], { residentId: removed });
    res.writeHead(204); return res.end();
  }

  if (req.method === "GET" && path === "/audit") return json(res, 200, state.auditLogs.slice(0, 100));

  return json(res, 404, { code: "NOT_FOUND", message: "APIが見つかりません。" });
}

function serveStatic(req, res, reqUrl) {
  const requested = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const filePath = normalize(join(webRoot, requested));
  if (!filePath.startsWith(webRoot)) { res.writeHead(403); return res.end("Forbidden"); }
  const target = existsSync(filePath) ? filePath : join(webRoot, "index.html");
  res.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
  res.end(readFileSync(target));
}

export const server = createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (reqUrl.pathname.startsWith("/api/v1")) return handleApi(req, res, reqUrl);
  return serveStatic(req, res, reqUrl);
});

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (process.argv.includes("--smoke")) {
  const u1 = { ...me, roles: ["WINDOW"] };
  const u2 = { ...me, roles: ["RESTRICTION_RELEASE"] };
  const r1 = searchResidents(u1, { name: "住民" });
  const r2 = searchResidents(u2, { name: "住民" });
  if (r1.total >= r2.total) throw new Error(`Smoke failed: WINDOW(${r1.total}) should be < RESTRICTION_RELEASE(${r2.total})`);
  const masked = applyResidentMask(u1, state.residents[0]);
  if (!masked || !masked.myNumber.includes("*")) throw new Error("Smoke failed: my_number should be masked for WINDOW");
  const unmasked = applyResidentMask({ ...me, roles: ["ADMIN"] }, state.residents[0], { unmask: ["my_number"] });
  if (!unmasked || unmasked.myNumber.includes("*")) throw new Error("Smoke failed: ADMIN should unmask my_number when requested");
  console.log("Smoke test passed.");
} else if (isMain) {
  server.listen(port, () => console.log(`住民記録システム Web版: http://localhost:${port}`));
}

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
