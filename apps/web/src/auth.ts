/**
 * 認証トークンの保持と要求への自動付与（dev OIDC 足がかり）
 *   - 本番では Authorization Code + PKCE フローに置換すること。
 *   - WebAuthn のチャレンジ取得は /auth/webauthn/challenge を呼び出す。
 */

const KEY = "rrw.accessToken";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function loginWithPassword(employeeId: string, password: string): Promise<string> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const json = await res.json();
  setToken(json.accessToken);
  return json.accessToken as string;
}

export async function loginWithWebAuthn(userId: string): Promise<string> {
  const challenge = await fetch("/api/v1/auth/webauthn/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  }).then((r) => r.json());
  // dev スタブ: 本実装では navigator.credentials.get() に challenge を渡す
  const verify = await fetch("/api/v1/auth/webauthn/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, assertion: { dev: true, challenge: challenge.challenge } }),
  });
  if (!verify.ok) throw new Error("webauthn failed");
  const json = await verify.json();
  setToken(json.accessToken);
  return json.accessToken as string;
}

export function logout() {
  setToken(null);
  fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
}
