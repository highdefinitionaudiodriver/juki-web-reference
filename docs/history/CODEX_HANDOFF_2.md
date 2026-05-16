# Codex → Claude Code 引き継ぎメモ #2

最終更新: 2026-05-16
担当: Codex
対象: `G:\マイドライブ\claudecode\住民記録システム_Web版`
前回入力: `CLAUDE_HANDOFF_2.md`

## 1. 今回実施したこと

Claude の `CLAUDE_HANDOFF_2.md` セクション 5 のうち、主に A「Spring Boot 本実装の続き」と、既知リスクの Node API 抑止漏れを進めた。

### Node API / E2E

- `apps/api/src/server.js`
  - `/api/v1/residents/{id}/history` に抑止対象の存在隠蔽を追加。
  - WINDOW 等の解除権限なしロールでは、抑止対象住民の履歴も `404` を返す。
  - Playwright API E2E で直接 import 起動できるよう、直接実行時だけ `server.listen()` する main guard を追加。
  - `SIGTERM` / `SIGINT` の明示的な shutdown を追加。

- `tests/e2e/golden-path.api.spec.ts`
  - DV 抑止対象の詳細・履歴が WINDOW ロールから `404` になる回帰テストを追加。
  - テスト内で Node API サーバーを `beforeAll` 起動、`afterAll` 停止する方式に変更。

- `playwright.api.config.ts`
  - API E2E 専用設定を追加。
  - `webServer` 管理を使わないため、Windows 上での終了待ちハングを解消。

- `package.json`
  - `e2e:api` を `playwright test -c playwright.api.config.ts` に変更。

### Spring Boot API

追加:

- `apps/api-spring/src/main/java/jp/go/local/resident/authz/MaskService.java`
  - Node 版 `applyResidentMask` 相当の足場。
  - 現時点では `resident.restricted_flag` による抑止存在隠蔽を実装。
  - 個人番号・住民票コードは Spring 側の `Resident` が直接持たないため、`jumin_code` / `my_number` Repository 実装時に拡張予定。

- `apps/api-spring/src/main/java/jp/go/local/resident/api/TransactionController.java`
  - `/transactions/in`
  - `/transactions/out`
  - `/transactions/move`
  - `/transactions/household`
  - `/transactions/official`
  - `/transactions/{txId}/approve`
  - `/transactions/cancel`
  - `/transactions/birth`
  - `/transactions/death`
  - `/transactions/koseki`

- `apps/api-spring/src/main/java/jp/go/local/resident/api/CertificateController.java`
  - `/certificates/jumin`
  - `/certificates/items`
  - `/certificates/removed`
  - `/certificates/inspection`
  - `/certificates/out`
  - `/verify/{token}`

- `apps/api-spring/src/main/java/jp/go/local/resident/api/RestrictionController.java`
  - `/restrictions` POST
  - `/restrictions/{id}` DELETE
  - `@PreAuthorize("hasRole('RESTRICTION_RELEASE')")` で保護。

- `apps/api-spring/src/main/java/jp/go/local/resident/api/AuditController.java`
  - `/audit` GET

- `apps/api-spring/src/main/java/jp/go/local/resident/api/ReportController.java`
  - `/reports/annual`
  - `/reports/population`
  - `/reports/{jobId}`

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
  - `/euc/query`
  - 個人番号を含む場合 `requiresSecondApproval = true`。

- `apps/api-spring/src/main/java/jp/go/local/resident/api/LinkController.java`
  - `/link/cs/inbound`
  - `/link/number/inbound`
  - `/link/internal/{partner}`
  - `/link/application/inbound`

- `apps/api-spring/src/main/java/jp/go/local/resident/api/AdminController.java`
  - `/admin/users`
  - `/admin/roles`
  - `/admin/permissions`
  - クラス単位で `@PreAuthorize("hasRole('ADMIN')")`。

- `apps/api-spring/src/main/java/jp/go/local/resident/api/ResidentSupplementController.java`
  - `/residents/{residentId}/alias`
  - `/residents/{residentId}/foreigner`
  - `/codes/jumin`
  - `/codes/mynumber`

変更:

- `apps/api-spring/src/main/java/jp/go/local/resident/config/SecurityConfig.java`
  - `@EnableMethodSecurity` を追加。
  - `JwtAuthenticationConverter` を追加し、JWT `roles` claim を `ROLE_*` GrantedAuthority に変換。

- `apps/api-spring/src/main/java/jp/go/local/resident/api/ResidentController.java`
  - `MaskService` を利用。
  - 検索・詳細で抑止対象を権限なし利用者から隠蔽。
  - `page` / `size` をレスポンスへ反映。

## 2. 確認済み

以下は PASS。

```powershell
npm run check
npm run smoke
npm run e2e:api
```

結果:

- `npm run check`: Node API 構文チェック + Web TypeScript typecheck 成功
- `npm run smoke`: Node authz smoke 成功
- `npm run e2e:api`: 4件成功、正常終了

API E2E:

1. 転入 → 住民票発行 → verify → 転出 → 取消
2. DV 抑止対象者は WINDOW ロールから検索不可視
3. DV 抑止対象者の詳細・履歴は WINDOW ロールから `404`
4. 個人番号は WINDOW でマスク、ADMIN + unmask で平文

## 3. 未確認 / 注意

- この環境には `mvn` が無く、`apps/api-spring` の Java コンパイルは未実行。
- Spring 側はDBスキーマに沿った薄いコントローラ実装。業務ロジック、入力検証、例外ハンドリング、監査ログ記録はまだ本実装ではない。
- `TransactionController` は最低限のDB更新を行うが、SCD-2の `resident_history.snapshot` は未対応。
- Spring 側の個人番号・住民票コードは `jumin_code` / `my_number` テーブルへ登録するだけで、詳細取得時の結合・項目別マスクは未実装。
- Link API の `payload` は現状 `{}` を保存。受信電文のJSON保存は未実装。
- Certificate API はDBへ `certificate_issue` を登録するが、PDF/A生成と `GET /certificates/{issueId}/pdf` は未実装。
- `docs/gap_matrix.md` はClaude作成時点の内容のまま。今回のSpring追加分を反映して更新するとよい。
- このフォルダは確認時点で Git リポジトリではない。

## 4. 次にClaude Codeへお願いしたいこと

優先順:

1. `apps/api-spring` を Maven がある環境でコンパイルし、型・SQL・Security設定の不整合を修正。
2. `@SpringBootTest` + Testcontainers PostgreSQL で、今回追加したコントローラの最小テストを追加。
3. `MaskService` を `jumin_code` / `my_number` まで拡張し、Spring側でも項目別マスクを実装。
4. `HistoryWriter` を追加し、異動反映時に `resident_history.snapshot` を書く。
5. `GET /residents/{id}?asOf=...` を `resident_history` 参照へ対応。
6. Spring API が安定したら `apps/web/vite.config.ts` proxy を `http://localhost:8788` へ切り替え。
7. `docs/gap_matrix.md` を v0.3 として更新。

## 5. 最小再開プロンプト

```text
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_2.md と CODEX_HANDOFF_2.md を読んで続きから進めて。
Codex は Spring Boot 側に MaskService と主要Controllerを追加し、
Node API の /residents/{id}/history 抑止漏れを修正済み。
npm run check / npm run smoke / npm run e2e:api は PASS。
ただし mvn が無い環境だったため apps/api-spring のコンパイルは未確認。
まず apps/api-spring を mvn test で確認し、コンパイルエラーがあれば直して。
```
