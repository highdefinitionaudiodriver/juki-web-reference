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
| Token Claim | `department`（ユーザ属性を access/id token に文字列として埋め込み） |

### テストユーザ

| ユーザ | パスワード | 所属 | ロール |
|---|---|---|---|
| `window` | `password` | 住民課 窓口係 | WINDOW |
| `review` | `password` | 住民課 審査係 | WINDOW, REVIEW |
| `admin-user` | `password` | 情報政策課 | WINDOW, REVIEW, RESTRICTION_RELEASE, ADMIN |

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
ので、`@PreAuthorize("hasRole('ADMIN')")` 等がそのまま効きます。`/api/v1/me` は
`sub` / `name` / `department` / `roles` を返すため、Keycloak realm には `roles` mapper と
`department` mapper の両方を入れています。

## 4. Web 側からのログイン（Authorization Code + PKCE）

`apps/web/src/auth.ts` は Authorization Code Flow + PKCE に対応済みです。
Web 画面左下の `OIDC` ボタンを押すと Keycloak のログイン画面へ遷移し、
戻りの `code/state` を検証して access token を保存します。以後の API 呼び出しは
`Authorization: Bearer <access_token>` を自動付与します。

### Vite dev server で確認

```powershell
$env:VITE_OIDC_ISSUER = "http://localhost:8080/realms/juki"
$env:VITE_OIDC_CLIENT_ID = "juki-web"
npm run web:dev
```

ブラウザで http://localhost:5173 を開き、`OIDC` ボタンからログインします。

### Node 一体配信で確認

```powershell
$env:VITE_OIDC_ISSUER = "http://localhost:8080/realms/juki"
$env:VITE_OIDC_CLIENT_ID = "juki-web"
npm run web:build
npm run api:dev
```

ブラウザで http://localhost:8787 を開き、`OIDC` ボタンからログインします。

### 設定キー

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `VITE_OIDC_ISSUER` | `http://localhost:8080/realms/juki` | Keycloak realm issuer |
| `VITE_OIDC_CLIENT_ID` | `juki-web` | public client ID |
| `VITE_OIDC_REDIRECT_URI` | 現在の origin + path | redirect URI |
| `VITE_OIDC_SCOPE` | `openid profile email` | 要求 scope |
| `VITE_OIDC_LOGOUT` | 未設定 | `true` の場合、logout 時に Keycloak end_session へ遷移 |

### curl での疎通確認

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
