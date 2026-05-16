// OIDC / WebAuthn 足がかり実装
//
// このモジュールは「本番では Keycloak 等の IdP に置換」を前提とした最小実装。
//   - dev モード: 開発用に署名済みダミー JWT を発行（OIDC ID Token モック）
//   - JWT 検証: HS256 のみ対応。RS256/JWKS は本実装時に追加。
//   - WebAuthn: 登録/認証のチャレンジ発行までスタブを用意。検証は本実装時に @simplewebauthn/server で行う。
//
// 本番の差し替えポイント（CODEX_HANDOFF.md セクション 6 参照）:
//   1. verifyAccessToken を JWKS 取得 + RS256 検証に置換
//   2. issueDevToken を削除し、OIDC Authorization Code Flow + PKCE を Web 側で実装
//   3. WebAuthn 検証を @simplewebauthn/server に置換
//   4. アクセストークン スコープ → ロール のマッピングを ROLES 定義と整合

import { createHmac, randomBytes } from "node:crypto";

const SECRET = process.env.JWT_DEV_SECRET || "dev-secret-rotate-me";
const ISSUER = process.env.OIDC_ISSUER || "http://localhost:8787/dev-idp";

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString();
}

export function issueDevToken({ userId, roles, fullName, department, expiresInSec = 3600 }) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    sub: userId,
    aud: "resident-record-web",
    iat: now,
    exp: now + expiresInSec,
    name: fullName,
    department,
    roles,
    auth_method: "DEV",
  };
  const head = b64u(JSON.stringify(header));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(createHmac("sha256", SECRET).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

export function verifyAccessToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = b64u(createHmac("sha256", SECRET).update(`${head}.${body}`).digest());
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(b64uDecode(body));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== ISSUER) return null;
    return payload;
  } catch {
    return null;
  }
}

// WebAuthn スタブ
const challenges = new Map();

export function newWebAuthnChallenge(userId) {
  const challenge = b64u(randomBytes(32));
  challenges.set(userId, { challenge, createdAt: Date.now() });
  // 本実装では PublicKeyCredentialCreationOptions / Request を返す
  return {
    challenge,
    rp: { id: "localhost", name: "住民記録 Web版" },
    user: { id: userId, name: userId, displayName: userId },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    timeout: 60_000,
    attestation: "none",
  };
}

export function verifyWebAuthnStub(userId, assertion) {
  const entry = challenges.get(userId);
  challenges.delete(userId);
  // スタブ: チャレンジが直近5分以内に発行されているかだけ確認
  if (!entry) return false;
  if (Date.now() - entry.createdAt > 5 * 60_000) return false;
  return Boolean(assertion);
}

// 認可ヘッダ抽出
export function extractBearer(req) {
  const auth = req.headers["authorization"];
  if (!auth || typeof auth !== "string") return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
