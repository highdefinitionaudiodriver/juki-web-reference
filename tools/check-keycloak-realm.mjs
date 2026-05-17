import fs from "node:fs";

const realmPath = "apps/api-spring/keycloak-realm/juki-realm.json";
const realm = JSON.parse(fs.readFileSync(realmPath, "utf8"));

function fail(message) {
  console.error(`Keycloak realm check failed: ${message}`);
  process.exitCode = 1;
}

const client = realm.clients?.find((item) => item.clientId === "juki-web");
if (!client) {
  fail("client juki-web is missing");
}

const mappers = client?.protocolMappers ?? [];
const rolesMapper = mappers.find((mapper) => mapper.config?.["claim.name"] === "roles");
if (!rolesMapper) {
  fail("roles protocol mapper is missing");
} else {
  if (rolesMapper.protocolMapper !== "oidc-usermodel-realm-role-mapper") {
    fail("roles mapper must be oidc-usermodel-realm-role-mapper");
  }
  if (rolesMapper.config?.["access.token.claim"] !== "true") {
    fail("roles mapper must emit to access token");
  }
  if (rolesMapper.config?.multivalued !== "true") {
    fail("roles mapper must be multivalued");
  }
}

const departmentMapper = mappers.find((mapper) => mapper.config?.["claim.name"] === "department");
if (!departmentMapper) {
  fail("department protocol mapper is missing");
} else {
  if (departmentMapper.protocolMapper !== "oidc-usermodel-attribute-mapper") {
    fail("department mapper must be oidc-usermodel-attribute-mapper");
  }
  if (departmentMapper.config?.["user.attribute"] !== "department") {
    fail("department mapper must read the department user attribute");
  }
  if (departmentMapper.config?.["access.token.claim"] !== "true") {
    fail("department mapper must emit to access token");
  }
}

for (const username of ["window", "review", "admin-user"]) {
  const user = realm.users?.find((item) => item.username === username);
  if (!user) {
    fail(`test user ${username} is missing`);
    continue;
  }
  const department = user.attributes?.department;
  if (!Array.isArray(department) || department.length === 0 || !department[0]) {
    fail(`test user ${username} must have a department attribute`);
  }
  if (!Array.isArray(user.realmRoles) || user.realmRoles.length === 0) {
    fail(`test user ${username} must have realm roles`);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("Keycloak realm check passed.");
