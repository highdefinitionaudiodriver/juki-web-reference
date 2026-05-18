# Codex → Claude 引き継ぎメモ #39

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_38.md`（Claude round 38: AdminView EUC 承認キュー + Vitest 51 件）

## 1. このラウンドで完了したこと

### A-1. EUC 個人番号抽出を二人承認に変更

`apps/api-spring/src/main/resources/db/migration/V004__report_required_approvals.sql`

`report_request` に `required_approvals` を追加。

```sql
alter table report_request
  add column required_approvals int not null default 1;

alter table report_request
  add constraint chk_report_request_required_approvals
  check (required_approvals >= 1);
```

`apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

`POST /api/v1/euc/query`:
- 個人番号なし: `required_approvals = 1`, 即 `DONE`
- 個人番号あり: `required_approvals = 2`, `QUEUED`
- レスポンスに `requiredApprovals` / `approvedCount` を追加

`POST /api/v1/euc/{jobId}/approve`:
- `required_approvals` を読み取り
- `report_approval` の `APPROVE` 件数を数える
- 1 人目の承認では `QUEUED` のまま
- 別の 2 人目が承認した時点で `DONE`、`resultUrl` を設定
- `REJECT` は即 `FAILED`
- 同一承認者の重複承認は 409
- 自己承認 409 は round 37 の挙動を維持

### A-2. MockMvc テストを 2 件追加

`apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

追加:
- `approve_firstApproverWhenTwoRequired_keepsQueued`
- `approve_duplicateApprover_returns409`

既存テストにも以下を追加確認:
- `requiredApprovals`
- `approvedCount`

EUC MockMvc は 17 件 → 19 件。

### A-3. Testcontainers IT の承認フローを二人承認に更新

`apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`

`approveQueuedRequest_persistsApprovalAndEvent` を二人承認前提に変更。
1 人目で `QUEUED`、2 人目で `DONE`、`report_approval` が 2 件記録されることを検証する形に更新。

### A-4. ドキュメント更新

更新:
- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

件数:

| カテゴリ | 件数 |
| --- | ---: |
| Spring MockMvc + Unit | 89 |
| Spring Testcontainers IT | 20 |
| Vitest | 51 |
| Playwright Node API | 13 |
| Playwright a11y | 7 |
| OpenAPI diff (CI) | 1 |
| 合計 | 181 |

コミット:
- `c1eaae5 feat: require two approvals for mynumber euc`

## 2. 検証結果

ローカル実行結果:

```text
mvn -B -Dtest=EucControllerTest test
  19 件 PASS

mvn -B test
  109 件 (89 PASS + 20 SKIP)
  ※ Docker 未起動のため Testcontainers IT 20 件は SKIP

npm run check
  PASS

npm run web:test
  51 件 PASS

npm run web:build
  PASS (231.01 KB / gzip 71.65 KB)

npm run smoke
  PASS

npm run e2e:api
  13 件 PASS
```

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/main/resources/db/migration/V004__report_required_approvals.sql`
- `CLAUDE_HANDOFF_39.md`（このファイル）

### 変更
- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`
- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

## 4. 残タスク優先順

### A. REJECT 後の再申請ポリシー
- `POST /api/v1/euc/{jobId}/resubmit` を新設
- 元 job の `params` をコピーして新 request を作成
- `report_event` に `EUC_RESUBMIT` を記録
- `details` に `sourceJobId` / `sourceRequestId` を保持
- ReportsView / AdminView に「再申請」操作を追加するか判断

### B. 個人番号出力の本実装
- `myNumber` はまだ承認判定用で、CSV 出力 SQL には含めていない
- `FIELD_EXPRESSIONS` に追加する前に、復号・マスク・監査ログの設計が必要
- ADMIN + 二人承認済みジョブだけ出力可能にする必要がある

### C. EUC パスワード通知の別経路化
- 現状 `X-Euc-Password` ヘッダ返却
- メール / SMS / 庁内通知など別経路へ分離
- `report_event` に `PASSWORD_NOTIFIED` を記録し、平文は保存しない

### D. PDF/A-2b 真の適合 / 残り帳票
- Noto CJK 明示 `useFont`
- ICC sRGB profile 埋め込み
- veraPDF `|| ::warning::` を `|| exit 1` に戻す
- 0010002–0010019 / 年報の form_id 別レイアウト

## 5. 注意点

- `required_approvals` は既存データに `default 1` で入るため、過去ジョブ互換は維持。
- `APPROVE` 1 件目のレスポンスは `status=QUEUED`, `requiresSecondApproval=true`, `approvedCount=1`, `requiredApprovals=2`。
- `APPROVE` 2 件目のレスポンスは `status=DONE`, `requiresSecondApproval=false`, `approvedCount=2`, `resultUrl` あり。
- `REJECT` は二人承認途中でも即 `FAILED`。
- 同一承認者の重複承認は `report_approval` 既存行の有無で 409。
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。

## 6. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_38.md → CLAUDE_HANDOFF_39.md を読んで続きから。

Codex round 39 追加分:
- V004 migration で report_request.required_approvals を追加
- 個人番号あり EUC は required_approvals=2、1人目 APPROVE は QUEUED 維持、2人目 APPROVE で DONE
- REJECT は即 FAILED
- 同一承認者の重複承認は 409
- EucControllerTest 2 件追加 → EUC MockMvc 19 件
- EucIT を二人承認前提に更新
- README / gap_matrix / euc_fields を更新

確認済み:
- mvn -B -Dtest=EucControllerTest test: 19 件 PASS
- mvn -B test: 109 件 (89 PASS + 20 SKIP)
- npm run check: PASS
- npm run web:test: 51 件 PASS
- npm run web:build: PASS
- npm run smoke: PASS
- npm run e2e:api: 13 件 PASS

次の優先:
1. REJECT 後の再申請 POST /api/v1/euc/{jobId}/resubmit
2. 個人番号出力の復号・マスク・監査
3. EUC パスワード通知の別経路化
4. PDF/A-2b 真適合 + 残り帳票

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
