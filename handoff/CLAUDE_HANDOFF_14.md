# Claude → Codex 引き継ぎメモ #14

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_13.md`（Codex round 13: ReportController / ResidentController MockMvc）

## 1. このラウンドで完了したこと

### A. App.tsx 統合テスト

新規: `apps/web/src/App.test.tsx`（4 件、Vitest + RTL）

| テスト | 内容 |
| --- | --- |
| 起動時に me/searchResidents/resident/history を呼び住民検索ビューを描画 | useEffect 初期ロード |
| ナビボタンで各 view に切替できる | 異動 / 抑止設定 / 統計-EUC / 権限-監査 への遷移 |
| 権限/監査ビューの『監査ログ更新』で audit() が呼ばれる | onClick + side effect |
| 起動時に api.me が失敗すると notice にエラー表示 | エラーハンドリング |

`vi.mock("./api")` と `vi.mock("./auth")` で API/OIDC レイヤをスタブ化。
Vitest 合計 **21 件 PASS**（17 → 21）。

### B. OpenAPI diff CI ジョブ

`.github/workflows/ci.yml` に `openapi-diff` ジョブを追加:
- `services.postgres` (PG 16, healthcheck) を起動
- `mvn -B -DskipTests package` で Spring jar をビルド
- `nohup java -jar target/*.jar --spring.profiles.active=ci` で起動
- `npx wait-on` で `/v3/api-docs` と `/actuator/health` を待つ
- `npm run openapi:diff` で `c_openapi.yaml` ⇔ Spring runtime の operation 差分検出
- 失敗時に Spring log を `spring-openapi-diff-log` アーティファクトに保存

### C. Spring ci プロファイル

OpenAPI diff CI で JWKS 取得を回避するための最小構成:

- `apps/api-spring/src/main/resources/application-ci.yaml`:
  - `OAuth2ResourceServerAutoConfiguration` を除外
  - `issuer-uri` を空

- `apps/api-spring/src/main/java/.../config/CiSecurityConfig.java`:
  - `@Profile("ci")` で permitAll のみの SecurityFilterChain

- `apps/api-spring/src/main/java/.../config/SecurityConfig.java`:
  - `@Profile("!ci")` を付けて本番設定と隔離

`ci` プロファイルは OpenAPI diff など認可不要のスモーク専用。本番は常に `!ci`。

## 2. 検証結果

```
mvn -B test         61 件 (52 PASS + 9 SKIP / Docker なしの IT 群)
npm run check       PASS
npm run web:test    21 件 PASS (Vitest, App.test.tsx 4 件追加)
npm run smoke       PASS
npm run web:build   PASS (227.25 KB / gzip 71.19 KB)
npm run e2e:api     13 件 PASS（前回時点で確認済）
```

コミット: `984fd87 test+ci: App.tsx 統合テスト + OpenAPI diff CI ジョブ`

## 3. 変更ファイル

### 新規
- `apps/web/src/App.test.tsx`
- `apps/api-spring/src/main/java/jp/go/local/resident/config/CiSecurityConfig.java`
- `apps/api-spring/src/main/resources/application-ci.yaml`

### 変更
- `.github/workflows/ci.yml`（openapi-diff ジョブ追加）
- `apps/api-spring/src/main/java/jp/go/local/resident/config/SecurityConfig.java`
  （`@Profile("!ci")` を付加）

## 4. 残タスク優先順

### A. Keycloak + Spring + Web の実 E2E
- `tests/e2e/spring-oidc.spec.ts` 新設
- Keycloak コンテナを起動 → Web で PKCE ログイン → Spring API に Bearer access token でアクセス
- 失敗ケース（無効トークン、ロール不足）も検証
- CI job として組み込む（Keycloak + Spring + Web を services で並走）

### B. PDF/A veraPDF 実検証
- `apps/api-spring/Dockerfile` で build → コンテナ起動 → `/api/v1/certificates/{id}/pdf` を取得
- veraPDF (`verapdf --flavour 2b`) で PDF/A-2b 適合性検証
- CI に組み込む

### C. CI 安定化
- 今回追加した `openapi-diff` ジョブは実環境未検証。GitHub Actions の初回実行で
  失敗した場合は以下のいずれかが原因の可能性が高い:
  - Spring 起動時間が wait-on の 90秒を超える → タイムアウト延長
  - `ci` プロファイル下で Flyway は動くか確認（PG コンテナ + マイグレーション必要）
  - `wait-on` パッケージが root の devDependencies にあるが、`npx wait-on` が
    `npm ci` 後に解決できているか確認

### D. その他テスト
- `App.tsx` 統合テストの拡充: 検索フォームの入力 → 結果再取得
- `MoveView` / `OfficialView` での非同期コールバックの notify 確認
- a11y を一時的にも CI ですべて回すための Windows 固有 timeout 対策（前ラウンドから継続）

### E. ドキュメント
- `docs/gap_matrix.md` の更新（Spring テスト 61件、Vitest 21件、a11y 7画面）
- README に `ci` プロファイルと `openapi-diff` ジョブの説明を追記

## 5. 注意点

- **`ci` プロファイルは認可を完全に外す**。本番では `!ci` を絶対に有効化しないこと
- App.test.tsx は `vi.mock` を多用しており、リファクタで API 形が変わると壊れやすい
- `openapi-diff` ジョブは Spring 起動コストが高い（Maven 取得 + Spring Boot 起動）。
  CI 時間を節約するなら `pull_request` のみで `push` から外すのも一案
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 6. 設計トレーサビリティ

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts (auto-gen)
└─→ apps/web/src/types.ts → views/*.tsx [Vitest テスト]
└─→ apps/api/src/server.js
└─→ apps/api-spring/src/main/java/.../*.java [MockMvc + Testcontainers IT]
└─→ apps/api-spring runtime /v3/api-docs ← tools/openapi-diff.mjs ← CI で自動検証
```

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_13.md → CLAUDE_HANDOFF_14.md を読んで続きから。

Claude round 14 追加分:
- Vitest: App.test.tsx 4 件 (ナビ切替 / 監査ログ更新 / 起動エラー notice)
- CI: openapi-diff ジョブを追加 (Postgres service + Spring を ci プロファイルで起動 → diff)
- Spring: @Profile("ci") の CiSecurityConfig + application-ci.yaml で認可を外し JWKS 回避

確認済み:
- mvn -B test: 61 件 (52 PASS + 9 SKIP)
- npm run web:test: 21 件 PASS
- npm run check / smoke / web:build: 全 PASS
- openapi-diff CI ジョブは GitHub 上で初回実行待ち（実環境未検証）

次の優先 (CLAUDE_HANDOFF_14.md セクション 4):
A. Keycloak + Spring + Web の実 OIDC e2e (spring-oidc.spec.ts)
B. PDF/A veraPDF 検証 + CI 組み込み
C. openapi-diff ジョブの実環境調整（タイムアウト・Flyway 動作確認）
D. App.test.tsx の拡充、MoveView/OfficialView の onSuccess notify テスト
E. gap_matrix.md と README 更新

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
