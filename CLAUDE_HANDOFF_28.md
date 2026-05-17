# Codex → Claude 引き継ぎメモ #28

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_27.md`（Codex round 27: Spring OIDC E2E scaffold + CI job）

## 1. このラウンドで完了したこと

### A. EUC 抽出結果 ZIP ダウンロードを Spring に追加

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

- `POST /api/v1/euc/query` で二段階承認不要の DONE ジョブに `resultUrl=/api/v1/euc/EUC-{request_id}/result.zip` を保存・返却
- `GET /api/v1/euc/{jobId}/result.zip` を追加
- `report_request.template_id='euc-query'` の DONE ジョブだけ ZIP 取得可能
- QUEUED / APPROVAL_REQUIRED / その他未完了ステータスは 409
- 存在しない jobId / request は 404
- `outputFields` は許可リスト制:
  - `residentId`
  - `name`
  - `addressText`
  - `birthDate`
  - `sex`
  - `householdId`
- 未指定時は `residentId,name,addressText`
- 抽出対象は `resident` の現行住民、かつ `restricted_flag=false`
- CSV は UTF-8 BOM + CRLF、ZIP 内 entry は `{jobId}-result.csv`

注意: 今回は Java 標準 `ZipOutputStream` による ZIP 配信 scaffold。標準ライブラリではパスワード付 ZIP 暗号化ができないため、暗号化/パスワード付与は後続タスクとして残す。

### B. EUC ZIP の MockMvc / IT テスト追加

変更:

- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`

追加・更新:

| テスト | 内容 |
| --- | --- |
| `query_withoutMyNumber_returnsDoneStatus` | `resultUrl` を `/api/v1/euc/EUC-42/result.zip` に更新 |
| `download_doneJob_returnsZipWithCsv` | DONE ジョブで ZIP を取得し、CSV header / row を展開確認 |
| `download_queuedJob_returns409` | QUEUED ジョブは 409 |
| `downloadDoneRequest_returnsZipCsvFromResidentRows` | Testcontainers IT で住民 seed → EUC query → ZIP CSV 取得 |

### C. OpenAPI / 型生成 / ドキュメント更新

変更:

- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `README.md`
- `docs/gap_matrix.md`

内容:

- `/euc/{jobId}/result.zip` を OpenAPI に追加
- `/euc/query` の説明から「パスワード付ZIP配信」断定を外し、現在実装に合わせて「ZIP 配信」に修正
- `/euc/{jobId}/result.zip` には「パスワード付 ZIP 暗号化は後続」と明記
- `npm run generate:openapi` で型を再生成
- Spring テスト件数を更新:
  - Spring total: 91 → 94
  - MockMvc/Unit PASS: 73 → 75
  - Testcontainers IT SKIP: 18 → 19
  - 総検証ケース: 155 → 158

## 2. 検証結果

```powershell
npm run generate:openapi
npm run check
cd apps/api-spring
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
mvn -B test
cd ..\..
git diff --check
```

結果:

```text
npm run generate:openapi: PASS
npm run check: PASS
  - node --check apps/api/src/server.js: PASS
  - Keycloak realm check: PASS
  - web:typecheck: PASS
mvn -B test: BUILD SUCCESS
  - Tests run: 94
  - Failures: 0
  - Errors: 0
  - Skipped: 19
git diff --check: OK
```

Docker がローカルで利用できないため、Testcontainers IT 19 件は skip。Linux runner + Docker 環境での実通過は CI 側で確認する。

## 3. コミット

- `874bbf6 feat: add euc zip result download`
- `CLAUDE_HANDOFF_28.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `CLAUDE_HANDOFF_28.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`
- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. EUC の本実装強化

1. パスワード付 ZIP 暗号化を実装する
   - 候補: zip4j などの依存追加、または外部ファイル生成サービス
   - パスワード生成・通知経路・監査ログの設計が必要
2. EUC の `outputFields` を設計書に合わせて拡張
3. 抽出条件 `filters` を SQL 安全な DSL/ビルダーで実装
4. `report_request.status` の値体系を整理し、DONE/QUEUED/APPROVAL_REQUIRED/FAILED を明確化

### B. CI 実行結果確認

- `spring` job で Testcontainers 19 件が PASS するか
- `spring-oidc-e2e` が Keycloak 実 token で PASS するか
- `pdfa-verify` が veraPDF まで PASS するか
- `openapi-diff` が drift=0 のままか

### C. 帳票 / 非機能

- 残り帳票 0010002–0010019 / 年報の個別レイアウト
- PDF/A-2b の veraPDF 合格化
- WebAuthn / mTLS の実接続
- OWASP ASVS Lv2 セルフチェック

## 6. 注意点

- 今回の ZIP は暗号化されていない。`ZipOutputStream#setComment("password-protected-delivery-required")` は後続実装への目印のみ。
- `GET /euc/{jobId}/result.zip` は二段階承認不要の DONE ジョブだけを対象にしている。個人番号出力を含む QUEUED ジョブは 409。
- CSV は `restricted_flag=false` の住民のみ。DV 等支援措置の存在隠蔽を壊さないため、この制約は維持する。
- `FIELD_EXPRESSIONS` の SQL 断片は許可リストからのみ選択すること。ユーザ入力を SQL へ直結しない。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_27.md → CLAUDE_HANDOFF_28.md を読んで続きから。

Codex round 28 追加分:
- Spring EUC に GET /api/v1/euc/{jobId}/result.zip を追加
- DONE ジョブだけ CSV を ZIP で返す
- QUEUED / 未完了ジョブは 409
- MockMvc 2 件追加、EucIT 1 件追加
- OpenAPI と generated api.d.ts を更新
- README / docs/gap_matrix の Spring テスト件数を 94 件へ更新

確認済み:
- npm run generate:openapi: PASS
- npm run check: PASS
- mvn -B test: 94 件（75 PASS + 19 SKIP、Docker なし）
- git diff --check: OK

次の優先:
A. EUC パスワード付 ZIP 暗号化（zip4j 等）とパスワード通知/監査設計
B. EUC outputFields / filters の設計書準拠拡張
C. GitHub Actions 上で spring / spring-oidc-e2e / pdfa-verify / openapi-diff の実結果確認
D. 残り帳票 0010002–0010019 / 年報の個別レイアウト

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
