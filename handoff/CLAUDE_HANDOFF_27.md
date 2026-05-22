# Codex → Claude 引き継ぎメモ #27

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_26.md`（Codex round 26: Keycloak department claim + realm 静的チェック）

## 1. このラウンドで完了したこと

### A. Spring OIDC E2E spec 追加

新規: `tests/e2e/spring-oidc.spec.ts`

Keycloak dev realm から password grant で access token を取得し、Spring API に対して実 Bearer token で以下を検証する。

| テスト | 内容 |
| --- | --- |
| `/me returns Keycloak mapped name, department and roles` | `admin-user` token で `/api/v1/me` を呼び、`fullName=管理 次郎` / `department=情報政策課` / `roles` を確認 |
| `role shortage is rejected by Spring method security` | `window` token で `/api/v1/admin/users` を呼び、`@PreAuthorize("hasRole('ADMIN')")` により 403 |
| `invalid bearer token is rejected` | 不正 Bearer token で `/api/v1/me` が 401 |

通常ローカル/CI を壊さないよう、`SPRING_OIDC_E2E=true` のときだけ実行する。未設定時は skip。

### B. Spring E2E config の説明更新

変更: `playwright.spring.config.ts`

`SPRING_OIDC_E2E=true` のときだけ OIDC E2E を実行すること、Keycloak dev realm と Spring `OIDC_ISSUER=http://localhost:8080/realms/juki` が必要なことをコメントに追記。

### C. OIDC 手順書に Playwright 実行手順を追記

変更: `docs/oidc_setup.md`

追記した内容:

- `docker compose -f apps/api-spring/docker-compose.yaml up -d postgres keycloak`
- Spring を `OIDC_ISSUER=http://localhost:8080/realms/juki` で起動
- 別ターミナルで以下を設定して `npm run e2e:spring`

```powershell
$env:SPRING_OIDC_E2E = "true"
$env:KEYCLOAK_TOKEN_URL = "http://localhost:8080/realms/juki/protocol/openid-connect/token"
$env:KEYCLOAK_CLIENT_ID = "juki-web"
$env:SPRING_BASE_URL = "http://localhost:8788"
```

### D. GitHub Actions に Spring OIDC E2E ジョブ追加

変更: `.github/workflows/ci.yml`

新規 job: `spring-oidc-e2e`

処理:

1. Node.js 24 / Java 21 setup
2. `npm ci`
3. `docker compose -f apps/api-spring/docker-compose.yaml up -d postgres keycloak`
4. Keycloak realm well-known endpoint を待機
5. Spring jar build
6. Spring API を `OIDC_ISSUER=http://localhost:8080/realms/juki` で起動
7. `/actuator/health` 待機
8. `SPRING_OIDC_E2E=true` で `tests/e2e/spring-oidc.spec.ts` を実行
9. 失敗時に Spring / Keycloak logs を出力、artifact 保存
10. Spring と compose containers を停止

## 2. 検証結果

```powershell
node --check tests\e2e\spring-oidc.spec.ts
npm run check
node -e "const fs=require('fs'); const yaml=require('js-yaml'); yaml.load(fs.readFileSync('.github/workflows/ci.yml','utf8')); console.log('yaml ok')"
git diff --check
```

結果:

```text
npm run check: PASS
Keycloak realm check passed.
web:typecheck PASS
workflow yaml parse: yaml ok
git diff --check: OK
```

ローカル Docker/Keycloak/Spring 起動は未実行のため、`spring-oidc-e2e` job の実通過は GitHub Actions 上で要確認。

## 3. コミット

- `aefb726 test: add spring oidc e2e scaffold`
- `9c15718 ci: add spring oidc e2e job`
- `CLAUDE_HANDOFF_27.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `tests/e2e/spring-oidc.spec.ts`
- `CLAUDE_HANDOFF_27.md`

### 変更

- `.github/workflows/ci.yml`
- `playwright.spring.config.ts`
- `docs/oidc_setup.md`

## 5. 残タスク優先順

### A. GitHub Actions 実行結果確認

- `spring-oidc-e2e` が Keycloak realm import → token 発行 → `/me` → 403/401 まで PASS するか
- `pdfa-verify` が veraPDF まで PASS するか
- `spring` job で Testcontainers 18 件が PASS するか
- `openapi-diff` job の Spring 起動待機が安定しているか

### B. Spring OIDC E2E 失敗時の想定調整

- Keycloak realm import 済み volume が古い場合は `docker compose down -v` が必要
- token の `name` claim が `管理 次郎` ではなく Keycloak 形式差で変わる場合、realm mapper またはテスト期待値を調整
- GitHub runner で Keycloak 起動が遅い場合、well-known 待機回数を増やす

### C. PDF/A 実装の残リスク

- veraPDF 結果が不合格なら ICC profile / font path を調整
- `CERT_FONT_SERIF_JP` の Docker 内実ファイルパス確認

### D. EUC / Report の後続改善

- EUC 結果ファイル生成・パスワード付 ZIP 配信
- `report_request.status` の値体系整理

## 6. 注意点

- `spring-oidc.spec.ts` は `SPRING_OIDC_E2E=true` がないと skip する。通常の `npm run e2e:spring` では Spring smoke 3 件のみ実行され、OIDC 3 件は skip。
- CI job は `docker compose down -v` を実行するため、realm import は毎回 fresh。
- `spring-oidc-e2e` は実 Keycloak を使うため、Node API の dev JWT とは無関係。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_26.md → CLAUDE_HANDOFF_27.md を読んで続きから。

Codex round 27 追加分:
- tests/e2e/spring-oidc.spec.ts を追加
- Spring OIDC E2E は SPRING_OIDC_E2E=true のときのみ実行
- GitHub Actions に spring-oidc-e2e job を追加
- docs/oidc_setup.md に Playwright 実行手順を追記

確認済み:
- npm run check: PASS
- node --check tests/e2e/spring-oidc.spec.ts: PASS
- .github/workflows/ci.yml js-yaml parse: PASS
- git diff --check: OK

次の優先:
A. GitHub Actions 上で spring-oidc-e2e / pdfa-verify / spring / openapi-diff の実結果確認
B. OIDC E2E 失敗時の Keycloak realm / wait / expected claim 調整
C. PDF/A veraPDF 結果が不合格なら ICC profile / font path を調整
D. EUC 結果ファイル生成・パスワード付 ZIP 配信

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
