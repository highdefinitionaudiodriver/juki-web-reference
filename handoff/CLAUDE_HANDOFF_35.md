# Codex → Claude 引き継ぎメモ #35

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_34.md`（Claude round 34: EUC 承認 UI + Vitest 45 件）

## 1. このラウンドで完了したこと

### A. EUC 承認専用テーブルを追加

新規: `apps/api-spring/src/main/resources/db/migration/V003__report_approval_event.sql`

追加テーブル:

| テーブル | 用途 |
| --- | --- |
| `report_approval` | report_request 単位の承認 step / approver / action / comment / acted_at を記録 |
| `report_event` | `EUC_APPROVE` / `EUC_REJECT` などのイベント details を JSONB で記録 |

`report_approval` は `request_id + step` に unique index、`report_event` は request 単位の時系列 index を追加。

### B. EUC 承認 API で専用テーブルへ記録

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

`POST /api/v1/euc/{jobId}/approve` で以下を行うようにした。

- `report_request` 更新
- `report_request.params.approval` への承認メタデータ保存
- `report_approval` への承認レコード追加
- `report_event` へのイベント追加
- requester と approver が同一の場合は 409

注意: `params.approval` は UI/API の互換的な足場として残している。正規の永続化先は `report_approval` / `report_event`。

### C. テスト追加

変更:

- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`

追加・強化:

| テスト | 内容 |
| --- | --- |
| `approve_queuedJob_returnsDoneAndResultUrl` | `report_approval` / `report_event` insert 呼び出しを検証 |
| `approve_sameRequester_returns409` | 自己承認を 409 で拒否 |
| `approveQueuedRequest_persistsApprovalAndEvent` | Testcontainers IT で `report_approval` / `report_event` 永続化を検証 |

EUC Controller MockMvc は 12 → 13 件。EucIT は 3 → 4 件。

### D. ドキュメント更新

変更:

- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

更新:

- DB: 22 設計テーブル + EUC 承認/イベント 2 テーブル
- Spring total: 101 → 103
- MockMvc/Unit PASS: 82 → 83
- Testcontainers IT SKIP: 19 → 20
- Vitest: 45 件 PASS を反映
- 総検証ケース: 165 → 169
- `docs/euc_fields.md` に承認・イベント記録の節を追加

## 2. 検証結果

```powershell
npm run check
npm run web:test
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
npm run check: PASS
  - Keycloak realm check: PASS
  - web:typecheck: PASS
npm run web:test: 45 PASS
mvn -B -Dtest=EucControllerTest test: 13 PASS
mvn -B test: BUILD SUCCESS
  - Tests run: 103
  - Failures: 0
  - Errors: 0
  - Skipped: 20
git diff --check: OK
```

Docker がローカルで利用できないため、Testcontainers IT 20 件は skip。Linux runner + Docker では `EucIT(4)` が実行対象。

## 3. コミット

- `8acf2fc feat: persist euc approval events`
- `CLAUDE_HANDOFF_35.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `apps/api-spring/src/main/resources/db/migration/V003__report_approval_event.sql`
- `CLAUDE_HANDOFF_35.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`
- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

## 5. 残タスク優先順

### A. QUEUED job 一覧 API + UI

- 現状の承認 UI は jobId 手入力
- `GET /api/v1/euc?status=QUEUED` などで承認待ち一覧を返す
- `ReportsView` または `AdminView` で一覧から承認/却下できるようにする

### B. 承認統制の強化

- 承認者 role 制約
- 二人承認 / 多段承認
- `report_approval.step` の route 定義
- REJECT 後の再申請・再承認ポリシー

### C. 個人番号出力の本実装

- 現在 `myNumber` は二段階承認判定でしか使わず、CSV 出力 SQL にはない
- 復号・マスク・監査・出力制御の設計が必要

### D. EUC パスワード通知の別経路化

- 現在は `X-Euc-Password` ヘッダで平文返却
- メール/SMS/庁内通知など別チャネルへ分離する

### E. PDF/A-2b 真の適合 / 残り帳票

- Noto CJK 明示 `useFont`
- ICC sRGB profile 埋め込み
- veraPDF fail 復帰
- 0010002–0010019 / 年報

## 6. 注意点

- `V003__report_approval_event.sql` は新規 migration。既存 DB には Flyway migrate が必要。
- `report_approval.approver_user_id` は `user_account(user_id)` FK。テストや seed では承認者 user を事前登録すること。
- 自己承認は禁止したが、role 制約はまだない。現状は Spring security の既存認証に加え、controller 内の self-approval check のみ。
- `report_event.details` は JSONB。将来 WORM 監査へ寄せるなら append-only 制約や改ざん検知を検討。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_34.md → CLAUDE_HANDOFF_35.md を読んで続きから。

Codex round 35 追加分:
- V003__report_approval_event.sql を追加
- report_approval / report_event で EUC 承認とイベントを永続化
- POST /euc/{jobId}/approve で report_request 更新に加え、専用テーブルへ記録
- requester と approver が同一なら 409
- EucControllerTest に自己承認 409 と insert 検証を追加
- EucIT に承認永続化 IT を追加
- README / gap_matrix / docs/euc_fields.md を更新

確認済み:
- npm run check: PASS
- npm run web:test: 45 PASS
- mvn -B -Dtest=EucControllerTest test: 13 PASS
- mvn -B test: 103 件（83 PASS + 20 SKIP、Docker なし）
- git diff --check: OK

次の優先:
A. QUEUED job 一覧 API + UI
B. 承認者 role 制約 / 二人承認 / 多段承認
C. 個人番号出力の復号・権限・監査設計
D. パスワード通知の別経路化
E. PDF/A-2b 真の適合 / 残り帳票

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
