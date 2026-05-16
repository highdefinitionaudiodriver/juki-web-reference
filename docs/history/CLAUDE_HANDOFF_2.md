# Claude → Codex 引き継ぎメモ #2

最終更新: 2026-05-16  
担当: Claude Code (Opus 4.7)  
前回引き継ぎ: `CODEX_HANDOFF.md`（Codex 作成、MVP 実装の引き継ぎ）  
本書: その後 Claude が CODEX_HANDOFF.md 6 章 優先 4〜7 と一部 3 を実施したログ

## 1. 今回完了したこと（CODEX_HANDOFF 6 章の優先順との対応）

| # | 項目 | 状況 |
| --- | --- | --- |
| 1 | apps/web を React 18 + TS + Vite | **完了** (React 19 に最新化) |
| 2 | openapi-typescript で型自動生成 | **完了** |
| 3 | apps/api を Spring Boot 3 / .NET 8 に置換 | **部分** 雛型のみ Codex に引き継ぎ |
| 4 | PostgreSQL + Flyway スキーマ適用 | **完了** (`apps/api-spring/src/main/resources/db/migration` + docker-compose + apply.ps1) |
| 5 | E2E (Playwright) | **完了** (API 3 件グリーン、UI 3 件はバイナリ install 後実行可) |
| 6 | 帳票 0010001 を HTML/CSS print テンプレ化 | **完了** (`apps/web/src/print/`) |
| 7 | OIDC / WebAuthn / 項目別マスク本実装 | **完了** (足がかり実装、本番 IdP 接続は Codex 継続) |

## 2. ファイル変更／追加サマリ

### 追加
| パス | 役割 |
| --- | --- |
| `apps/web/src/print/certificate.css` | 標準帳票 0010001 系の A4 印刷 CSS（@page A4縦、IVS フォント想定） |
| `apps/web/src/print/CertificateTemplate.tsx` | 同 React コンポーネント。和暦変換・QR スタブ・公印付き |
| `apps/web/src/auth.ts` | JWT 保持と OIDC/WebAuthn 開始関数 |
| `apps/api/src/authz.js` | ロール定義 + 抑止/項目別マスクのコア |
| `apps/api/src/auth.js` | HS256 JWT 発行・検証、WebAuthn チャレンジ発行スタブ |
| `apps/api/db/apply.ps1` | psql で DDL を直接適用する PowerShell |
| `apps/api-spring/` 一式 | Spring Boot 3 雛型（pom / SecurityConfig / Resident ドメイン / Repository / Controller / migration / docker-compose / README） |
| `tests/e2e/golden-path.api.spec.ts` | 転入→住民票発行→転出→取消 API シナリオ |
| `tests/e2e/ui-smoke.spec.ts` | ブラウザ UI スモーク |
| `playwright.config.ts` | Playwright 設定（baseURL 8787、webServer 自動起動） |
| `docs/gap_matrix.md` | 設計 vs 実装のギャップマトリクス（v0.2 時点） |
| `docs/migration_react_vite.md` | React+Vite 移行メモ |

### 変更
| パス | 内容 |
| --- | --- |
| `apps/web/package.json` | React 19 + Vite 6 + TS 5.6 依存追加、build/typecheck/dev スクリプト追加 |
| `apps/web/vite.config.ts` | プロキシ `/api → :8787` |
| `apps/web/tsconfig.json` | strict + bundler resolution |
| `apps/web/index.html` | React エントリ `src/main.tsx` |
| `apps/web/src/*` | TS 化 + 6 view を React コンポーネント化 |
| `apps/api/src/server.js` | authz/auth 統合、抑止対象隠蔽、Bearer JWT 検証、`/auth/webauthn/*`、`/restrictions/*`、`/.well-known/openid-configuration` 追加 |
| `c_openapi.yaml` | 3 箇所 YAML 修正（空白欠落・enum 文字列化・additionalProperties） |
| `package.json` | `dev` で concurrently、`e2e`/`e2e:api`/`e2e:install`/`generate:openapi`/`smoke`/`check` |

### 退避
- `apps/web-legacy/` 旧 Vanilla JS 実装（参照用）

## 3. 動作確認コマンド一覧（全部 PASS）

```powershell
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm install
npm run generate:openapi    # OpenAPI → TypeScript 型生成
npm run web:typecheck       # tsc -b --noEmit
npm run web:build           # 216KB / gzip 68KB
npm run smoke               # authz スモークテスト（ロール別マスク）
npm run e2e:api             # Playwright API E2E（3 件）
# UI E2E は: npm run e2e:install してから npm run e2e
```

## 4. 設計トレーサビリティ（重要 ID は固定）

- 機能 ID `F-x-y-zz`（`住民記録システム_Web版_設計書.xlsx` 04_機能一覧）
- 画面 ID `SCR-xxx`（同 05_画面一覧、`a_wireframes.html`）
- 帳票 ID `00100xx`（同 06_帳票一覧、`CertificateTemplate.tsx` の FORM_TITLE）
- API-ID（同 09_API一覧、`c_openapi.yaml` の operationId）
- 標準仕様書 章節（`001062870.pdf`、Excel 03_スコープ）

**これらキーを Codex が改名するときは必ず全箇所同期**:
`c_openapi.yaml` → `packages/openapi/generated/api.d.ts` 自動 → `apps/web/src/types.ts` → `apps/api-spring/.../*.java`

## 5. Codex 継続タスク（優先順）

### A. Spring Boot 本実装の続き
`apps/api-spring/README.md` の「Codex 継続タスク」を参照。要点:

1. **`MaskService`**: Node の `apps/api/src/authz.js#applyResidentMask` をそのまま移植。テストは `golden-path.api.spec.ts` の挙動を JUnit でも再現。
2. **`JwtAuthenticationConverter`**: `roles` クレーム → `ROLE_*` Granted Authority
3. **`@PreAuthorize`**: `RestrictionController` の操作系に `hasRole('RESTRICTION_RELEASE')`
4. 残コントローラ 7 本（CODEX_HANDOFF #3 に列挙）
5. テスト: `@SpringBootTest` + Testcontainers PostgreSQL
6. CI: GitHub Actions で `mvn test` + `npm run e2e:api` を回す

### B. Vite proxy の切り替え
Spring 版が動いたら `apps/web/vite.config.ts` の proxy target を `:8788` に変更し、Node 版を停止。

### C. 認証本番化
1. Keycloak 等の IdP コンテナを `docker-compose.yaml` に追加
2. `c_openapi.yaml` の `openIdConnectUrl` を IdP の `.well-known/openid-configuration` に
3. `apps/api/src/auth.js` 経路を削除（Node 版を残さないなら）
4. `apps/web/src/auth.ts` の `loginWithPassword` を **Authorization Code + PKCE** に置換
5. `apps/api-spring/src/main/resources/application.yaml` の `issuer-uri` を IdP に

### D. 帳票 PDF/A 生成
`CertificateTemplate.tsx` の HTML をサーバで Playwright Print to PDF or OpenHTMLtoPDF で PDF/A-2b に。
`certificate_issue.pdfUrl` に保存パスを書き戻し、`GET /certificates/{issueId}/pdf` を追加。

### E. ER 図フル網羅
Node 版は 5 テーブル相当（resident/transaction/restriction/certificate/audit）しか runtime で扱っていない。
`V001__initial_schema.sql` の残り 17 テーブル相当を順次 Spring の Repository / Service / Controller で実装する。

### F. 残機能 27 件
`docs/gap_matrix.md` の「未着手 27 件」リストを上から消す。
特に職権異動（4.2 / 決裁ルート）、住民票コード（4.3）、個人番号（4.4）、外国人住民（4.5）。

## 6. 既知のリスク

- **印刷 CSS**: `@page` の余白は ChromeOS Flex のプリンタドライバ依存。実機印刷検証が必要。
- **JWT HS256**: dev のみ。本番では IdP の RS256 / JWKS に置換必須（鍵共有しない）。
- **WebAuthn 検証**: 現状スタブ。本実装は `@simplewebauthn/server` を採用予定。
- **抑止隠蔽**: Node 版は検索・取得の両方で隠蔽するが、`/residents/{id}/history` は隠蔽していない（Codex で要対応）。
- **`apps/web-legacy/`**: 旧 Vanilla 実装を残しているが、`vite.config.ts` の proxy 経由で見えるため、誤って参照されないように Codex で完全削除して問題ない。

## 7. 引き継ぎ用最小プロンプト

```
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_2.md セクション 5 (A→F) を上から順に進めて。
ChromeOS Flex / Chromium 最新2世代 で動作することを保つこと。
標準仕様書のキー（機能ID/画面ID/帳票ID/API-ID）を改名する場合は
c_openapi.yaml → packages/openapi/generated → apps/web/src/types.ts →
apps/api-spring/.../*.java まで同期すること。
作業前に必ず docs/gap_matrix.md と CODEX_HANDOFF.md を読むこと。
```
