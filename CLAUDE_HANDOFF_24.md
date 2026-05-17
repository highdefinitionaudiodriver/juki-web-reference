# Codex → Claude 引き継ぎメモ #24

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_23.md`（Codex round 23: Web fallback 制御 + README CI badge）

## 1. このラウンドで完了したこと

### A. RestrictionController の Testcontainers IT 追加（2 件）

新規: `apps/api-spring/src/test/java/jp/go/local/resident/RestrictionIT.java`

実 PostgreSQL に対して、抑止登録/解除が `restriction` と `resident.restricted_flag` の双方へ反映されることを検証。

| テスト | 内容 |
| --- | --- |
| `createRestriction_setsResidentRestrictedFlag` | POST `/api/v1/restrictions` で `restriction` が保存され、対象住民の `restricted_flag=true` |
| `releaseRestriction_clearsResidentRestrictedFlagWhenNoActiveRestrictionsRemain` | DELETE `/api/v1/restrictions/{id}` で `end_date` が入り、active 抑止がなければ `restricted_flag=false` |

### B. 抑止解除の即時反映バグ修正

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/RestrictionController.java`

解除時に `end_date=current_date` を設定した直後、active 判定が `end_date >= current_date` だったため、解除当日も active 扱いになり `resident.restricted_flag` が下がらないバグを修正。

```sql
-- 修正前
end_date is null or end_date >= current_date

-- 修正後
end_date is null or end_date > current_date
```

### C. EucController の依頼永続化

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

従来はレスポンスだけ返すスタブ寄りの実装だったため、既存テーブル `report_request` に EUC 依頼を保存するよう変更。

- `template_id = 'euc-query'`
- `requester_user_id = Authentication#getName()`
- `status = DONE / QUEUED`
- `params = request body JSON`
- `result_url = /euc/result.csv` または `null`
- レスポンス `jobId` は `EUC-{request_id}`

個人番号を含む依頼は引き続き:

- `status = QUEUED`
- `progress = 10`
- `resultUrl = null`
- `requiresSecondApproval = true`

### D. EucController の Testcontainers IT 追加（2 件）

新規: `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`

| テスト | 内容 |
| --- | --- |
| `queryWithoutMyNumber_persistsDoneRequest` | 個人番号なし EUC が `DONE` で `report_request` に保存される |
| `queryWithMyNumber_persistsQueuedRequestForSecondApproval` | 個人番号あり EUC が `QUEUED` / `result_url=null` / `params.includeMyNumber=true` で保存される |

### E. テスト件数ドキュメント更新

変更:
- `README.md`
- `docs/gap_matrix.md`

Spring テスト件数を `89 件（72 PASS + 17 SKIP）` に更新。README の全体合計も `153 ケース` に更新。

## 2. 検証結果

```powershell
mvn -B test
```

結果:

```text
Tests run: 89, Failures: 0, Errors: 0, Skipped: 17
BUILD SUCCESS
```

Docker 不在のため Testcontainers IT 17 件は skip。Linux runner + Docker 環境では実 PostgreSQL で実行される想定。

## 3. コミット

- `cbd6530 test: add restriction persistence integration coverage`
- `9a1e785 feat: persist euc query requests`
- `CLAUDE_HANDOFF_24.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `apps/api-spring/src/test/java/jp/go/local/resident/RestrictionIT.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`
- `CLAUDE_HANDOFF_24.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/RestrictionController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. Keycloak + Spring + Web の実 OIDC E2E

- `tests/e2e/spring-oidc.spec.ts` 新設
- Keycloak dev realm 起動
- 有効 JWT / 無効 JWT / ロール不足
- `/me` が token mapper の `name` / `department` / `roles` を読むことを確認

### B. PDF/A veraPDF 検証

- Spring から証明 PDF を取得
- veraPDF で PDF/A-2b 検証
- GitHub Actions に `pdfa-verify` job を追加

### C. CI 実行結果確認

- README badge の表示確認
- OpenAPI diff job の Spring 起動待機が安定しているか確認
- Docker あり runner で `RestrictionIT` / `EucIT` が PASS することを確認

### D. EUC / Report の後続改善

- `report_request.status` の値体系を `DONE` / `QUEUED` / `PENDING_SECOND_APPROVAL` などに整理するか検討
- EUC 結果ファイル生成・パスワード付 ZIP 配信は未実装
- `requester_user_id` は FK 制約により `user_account` 登録済み前提。Keycloak 実 E2E とあわせてユーザ同期を検証する

## 6. 注意点

- 抑止解除の active 判定は `end_date > current_date` に変更した。解除当日は即時非 active とする前提。
- `EucController` は `report_request` に保存するため、実 DB では `Authentication#getName()` と同じ `user_account.user_id` が必要。
- README の合計 153 は Node smoke 1 件を含む。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。
- ChromeOS Flex / Chromium 最新 2 世代互換の前提は維持。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_23.md → CLAUDE_HANDOFF_24.md を読んで続きから。

Codex round 24 追加分:
- RestrictionIT 2 件追加
- RestrictionController の抑止解除 active 判定バグ修正
- EucController を report_request 永続化へ変更
- EucIT 2 件追加
- README / docs/gap_matrix.md を Spring 89 件・合計 153 ケースへ更新

確認済み:
- mvn -B test: 89 件 (72 PASS + 17 SKIP), BUILD SUCCESS

次の優先:
A. Keycloak + Spring + Web の実 OIDC E2E
B. PDF/A veraPDF 検証 + CI
C. GitHub Actions 上で Docker あり IT / OpenAPI diff / README badge 表示確認
D. EUC 結果ファイル生成・パスワード付 ZIP 配信

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
