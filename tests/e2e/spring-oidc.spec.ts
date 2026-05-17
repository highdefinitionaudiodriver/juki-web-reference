import { expect, test } from "@playwright/test";

const tokenUrl = process.env.KEYCLOAK_TOKEN_URL ?? "http://localhost:8080/realms/juki/protocol/openid-connect/token";
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "juki-web";
const enabled = process.env.SPRING_OIDC_E2E === "true";

type TokenResponse = {
  access_token: string;
  token_type: string;
};

async function tokenFor(username: string, password = "password"): Promise<string> {
  const form = new URLSearchParams();
  form.set("grant_type", "password");
  form.set("client_id", clientId);
  form.set("username", username);
  form.set("password", password);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new Error(`Keycloak token request failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as TokenResponse;
  return body.access_token;
}

test.describe("Spring API OIDC integration", () => {
  test.skip(!enabled, "Set SPRING_OIDC_E2E=true with Keycloak and Spring running to execute OIDC E2E.");

  test("/me returns Keycloak mapped name, department and roles", async ({ request }) => {
    const token = await tokenFor("admin-user");
    const res = await request.get("/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeTruthy();
    expect(body.fullName).toBe("管理 次郎");
    expect(body.department).toBe("情報政策課");
    expect(body.roles).toEqual(expect.arrayContaining(["ADMIN", "RESTRICTION_RELEASE", "REVIEW", "WINDOW"]));
  });

  test("role shortage is rejected by Spring method security", async ({ request }) => {
    const token = await tokenFor("window");
    const res = await request.get("/api/v1/admin/users", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(403);
  });

  test("invalid bearer token is rejected", async ({ request }) => {
    const res = await request.get("/api/v1/me", {
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(res.status()).toBe(401);
  });
});
