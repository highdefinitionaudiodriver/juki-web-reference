# Codex → Claude 引き継ぎメモ #26

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_25.md`（Codex round 25: PDF/A veraPDF CI + CertificatePdfIT）

## 1. このラウンドで完了したこと

### A. Keycloak realm に department claim を追加

変更: `apps/api-spring/keycloak-realm/juki-realm.json`

`AuthController#me` は JWT の `department` claim を返す実装だが、Keycloak realm 側には `department` mapper とユーザ属性が未設定だった。

今回、以下を追加:

- 各テストユーザに `attributes.department`
  - `window`: `住民課 窓口係`
  - `review`: `住民課 審査係`
  - `admin-user`: `情報政策課`
- `department-to-claim` protocol mapper
  - `protocolMapper`: `oidc-usermodel-attribute-mapper`
  - `user.attribute`: `department`
  - `claim.name`: `department`
  - `access.token.claim`: `true`
  - `id.token.claim`: `true`
  - `userinfo.token.claim`: `true`

これで Keycloak 実トークンの `/api/v1/me` が `sub` / `name` / `department` / `roles` を返せる構成になった。

### B. Keycloak realm 静的チェックを追加

新規: `tools/check-keycloak-realm.mjs`

検証内容:

- client `juki-web` が存在する
- `roles` mapper が存在し、access token に multivalued で出る
- `department` mapper が存在し、`department` user attribute を access token に出す
- テストユーザ `window` / `review` / `admin-user` が存在する
- 各テストユーザに `department` 属性と realm role がある

`package.json` の `npm run check` に組み込み済み。

```json
"check": "node --check apps/api/src/server.js && node tools/check-keycloak-realm.mjs && npm run web:typecheck"
```

### C. JwtAuthenticationConverter のロール変換テスト追加

新規: `apps/api-spring/src/test/java/jp/go/local/resident/config/SecurityConfigTest.java`

Keycloak の `roles` claim:

```json
["ADMIN", "RESTRICTION_RELEASE", "ROLE_REVIEW"]
```

を Spring Security authority:

```text
ROLE_ADMIN
ROLE_RESTRICTION_RELEASE
ROLE_REVIEW
```

に変換することを固定。

### D. OIDC 手順書更新

変更: `docs/oidc_setup.md`

- `department` claim を構成表に追加
- テストユーザ表へ所属を追加
- `/api/v1/me` が `sub` / `name` / `department` / `roles` を返す前提を追記

### E. テスト件数ドキュメント更新

変更:
- `README.md`
- `docs/gap_matrix.md`

Spring テスト件数を `91 件（73 PASS + 18 SKIP）` に更新。README の全体合計も `155 ケース` に更新。

## 2. 検証結果

```powershell
npm run check
```

結果:

```text
Keycloak realm check passed.
web:typecheck PASS
```

```powershell
mvn -B test
```

結果:

```text
Tests run: 91, Failures: 0, Errors: 0, Skipped: 18
BUILD SUCCESS
```

```powershell
node --check tools\check-keycloak-realm.mjs
git diff --check
```

結果:

```text
OK
```

## 3. コミット

- `d4dfcf6 test: validate keycloak oidc claims`
- `CLAUDE_HANDOFF_26.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `tools/check-keycloak-realm.mjs`
- `apps/api-spring/src/test/java/jp/go/local/resident/config/SecurityConfigTest.java`
- `CLAUDE_HANDOFF_26.md`

### 変更

- `apps/api-spring/keycloak-realm/juki-realm.json`
- `package.json`
- `docs/oidc_setup.md`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. GitHub Actions 実行結果確認

- `spring` job で Docker あり Testcontainers 18 件が PASS するか
- `pdfa-verify` job が Docker build → Spring 起動 → veraPDF まで PASS するか
- `web-and-node` job の `npm run check` で `check-keycloak-realm.mjs` が PASS するか

### B. Keycloak + Spring + Web の実 OIDC E2E

- `tests/e2e/spring-oidc.spec.ts` 新設
- Keycloak dev realm 起動
- password grant または browser PKCE で access token を取得
- `/api/v1/me` が `name` / `department` / `roles` を返すことを実トークンで確認
- ロール不足時に `@PreAuthorize` 付き endpoint が 403 になることを確認

### C. PDF/A 実装の残リスク

- veraPDF 結果が不合格なら ICC profile / font path を調整
- `CERT_FONT_SERIF_JP` の Docker 内実ファイルパス確認

### D. EUC / Report の後続改善

- EUC 結果ファイル生成・パスワード付 ZIP 配信
- `report_request.status` の値体系整理

## 6. 注意点

- Keycloak realm import 済みの既存 volume がある環境では、`juki-realm.json` の変更は自動再投入されない。検証時は `keycloak_data` volume を削除するか realm を再 import する。
- `department` は user attribute mapper なので、テストユーザ以外も本番では user attribute 設定が必要。
- README の合計 155 は Node smoke 1 件を含む。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_25.md → CLAUDE_HANDOFF_26.md を読んで続きから。

Codex round 26 追加分:
- Keycloak realm に department user attribute と department-to-claim mapper を追加
- tools/check-keycloak-realm.mjs を追加し npm run check に組み込み
- SecurityConfigTest で roles claim → ROLE_* authority 変換を固定
- docs/oidc_setup.md を department claim 前提に更新
- README / docs/gap_matrix.md を Spring 91 件・合計 155 ケースへ更新

確認済み:
- npm run check: PASS
- mvn -B test: 91 件 (73 PASS + 18 SKIP), BUILD SUCCESS
- node --check tools/check-keycloak-realm.mjs: PASS
- git diff --check: OK

次の優先:
A. GitHub Actions 上で spring / pdfa-verify / web-and-node の実結果確認
B. Keycloak + Spring + Web の実 OIDC E2E
C. PDF/A veraPDF 結果が不合格なら ICC profile / font path を調整
D. EUC 結果ファイル生成・パスワード付 ZIP 配信

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
