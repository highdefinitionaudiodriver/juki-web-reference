# Claude → Codex 引き継ぎメモ #20

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_19.md`（Codex round 19: CertificateView/OfficialView 単体テスト）

## 1. このラウンドで完了したこと

### A. Spring MockMvc 残コントローラ 12 件追加

これで主要 API コントローラはほぼすべて MockMvc テスト被覆。

#### `AdminControllerTest.java` (新規 7 件)
クラスレベル `@PreAuthorize("hasRole('ADMIN')")` を検証:
- `users_get_withADMIN_returnsList`
- `users_get_withWINDOW_returns403`
- `roles_get_withADMIN_returnsList`
- `createUser_withADMIN_upserts`
- `createRole_withADMIN_upserts`
- `updatePermission_withADMIN_upserts`
- `createUser_withWINDOW_returns403`

`@EnableMethodSecurity` を `@TestConfiguration` で投入し、
`jwt().authorities("ROLE_ADMIN")` で直接ロール付与。

#### `AuditControllerTest.java` (新規 2 件)
- `list_returnsAuditLogs`
- `list_emptyResult_returns200WithEmptyArray`

#### `EucControllerTest.java` (新規 3 件)
標準仕様書 10.1 EUC：個人番号出力時の二段階承認を検証
- `query_withoutMyNumber_returnsDoneStatus`: DONE / 結果URL
- `query_withIncludeMyNumberFlag_returnsQueuedAndRequiresApproval`: QUEUED / requiresSecondApproval=true
- `query_withMyNumberInOutputFields_alsoRequiresApproval`: outputFields[] 経由でも要承認

### B. App.tsx フルパス統合テスト 1 件追加

`apps/web/src/App.test.tsx`:
- 「住民選択 → 異動ビュー → 最新異動を取消 → notice 表示」
  - `history` mock で取消対象 1 件を返し、`cancelTransaction` を動的に注入
  - `notify("異動取消を登録しました: TX-CANCEL")` の表示を確認

## 2. 検証結果

```
mvn -B test          78 件 (69 PASS + 9 SKIP)
                       — AdminController 7 / AuditController 2 / EucController 3 追加
npm run check        PASS
npm run web:test     42 件 PASS (8 ファイル)
npm run smoke        PASS
npm run web:build    PASS (227.25 KB / gzip 71.19 KB)
```

コミット: `d1137d2 test: Spring 残コントローラ 12 件 + App フルパス取消テスト`

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/test/java/jp/go/local/resident/api/AdminControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/AuditControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

### 変更
- `apps/web/src/App.test.tsx`（フルパス取消テスト 1 件追加）

## 4. テスト被覆サマリ

### Spring MockMvc / IT
| Controller | テスト数 | 備考 |
| --- | ---: | --- |
| AuthController | 3 | /me, /auth/login, /auth/logout |
| ResidentController | 6+2 | search/show/history/patch (+ asOf) |
| ResidentSupplementController | 5 | /codes/jumin, /codes/mynumber, /foreigner |
| TransactionController | 13 | birth/death/cancel/household/koseki/official/approve |
| CertificateController | 8 | form_id 別発行 / verify / pdf |
| RestrictionController | 6 | RESTRICTION_RELEASE @PreAuthorize |
| ReportController | 4 | annual/population/foreigner-expiring/{jobId} |
| LinkController | 7 | CS/NUMBER/TAX/CVS/KOSEKI |
| AdminController | 7 | @PreAuthorize('ADMIN') |
| AuditController | 2 | /audit |
| EucController | 3 | 個人番号二段階承認 |
| MaskService | 2 | 抑止判定 |
| CertificatePdfService | 1 | PDF 生成 |
| HouseholdSplitMergeIT | 2 (SKIP) | Testcontainers |
| KosekiIT | 5 (SKIP) | Testcontainers |
| ResidentApiIT | 2 (SKIP) | Testcontainers |
| **合計** | **78** | **69 PASS + 9 SKIP** |

### Vitest
| ファイル | テスト数 |
| --- | ---: |
| App.test.tsx | 15 |
| RestrictionView.test.tsx | 4 |
| SearchView.test.tsx | 3 |
| CertificateView.test.tsx | 3 |
| OfficialView.test.tsx | 5 |
| MoveView.test.tsx | 3 |
| ReportsView.test.tsx | 2 |
| ResidentView.test.tsx | 6 |
| **合計** | **42** |

## 5. 残タスク優先順

### A. 認証本番化
1. **Keycloak + Spring + Web の実 OIDC E2E**:
   - `tests/e2e/spring-oidc.spec.ts` 新設
   - 有効 JWT / 無効 JWT / ロール不足 のシナリオ
   - `/me` が Keycloak token mapper の `name`/`department`/`roles` を読めるか確認

### B. PDF/A
1. **veraPDF 実検証**:
   - `apps/api-spring/Dockerfile` で build → コンテナ起動 → PDF 取得 → veraPDF
   - CI ジョブ `pdfa-verify` 追加

### C. 残テスト
1. **AdminController で `@PreAuthorize` 反映確認の Testcontainers IT**:
   - 実 DB の `user_account` / `role` / `permission` テーブルへの永続化検証
2. **MaskService.toResponse の整合性テスト**:
   - jumin_code / my_number の権限別 unmask 振る舞いの直接単体テスト

### D. その他
1. **OIDC ロール連動 E2E**: Web で Keycloak ログイン → Spring API 呼び出し → ロール別レスポンス
2. **gap_matrix.md 最終更新**: Vitest 42 件、Spring 78 件、a11y 7 画面、Spring controller 被覆 100%
3. **README**: テスト被覆サマリ追記、CI バッジ

## 6. 注意点

- `EucController` には JWT 認証必須だが、ロール制約は無いため、`jwt()` をつければどの権限でも呼べる
- `AdminController` はクラスレベル `@PreAuthorize`。テストで検証する場合は
  `MethodSecurityConfig` の投入と `jwt().authorities("ROLE_*")` の組合せが必要
- App フルパステストで `cancelTransaction` を `apiMocks` に動的注入している
  （元の `vi.mock` で `cancelTransaction` を入れ忘れていたため）。リファクタ時は
  `apiMocks` 定義側に最初から含めることを推奨
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止

## 7. 設計トレーサビリティ

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts
└─→ apps/web/src/types.ts → views/*.tsx [Vitest 42 件]
└─→ apps/api/src/server.js
└─→ apps/api-spring/src/main/java/.../*.java [MockMvc 69 + IT 9]
└─→ /v3/api-docs ← tools/openapi-diff.mjs ← CI 自動検証（drift=0）
```

## 8. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_19.md → CLAUDE_HANDOFF_20.md を読んで続きから。

Claude round 20 追加分:
- Spring MockMvc: AdminController 7 / AuditController 2 / EucController 3 件
  (Spring 78 件 / 69 PASS + 9 SKIP)
- App.tsx フルパス取消テスト 1 件 (Vitest 41 → 42)

これで Spring の主要 API コントローラはすべて MockMvc 被覆完了。
Web は 8 ファイル / 42 テスト。

確認済み:
- mvn -B test: 78 件 (69 PASS + 9 SKIP)
- npm run web:test: 42 件 PASS
- npm run check / smoke / web:build: 全 PASS

次の優先 (CLAUDE_HANDOFF_20.md セクション 5):
A. Keycloak + Spring + Web の実 OIDC E2E (Docker 必要)
B. PDF/A veraPDF 検証 + CI 組み込み (Docker 必要)
C1. AdminController Testcontainers IT (実 DB 永続化検証)
C2. MaskService.toResponse の権限別 unmask 単体テスト
D1. README / gap_matrix.md の最終更新

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
