# Codex → Claude 引き継ぎメモ #33

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_32.md`（Codex round 32: EUC filters validation + docs）

## 1. このラウンドで完了したこと

### A. EUC 二段階承認 API の足場を追加

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

新規 endpoint:

```http
POST /api/v1/euc/{jobId}/approve
```

挙動:

- `QUEUED` の EUC job のみ承認対象
- `{"action":"APPROVE"}` で `DONE` に更新
- `{"action":"REJECT"}` で `FAILED` に更新
- `APPROVE` 時は `result_url=/api/v1/euc/{jobId}/result.zip` を設定
- `REJECT` 時は `result_url=null`、`error=Rejected by approver`
- `APPROVE/REJECT` 以外は 400
- job なしは 404
- `QUEUED` 以外は 409
- 保存済み `filters` は承認時にも再 validation
- 承認メタデータは `report_request.params.approval` に保存

保存する承認メタデータ:

```json
{
  "action": "APPROVE",
  "approverUserId": "...",
  "comment": "...",
  "actedAt": "..."
}
```

注意: これは承認フローの足場。専用 approval table / audit event / 多段承認は未実装。

### B. EUC 承認 MockMvc テスト追加

変更: `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

追加:

| テスト | 内容 |
| --- | --- |
| `approve_queuedJob_returnsDoneAndResultUrl` | QUEUED job を APPROVE して DONE + resultUrl |
| `approve_rejectsQueuedJobAsFailed` | QUEUED job を REJECT して FAILED |
| `approve_doneJob_returns409` | DONE job の再承認は 409 |

EUC Controller MockMvc は 9 件 → 12 件。

### C. OpenAPI / 型生成 / ドキュメント更新

変更:

- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `README.md`
- `docs/gap_matrix.md`

内容:

- `/euc/{jobId}/approve` を OpenAPI に追加
- `npm run generate:openapi` で型再生成
- Spring テスト件数を更新:
  - Spring total: 98 → 101
  - MockMvc/Unit PASS: 79 → 82
  - Testcontainers IT SKIP: 19
  - Spring API Controller: 72 → 75
  - EUC: 9 → 12
  - 総検証ケース: 162 → 165

### D. Web API client に EUC 承認呼び出しを追加

変更: `apps/web/src/api.ts`

追加:

```ts
eucApprove: (jobId: string, body: { action?: "APPROVE" | "REJECT"; comment?: string | null }) =>
  request<EucAsyncJob>(`/euc/${jobId}/approve`, { method: "POST", body })
```

まだ画面 UI には接続していない。次ラウンドで `ReportsView` または管理画面に承認操作を載せる余地あり。

## 2. 検証結果

```powershell
npm run generate:openapi
npm run check
cd apps/api-spring
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
mvn -B -Dtest=EucControllerTest test
mvn -B test
cd ..\..
git diff --check
```

結果:

```text
npm run generate:openapi: PASS
npm run check: PASS
  - Keycloak realm check: PASS
  - web:typecheck: PASS
mvn -B -Dtest=EucControllerTest test: 12 PASS
mvn -B test: BUILD SUCCESS
  - Tests run: 101
  - Failures: 0
  - Errors: 0
  - Skipped: 19
git diff --check: OK
```

Docker がローカルで利用できないため、Testcontainers IT 19 件は skip。

## 3. コミット

- `cae1c4a feat: add euc approval endpoint`
- `693f981 feat: add web euc approval client`
- `CLAUDE_HANDOFF_33.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `CLAUDE_HANDOFF_33.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/web/src/api.ts`
- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. EUC 承認 UI

- `ReportsView` か `AdminView` に jobId / action / comment 入力を追加
- `api.eucApprove` を接続
- APPROVE 後は resultUrl notice、REJECT 後は failed notice
- Web テスト追加

### B. EUC 承認の永続化設計強化

- `report_request.params.approval` は足場
- 専用 `report_approval` / `report_event` などの table 追加を検討
- 承認者 role / 二人承認 / self-approval 禁止などの統制は未実装

### C. 個人番号出力の本実装

- 現在 `myNumber` は二段階承認判定には使うが、CSV 出力 SQL の `FIELD_EXPRESSIONS` にはない
- 承認後に個人番号をどう復号・マスク・監査するか設計が必要

### D. EUC パスワード通知の別経路化

- 現在は `X-Euc-Password` ヘッダで平文返却
- メール/SMS/庁内通知など別チャネルへ分離する設計が必要

### E. PDF/A-2b 真の適合 / 残り帳票

- Noto CJK 明示埋め込み
- ICC sRGB profile 埋め込み
- veraPDF fail 復帰
- 0010002–0010019 / 年報

## 6. 注意点

- `POST /euc/{jobId}/approve` は `QUEUED` 以外を 409 にする。DONE job の再承認や FAILED job の再処理はまだない。
- 承認時にも保存済み `filters` を再 validation するため、古い不正 params は DONE に進めない。
- `APPROVE` 後の ZIP download は既存の `GET /result.zip` と同じ。ダウンロード時に毎回 AES-256 ZIP とランダム password を生成する。
- `myNumber` は承認後もまだ CSV には出ない。個人番号出力は別途、復号・権限・監査設計が必要。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_32.md → CLAUDE_HANDOFF_33.md を読んで続きから。

Codex round 33 追加分:
- POST /api/v1/euc/{jobId}/approve を追加
- QUEUED job を APPROVE で DONE、REJECT で FAILED に更新
- 承認メタデータを report_request.params.approval に保存
- EucControllerTest に承認 3 件追加し、EUC MockMvc は 12 件
- OpenAPI / generated api.d.ts 更新
- Web api.ts に eucApprove client を追加
- README / gap_matrix を Spring 101 件、総検証 165 件へ更新

確認済み:
- npm run generate:openapi: PASS
- npm run check: PASS
- mvn -B -Dtest=EucControllerTest test: 12 PASS
- mvn -B test: 101 件（82 PASS + 19 SKIP、Docker なし）
- git diff --check: OK

次の優先:
A. EUC 承認 UI を ReportsView または AdminView に追加
B. 専用 report approval/event table の検討
C. 個人番号出力の復号・権限・監査設計
D. パスワード通知の別経路化
E. PDF/A-2b 真の適合 / 残り帳票

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
