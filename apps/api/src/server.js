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
  // 本人通知制度（標準仕様書 8.1 標準オプション機能）
  notifyRegistrations: [],
  notifications: [],
  // コンビニ交付（J-LIS / 自治体中間サーバ連携, SCR-507）
  conveniRequests: [],
  // EUC設計（SCR-A01 / BAT-012 EUCデータ抽出）: 再利用可能な抽出テンプレート
  eucTemplates: [],
  // バッチ管理（標準仕様書 9 バッチ / BAT-001〜）: 実行履歴
  batchJobs: [],
  // エラー・アラート設定 / アクセスログ分析（SCR-A04 / 標準仕様書 11, BAT-011）
  alertRules: {
    nightAccessEnabled: true,
    nightStartHour: 22,
    nightEndHour: 6,
    bulkSearchEnabled: true,
    bulkSearchThreshold: 50,
  },
};

// SCR-A04: アクセスログ分析。監査ログから深夜アクセス・大量検索を抽出してアラート化。
function analyzeAlerts(rules, logs) {
  const alerts = [];
  if (rules.nightAccessEnabled) {
    for (const log of logs) {
      const hour = new Date(log.occurredAt).getHours();
      const isNight = rules.nightStartHour > rules.nightEndHour
        ? (hour >= rules.nightStartHour || hour < rules.nightEndHour)
        : (hour >= rules.nightStartHour && hour < rules.nightEndHour);
      if (isNight) {
        alerts.push({ type: "NIGHT_ACCESS", severity: "WARN", userId: log.userId, occurredAt: log.occurredAt,
          message: `深夜時間帯(${rules.nightStartHour}時〜${rules.nightEndHour}時)のアクセス: ${log.action} ${log.resourceType ?? ""}` });
      }
    }
  }
  if (rules.bulkSearchEnabled) {
    const counts = {};
    for (const log of logs) {
      if (log.action === "SEARCH" || log.action === "VIEW") counts[log.userId] = (counts[log.userId] || 0) + 1;
    }
    for (const [userId, count] of Object.entries(counts)) {
      if (count > rules.bulkSearchThreshold) {
        alerts.push({ type: "BULK_SEARCH", severity: "WARN", userId, count,
          message: `大量検索の疑い: ${userId} が ${count} 件(閾値 ${rules.bulkSearchThreshold})の検索・照会を実施` });
      }
    }
  }
  return alerts;
}

// バッチ管理（標準仕様書 9 バッチ）: 主要バッチの定義と実行（同期実行のリファレンス）
const BATCH_TYPES = [
  { type: "CS_IMPORT", name: "CS連携電文取込 (BAT-CS)", description: "住基ネットCSからの異動・本人確認情報を取り込む" },
  { type: "RECONCILE", name: "本人確認情報 整合性確認 (BAT-RC)", description: "CS側本人確認情報と住民記録の突合" },
  { type: "ANNUAL_AGGREGATE", name: "住基年報 集計 (BAT-AR)", description: "住民基本台帳関係年報の集計" },
  { type: "FOREIGNER_EXPIRY", name: "在留期間満了 事前通知抽出 (BAT-FE)", description: "在留期間満了が近い外国人住民を抽出" },
  { type: "SPECIAL_PERMANENT_EXPIRY", name: "特別永住者証明書 満了抽出 (BAT-SP)", description: "特別永住者証明書の満了予定を抽出" },
];

function runBatch(def, user) {
  const startedAt = new Date().toISOString();
  let processed = 0;
  const details = {};
  switch (def.type) {
    case "RECONCILE": {
      processed = state.residents.length;
      details.mismatches = 0;
      break;
    }
    case "ANNUAL_AGGREGATE": {
      processed = state.residents.length;
      details.population = state.residents.filter((r) => !r.movedOutDate).length;
      details.foreigners = state.residents.filter((r) => r.foreigner && !r.movedOutDate).length;
      break;
    }
    case "FOREIGNER_EXPIRY": {
      const limit = Date.now() + 30 * 86400000;
      processed = state.residents.filter((r) => !r.movedOutDate && r.foreigner?.residencePeriodEnd && Date.parse(r.foreigner.residencePeriodEnd) <= limit).length;
      details.targets = processed;
      break;
    }
    case "SPECIAL_PERMANENT_EXPIRY": {
      const limit = Date.now() + 90 * 86400000;
      processed = state.residents.filter((r) => !r.movedOutDate && r.specialPermanentCert && Date.parse(r.specialPermanentCert.expiryDate) <= limit).length;
      details.targets = processed;
      break;
    }
    case "CS_IMPORT":
    default: {
      processed = state.linkEvents.length;
      details.applied = state.linkEvents.length;
      break;
    }
  }
  return {
    jobId: `BATCH-${Date.now()}`,
    type: def.type,
    name: def.name,
    status: "DONE",
    startedAt,
    finishedAt: new Date().toISOString(),
    processed,
    details,
    executedBy: user.userId,
  };
}

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

// 本人通知制度（標準仕様書 8.1）:
// 第三者・代理人請求で証明書が交付された場合、事前登録済みの本人へ通知を発出する。
const THIRD_PARTY_REQUESTERS = new Set(["THIRD_PARTY", "PROXY", "DELEGATE"]);

function activeNotifyRegistration(residentId) {
  return state.notifyRegistrations.find(
    (r) => r.residentId === residentId && r.status === "ACTIVE",
  );
}

function triggerHonninTsuchi(residentId, issue, requesterType) {
  if (!requesterType || !THIRD_PARTY_REQUESTERS.has(String(requesterType).toUpperCase())) {
    return null;
  }
  if (!activeNotifyRegistration(residentId)) return null;
  const notification = {
    notificationId: `NT-${Date.now()}-${state.notifications.length + 1}`,
    residentId,
    issueId: issue.issueId,
    formId: issue.formId,
    requesterType: String(requesterType).toUpperCase(),
    certifiedAt: issue.issuedAt,
    notifiedAt: new Date().toISOString(),
    channel: "POSTAL",
    status: "NOTIFIED",
  };
  state.notifications.unshift(notification);
  return notification;
}

// コンビニ交付（SCR-507 / 標準仕様書 第5章 証明・連携）:
// J-LIS・自治体中間サーバ経由のマイナンバーカードによる証明書交付要求を受領する。
// 支援措置・抑止対象者はコンビニ交付を利用停止（REFUSED）する。
function receiveConveniRequest(payload) {
  const now = new Date().toISOString();
  const record = {
    conveniId: `CV-${Date.now()}-${state.conveniRequests.length + 1}`,
    residentId: payload.residentId,
    formId: payload.formId || "0010001",
    storeCode: payload.storeCode || "JLIS-STORE",
    cardSerial: payload.cardSerial || "",
    requestedAt: now,
    status: "PENDING",
    issueId: null,
    reason: null,
  };
  const target = state.residents.find((r) => r.residentId === payload.residentId);
  if (!target) {
    record.status = "NOT_FOUND";
    record.reason = "対象住民が存在しません。";
  } else if (target.movedOutDate) {
    record.status = "REFUSED";
    record.reason = "転出済みのためコンビニ交付できません。";
  } else if (target.restrictions?.length) {
    // 支援措置・抑止対象者はコンビニ交付を停止
    record.status = "REFUSED";
    record.reason = "支援措置・抑止対象のためコンビニ交付を停止しています。";
  } else {
    const issue = {
      issueId: `CI-${Date.now()}`,
      residentId: target.residentId,
      formId: record.formId,
      copies: 1,
      fee: 200,
      verifyToken: `V${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      pdfUrl: `/certificates/${target.residentId}-${record.formId}.pdf`,
      issuedAt: now,
      channel: "CONVENIENCE",
      usageText: "コンビニ交付",
      issuerUserId: "JLIS",
    };
    state.certificates.unshift(issue);
    record.status = "ISSUED";
    record.issueId = issue.issueId;
  }
  state.conveniRequests.unshift(record);
  return record;
}

function conveniLinkStatus() {
  const total = state.conveniRequests.length;
  const issued = state.conveniRequests.filter((r) => r.status === "ISSUED").length;
  const refused = state.conveniRequests.filter((r) => r.status === "REFUSED").length;
  return {
    partner: "J-LIS / 自治体中間サーバ",
    linkState: "CONNECTED",
    serviceHours: "6:30-23:00",
    checkedAt: new Date().toISOString(),
    totals: { total, issued, refused, pending: total - issued - refused },
  };
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

// SCR-802 特別永住者管理: 特別永住者証明書の交付・有効期間満了日算出
//   有効期間: 交付時 16 歳未満は 16 歳の誕生日、16 歳以上は交付日から 7 年。
function addYears(iso, years) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
function computeSpecialPermanentExpiry(birthDate, issuedDate) {
  const sixteenth = addYears(birthDate, 16);
  return Date.parse(issuedDate) < Date.parse(sixteenth) ? sixteenth : addYears(issuedDate, 7);
}
function updateSpecialPermanent(resident, body) {
  if (!body.certNumber) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: "certNumber は必須です。" } };
  }
  const issuedDate = body.issuedDate || new Date().toISOString().slice(0, 10);
  const expiryDate = computeSpecialPermanentExpiry(resident.birthDate, issuedDate);
  const cert = {
    certNumber: body.certNumber,
    issuedDate,
    expiryDate,
    note: body.note || "",
  };
  resident.specialPermanentCert = cert;
  resident.foreigner = { ...(resident.foreigner || {}), specialPermanentResident: true };
  const diffDays = Math.ceil((Date.parse(expiryDate) - Date.now()) / 86400000);
  return { status: 200, body: { residentId: resident.residentId, ...cert, expiresWithin90Days: diffDays <= 90 } };
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

  // SCR-002: ダッシュボード（主要指標の集約）
  if (req.method === "GET" && path === "/overview") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const active = state.residents.filter((r) => !r.movedOutDate);
    return json(res, 200, {
      residents: {
        total: state.residents.length,
        active: active.length,
        foreigners: active.filter((r) => r.foreigner).length,
        specialPermanent: state.residents.filter((r) => r.specialPermanentCert).length,
        restricted: state.residents.filter((r) => r.restrictions?.length).length,
      },
      transactions: {
        total: state.transactions.length,
        pendingApproval: state.transactions.filter((t) => t.status && t.status !== "APPLIED").length,
      },
      certificates: state.certificates.length,
      conveniRequests: state.conveniRequests.length,
      notifyRegistrations: state.notifyRegistrations.filter((r) => r.status === "ACTIVE").length,
      notifications: state.notifications.length,
      eucTemplates: state.eucTemplates.length,
      batchJobs: state.batchJobs.length,
      alerts: analyzeAlerts(state.alertRules, state.auditLogs).length,
    });
  }

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

  // 機能 0040079: 検索結果の CSV 出力（抑止マスク適用）
  if (req.method === "POST" && path === "/residents/search/export") {
    if (!canAction(user, "SEARCH")) return json(res, 403, { code: "FORBIDDEN", message: "検索権限がありません。" });
    const body = await readBody(req);
    const result = searchResidents(user, body);
    const items = result.items ?? [];
    audit(user, "EXPORT", "RESIDENT", "*", { count: items.length });
    const cols = [["residentId", "宛名番号"], ["familyNameKanji", "氏名"], ["familyNameKana", "氏名カナ"], ["birthDate", "生年月日"], ["sex", "性別"], ["addressText", "住所"]];
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
    const header = cols.map(([, label]) => label).join(",");
    const lines = items.map((r) => cols.map(([k]) => esc(r[k])).join(","));
    const csv = `﻿${[header, ...lines].join("\r\n")}\r\n`;
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="residents.csv"',
      "cache-control": "no-store",
    });
    return res.end(csv);
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

  // SCR-414 世帯: 同一世帯の世帯員照会
  const householdMatch = path.match(/^\/residents\/([^/]+)\/household$/);
  if (householdMatch && req.method === "GET") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === householdMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "該当する住民はありません。" });
    const members = state.residents
      .filter((r) => r.householdId === resident.householdId && !r.movedOutDate)
      .map((r) => applyResidentMask(user, r))
      .filter(Boolean);
    audit(user, "VIEW", "HOUSEHOLD", resident.householdId, { members: members.length });
    return json(res, 200, { householdId: resident.householdId, total: members.length, members });
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

  // SCR-103: 通称・旧氏管理（通称=ALIAS / 旧氏=FORMER_FAMILY）
  const aliasMatch = path.match(/^\/residents\/([^/]+)\/alias$/);
  if (aliasMatch && req.method === "GET") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === aliasMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    return json(res, 200, resident.alias ?? []);
  }
  if (aliasMatch && req.method === "POST") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const resident = state.residents.find((item) => item.residentId === aliasMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    if (!body.valueKanji) return json(res, 400, { code: "VALIDATION_ERROR", message: "valueKanji は必須です。" });
    const alias = {
      aliasId: `AL-${Date.now()}`,
      kind: body.kind === "FORMER_FAMILY" ? "FORMER_FAMILY" : "ALIAS",
      valueKanji: body.valueKanji,
      valueKana: body.valueKana || "",
      validFrom: body.validFrom || new Date().toISOString().slice(0, 10),
      validTo: null,
    };
    resident.alias = [alias, ...(resident.alias ?? [])];
    audit(user, "CREATE", "ALIAS", resident.residentId, { kind: alias.kind, valueKanji: alias.valueKanji });
    return json(res, 201, alias);
  }
  const aliasDeleteMatch = path.match(/^\/residents\/([^/]+)\/alias\/([^/]+)$/);
  if (aliasDeleteMatch && req.method === "DELETE") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === aliasDeleteMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND" });
    const target = (resident.alias ?? []).find((a) => a.aliasId === aliasDeleteMatch[2]);
    if (!target) return json(res, 404, { code: "NOT_FOUND", message: "通称・旧氏が見つかりません。" });
    target.validTo = new Date().toISOString().slice(0, 10);
    audit(user, "UPDATE", "ALIAS", resident.residentId, { aliasId: target.aliasId, action: "廃止" });
    return json(res, 200, target);
  }

  // SCR-802: 特別永住者管理（特別永住者証明書）
  if (req.method === "GET" && path === "/special-permanent/expiring") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const days = Number(new URL(reqUrl).searchParams.get("days") || 90);
    const limit = Date.now() + days * 86400000;
    const targets = state.residents
      .filter((r) => !r.movedOutDate && r.specialPermanentCert && Date.parse(r.specialPermanentCert.expiryDate) <= limit)
      .map((r) => ({ residentId: r.residentId, name: `${r.familyNameKanji ?? ""}${r.givenNameKanji ?? ""}`, ...r.specialPermanentCert }));
    return json(res, 200, { days, total: targets.length, data: targets });
  }
  const specialPermanentMatch = path.match(/^\/residents\/([^/]+)\/special-permanent$/);
  if (specialPermanentMatch && req.method === "GET") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const resident = state.residents.find((item) => item.residentId === specialPermanentMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    return json(res, 200, resident.specialPermanentCert ?? null);
  }
  if (specialPermanentMatch && req.method === "PUT") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const resident = state.residents.find((item) => item.residentId === specialPermanentMatch[1]);
    if (!resident) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    const result = updateSpecialPermanent(resident, body);
    if (result.status === 200) audit(user, "UPDATE", "SPECIAL_PERMANENT", resident.residentId, result.body);
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
    // 本人通知制度: 第三者・代理人請求なら登録済み本人へ通知
    const notification = triggerHonninTsuchi(body.residentId, issue, body.requesterType);
    if (notification) {
      audit(user, "NOTIFY", "HONNIN_TSUCHI", notification.notificationId, { residentId: body.residentId, requesterType: notification.requesterType });
    }
    return json(res, 201, { ...issue, honninTsuchi: notification });
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
      requiredApprovals: needsApproval ? 2 : 1,
      approvedCount: 0,
    });
  }

  const eucApproveMatch = path.match(/^\/euc\/([^/]+)\/approve$/);
  if (eucApproveMatch && req.method === "POST") {
    const body = await readBody(req);
    const action = (body.action || "APPROVE").toUpperCase();
    const isReject = action === "REJECT";
    return json(res, 200, {
      jobId: eucApproveMatch[1],
      status: isReject ? "FAILED" : "DONE",
      progress: 100,
      resultUrl: isReject ? null : `/api/v1/euc/${eucApproveMatch[1]}/result.zip`,
      error: isReject ? "Rejected by approver" : null,
      requiresSecondApproval: false,
      requiredApprovals: 2,
      approvedCount: isReject ? 0 : 2,
    });
  }

  // SCR-A01: EUC設計（再利用可能な抽出テンプレート）
  if (req.method === "GET" && path === "/euc-templates") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, state.eucTemplates);
  }
  if (req.method === "POST" && path === "/euc-templates") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    if (!body.name || !Array.isArray(body.outputFields) || body.outputFields.length === 0) {
      return json(res, 400, { code: "VALIDATION_ERROR", message: "name と outputFields(1件以上) は必須です。" });
    }
    const includeMyNumber = Boolean(body.includeMyNumber) || body.outputFields.includes("myNumber");
    const template = {
      id: `EUCT-${Date.now()}`,
      name: body.name,
      domain: body.domain || "RESIDENT",
      outputFields: body.outputFields,
      includeMyNumber,
      // 機微情報を含む抽出は二人承認が必要（/euc/query と整合）
      requiresSecondApproval: includeMyNumber,
      createdBy: user.userId,
      createdAt: new Date().toISOString(),
    };
    state.eucTemplates.unshift(template);
    audit(user, "CREATE", "EUC_TEMPLATE", template.id, { name: template.name, includeMyNumber });
    return json(res, 201, template);
  }
  const eucTemplateMatch = path.match(/^\/euc-templates\/([^/]+)$/);
  if (eucTemplateMatch && req.method === "DELETE") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const before = state.eucTemplates.length;
    state.eucTemplates = state.eucTemplates.filter((t) => t.id !== eucTemplateMatch[1]);
    if (state.eucTemplates.length === before) return json(res, 404, { code: "NOT_FOUND" });
    audit(user, "DELETE", "EUC_TEMPLATE", eucTemplateMatch[1], {});
    res.writeHead(204); return res.end();
  }

  // SCR-A01 → EUC実行: 保存テンプレートからEUC抽出を実行（機微情報含むと二人承認）
  const eucTemplateRunMatch = path.match(/^\/euc-templates\/([^/]+)\/run$/);
  if (eucTemplateRunMatch && req.method === "POST") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const tpl = state.eucTemplates.find((t) => t.id === eucTemplateRunMatch[1]);
    if (!tpl) return json(res, 404, { code: "NOT_FOUND", message: "テンプレートが見つかりません。" });
    const needsApproval = Boolean(tpl.requiresSecondApproval);
    const rows = state.residents.filter((r) => !r.movedOutDate).length;
    audit(user, "EXECUTE", "EUC_TEMPLATE", tpl.id, { name: tpl.name, needsApproval, rows });
    return json(res, 202, {
      jobId: `EUC-${Date.now()}`,
      templateId: tpl.id,
      templateName: tpl.name,
      outputFields: tpl.outputFields,
      estimatedRows: rows,
      status: needsApproval ? "QUEUED" : "DONE",
      requiresSecondApproval: needsApproval,
      requiredApprovals: needsApproval ? 2 : 1,
      approvedCount: 0,
      resultUrl: needsApproval ? null : `/euc/result.csv`,
      error: null,
    });
  }

  // バッチ管理（標準仕様書 9 バッチ / BAT-001〜）: 定義一覧・実行・履歴
  if (req.method === "GET" && path === "/batch-jobs") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, { types: BATCH_TYPES, history: state.batchJobs.slice(0, 100) });
  }
  const batchRunMatch = path.match(/^\/batch-jobs\/([A-Z_]+)\/run$/);
  if (batchRunMatch && req.method === "POST") {
    if (!canAction(user, "TRANSACTION")) return json(res, 403, { code: "FORBIDDEN" });
    const def = BATCH_TYPES.find((b) => b.type === batchRunMatch[1]);
    if (!def) return json(res, 404, { code: "NOT_FOUND", message: "未知のバッチ種別です。" });
    const job = runBatch(def, user);
    state.batchJobs.unshift(job);
    audit(user, "EXECUTE", "BATCH", job.jobId, { type: def.type, processed: job.processed });
    return json(res, 202, job);
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

  // 本人通知制度（SCR-801 / 標準仕様書 8.1）: 事前登録・廃止・登録一覧・通知記録
  if (req.method === "POST" && path === "/notify/registrations") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const target = state.residents.find((r) => r.residentId === body.residentId);
    if (!target) return json(res, 404, { code: "NOT_FOUND", message: "対象住民が見つかりません。" });
    if (activeNotifyRegistration(body.residentId)) {
      return json(res, 409, { code: "ALREADY_REGISTERED", message: "既に本人通知制度に登録済みです。" });
    }
    const now = new Date();
    const expires = new Date(now.getTime());
    expires.setFullYear(expires.getFullYear() + Number(body.years || 3));
    const registration = {
      registrationId: `HT-${Date.now()}`,
      residentId: body.residentId,
      registeredAt: now.toISOString(),
      expiresAt: expires.toISOString().slice(0, 10),
      status: "ACTIVE",
      note: body.note || "",
    };
    state.notifyRegistrations.unshift(registration);
    audit(user, "CREATE", "NOTIFY_REGISTRATION", registration.registrationId, { residentId: body.residentId });
    return json(res, 201, registration);
  }

  if (req.method === "GET" && path === "/notify/registrations") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, state.notifyRegistrations);
  }

  const notifyRegMatch = path.match(/^\/notify\/registrations\/([^/]+)$/);
  if (notifyRegMatch && req.method === "DELETE") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const reg = state.notifyRegistrations.find((r) => r.registrationId === notifyRegMatch[1]);
    if (!reg) return json(res, 404, { code: "NOT_FOUND" });
    reg.status = "INACTIVE";
    reg.endedAt = new Date().toISOString();
    audit(user, "DELETE", "NOTIFY_REGISTRATION", reg.registrationId, { residentId: reg.residentId });
    res.writeHead(204); return res.end();
  }

  if (req.method === "GET" && path === "/notify") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, state.notifications.slice(0, 100));
  }

  // コンビニ交付（SCR-507）: J-LIS 連携状態・交付要求受領・履歴
  if (req.method === "GET" && path === "/certificates/conveni/status") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, conveniLinkStatus());
  }

  if (req.method === "GET" && path === "/certificates/conveni") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, state.conveniRequests.slice(0, 100));
  }

  if (req.method === "POST" && path === "/certificates/conveni") {
    // J-LIS 中間サーバからの交付要求（連携入力）。抑止対象は REFUSED。
    const body = await readBody(req);
    if (!body?.residentId) return json(res, 400, { code: "VALIDATION_ERROR", message: "residentId は必須です。" });
    const record = receiveConveniRequest(body);
    audit(user, "RECEIVE", "CONVENI_CERTIFICATE", record.conveniId, { residentId: body.residentId, status: record.status });
    const status = record.status === "ISSUED" ? 201 : record.status === "NOT_FOUND" ? 404 : 200;
    return json(res, status, record);
  }

  // SCR-A04: エラー・アラート設定 / アクセスログ分析
  if (req.method === "GET" && path === "/alert-rules") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    return json(res, 200, state.alertRules);
  }
  if (req.method === "PUT" && path === "/alert-rules") {
    if (!canAction(user, "RESTRICTION_MANAGE") && !user.roles?.includes("ADMIN")) return json(res, 403, { code: "FORBIDDEN" });
    const body = await readBody(req);
    const next = { ...state.alertRules };
    for (const k of ["nightAccessEnabled", "bulkSearchEnabled"]) if (typeof body[k] === "boolean") next[k] = body[k];
    for (const k of ["nightStartHour", "nightEndHour", "bulkSearchThreshold"]) if (Number.isFinite(Number(body[k]))) next[k] = Number(body[k]);
    state.alertRules = next;
    audit(user, "UPDATE", "ALERT_RULES", "*", next);
    return json(res, 200, next);
  }
  if (req.method === "GET" && path === "/alerts") {
    if (!canAction(user, "VIEW")) return json(res, 403, { code: "FORBIDDEN" });
    const alerts = analyzeAlerts(state.alertRules, state.auditLogs);
    return json(res, 200, { rules: state.alertRules, total: alerts.length, alerts });
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
