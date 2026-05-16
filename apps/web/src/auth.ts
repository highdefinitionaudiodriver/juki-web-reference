/**
 * 認証トークンの保持と要求への自動付与。
 *
 * - 開発用: /api/v1/auth/login の HS256 JWT を保持
 * - Keycloak 等: Authorization Code + PKCE で access_token を取得
 * - WebAuthn は /auth/webauthn/* の dev スタブを呼び出す
 */

const KEY = "rrw.accessToken";
const ID_TOKEN_KEY = "rrw.idToken";
const PKCE_VERIFIER_KEY = "rrw.pkce.verifier";
const PKCE_STATE_KEY = "rrw.pkce.state";
const PKCE_RETURN_KEY = "rrw.pkce.returnTo";

type OidcConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope: string;
};

function oidcConfig(): OidcConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  const issuer = env.VITE_OIDC_ISSUER || "http://localhost:8080/realms/juki";
  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId: env.VITE_OIDC_CLIENT_ID || "juki-web",
    redirectUri: env.VITE_OIDC_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`,
    scope: env.VITE_OIDC_SCOPE || "openid profile email",
  };
}

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

function setIdToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ID_TOKEN_KEY, token);
    else localStorage.removeItem(ID_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getIdToken(): string | null {
  try {
    return localStorage.getItem(ID_TOKEN_KEY);
  } catch {
    return null;
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

export async function startOidcLogin() {
  const cfg = oidcConfig();
  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_RETURN_KEY, `${window.location.pathname}${window.location.search}${window.location.hash}`);

  const authorize = new URL(`${cfg.issuer}/protocol/openid-connect/auth`);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", cfg.scope);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  window.location.assign(authorize.toString());
}

export async function completeOidcLoginFromRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  if (error) throw new Error(params.get("error_description") || error);
  if (!code && !state) return false;
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    throw new Error("OIDC state verification failed");
  }

  const cfg = oidcConfig();
  const tokenRes = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`OIDC token exchange failed ${tokenRes.status}`);
  const token = await tokenRes.json();
  setToken(token.access_token);
  setIdToken(token.id_token || null);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  const returnTo = sessionStorage.getItem(PKCE_RETURN_KEY) || window.location.pathname;
  sessionStorage.removeItem(PKCE_RETURN_KEY);
  window.history.replaceState({}, document.title, returnTo.replace(/[?&](code|state|session_state)=[^&#]*/g, ""));
  return true;
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
  const idToken = getIdToken();
  setToken(null);
  setIdToken(null);
  fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
  const env = import.meta.env as Record<string, string | undefined>;
  if (idToken && env.VITE_OIDC_LOGOUT === "true") {
    const cfg = oidcConfig();
    const endSession = new URL(`${cfg.issuer}/protocol/openid-connect/logout`);
    endSession.searchParams.set("id_token_hint", idToken);
    endSession.searchParams.set("post_logout_redirect_uri", cfg.redirectUri);
    window.location.assign(endSession.toString());
  }
}

function randomBase64Url(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(data: Uint8Array): string {
  let text = "";
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
