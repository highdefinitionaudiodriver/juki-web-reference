# OIDC IdP セットアップ（Keycloak 開発用）

開発用に Keycloak コンテナを `apps/api-spring/docker-compose.yaml` に同梱しています。  
この手順で起動すると、自前で realm/client/user を作成しなくても **そのまま OIDC ログインが回ります**。

## 1. 起動

```powershell
docker compose -f apps/api-spring/docker-compose.yaml up -d keycloak postgres
```

Keycloak は `--import-realm` で `apps/api-spring/keycloak-realm/juki-realm.json` を自動投入します。
ブラウザで http://localhost:8080 を開き、`admin / admin` でログインすると realm 「juki」が
作成済みになっています。

## 2. 投入される構成

| 種別 | 値 |
|---|---|
| Realm | `juki` |
| Client (public, PKCE 推奨) | `juki-web` |
| Redirect URIs | `http://localhost:{5173,8787,8788}/*` |
| Realm Roles | `WINDOW`, `REVIEW`, `RESTRICTION_RELEASE`, `ADMIN` |
| Token Claim | `roles`（Realm Role を access/id token に String[] として埋め込み） |

### テストユーザ

| ユーザ | パスワード | ロール |
|---|---|---|
| `window` | `password` | WINDOW |
| `review` | `password` | WINDOW, REVIEW |
| `admin-user` | `password` | WINDOW, REVIEW, RESTRICTION_RELEASE, ADMIN |

## 3. Spring 側の差し替え

`apps/api-spring/src/main/resources/application.yaml`:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://localhost:8080/realms/juki
```

または環境変数：

```powershell
$env:OIDC_ISSUER = "http://localhost:8080/realms/juki"
mvn -B spring-boot:run
```

Spring 起動時に `/realms/juki/.well-known/openid-configuration` を取得し、JWKS 経由で
ID Token を検証します。`JwtAuthenticationConverter` が `roles` claim を `ROLE_*` に展開する
ので、`@PreAuthorize("hasRole('ADMIN')")` 等がそのまま効きます。

## 4. Web 側からのログイン

現状 `apps/web/src/auth.ts` は dev IdP（apps/api の HS256 JWT）に直接ログインする実装です。
本番 Keycloak と連携するには **Authorization Code Flow + PKCE** に書き換えが必要です。

簡易方式（dev）：`docker compose up -d` 後に curl で password grant トークンを取得：

```powershell
$body = @{
  grant_type = "password"
  client_id  = "juki-web"
  username   = "admin-user"
  password   = "password"
}
$res = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/realms/juki/protocol/openid-connect/token" -Body $body
$token = $res.access_token
curl http://localhost:8788/api/v1/residents/search -X POST `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{}"
```

## 5. 本番運用での差し替えポイント

- `juki-realm.json` のパスワード（テストユーザ）は **必ず削除**
- Client を public → confidential に変更し、`client_secret` を Spring の `application.yaml` で管理
- TLS 必須化（`KC_HOSTNAME_STRICT=true`、リバースプロキシで HTTPS 終端）
- `accessTokenLifespan` を業務要件に合わせて短縮（推奨 5〜15 分）
- メソッドレベル `@PreAuthorize` を Controller 全体に展開
