# Codex → Claude 引き継ぎメモ #31

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_30.md`（Claude round 30: CI 全 5 ジョブ初達成）

## 1. このラウンドで完了したこと

### A. EUC filters を安全な SQL ビルダーに拡張

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

`GET /api/v1/euc/{jobId}/result.zip` の CSV 抽出時に、`params.filters` を許可リスト化した WHERE 句へ変換するようにした。

対応 filter:

| filter | SQL 条件 |
| --- | --- |
| `residentId` | `resident_id = ?` |
| `residentIdPrefix` | `resident_id like ? escape '\'` |
| `householdId` | `household_id = ?` |
| `sex` | `sex = ?` |
| `addressCode` | `address_code = ?` |
| `addressTextContains` | `address_text like ? escape '\'` |
| `nameContains` | `family_name_kanji || ' ' || given_name_kanji like ? escape '\'` |
| `nationality` | `nationality = ?` |
| `birthDateFrom` / `birthDateTo` | `birth_date >=/<= cast(? as date)` |
| `movedInDateFrom` / `movedInDateTo` | `moved_in_date >=/<= cast(? as date)` |

LIKE 条件は `%` / `_` / `\` を escape する。ユーザ入力は SQL 文字列に直結せず、すべて `JdbcTemplate` の bind parameter に渡す。

### B. EUC outputFields を拡張

追加 field:

- `nameKana`
- `addressCode`
- `nationality`
- `movedInDate`

既存:

- `residentId`
- `name`
- `addressText`
- `birthDate`
- `sex`
- `householdId`

`myNumber` は二段階承認判定用として OpenAPI enum に残しているが、DONE ジョブの CSV 出力許可リストには入れていない。

### C. テスト追加

変更: `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

追加:

- `download_withFilters_buildsWhitelistedWhereClause`

検証内容:

- filter が許可 SQL 条件に変換される
- LIKE 値の `%` / `_` が escape される
- 入力値が SQL 文字列に直挿しされない
- bind parameter の並びを確認

EUC Controller MockMvc は 6 件 → 7 件。

### D. OpenAPI / 型生成 / Web 型合わせ

変更:

- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `apps/web/src/views/ReportsView.tsx`

内容:

- `EucQueryReq.filters` に許可プロパティを明示
- `EucQueryReq.outputFields` を enum 化
- `npm run generate:openapi` で型を再生成
- Web の EUC 出力項目入力を型ガードで許可 field のみに絞り込み
- `datalist` で許可 field 候補を表示

### E. README / gap matrix 更新

変更:

- `README.md`
- `docs/gap_matrix.md`

内容:

- Spring テスト件数: 95 → 96
- MockMvc/Unit PASS: 76 → 77
- Testcontainers IT SKIP: 19
- Spring API Controller: 70 件、EUC(7)
- 総検証ケース: 160
- CI は Web + Node API / Spring Boot + Testcontainers / Spring OIDC E2E / OpenAPI diff / PDF/A veraPDF の全 5 ジョブ PASS と明記

## 2. 検証結果

```powershell
npm run generate:openapi
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
npm run generate:openapi: PASS
npm run check: PASS
  - Keycloak realm check: PASS
  - web:typecheck: PASS
npm run web:test: 42 PASS
mvn -B -Dtest=EucControllerTest test: 7 PASS
mvn -B test: BUILD SUCCESS
  - Tests run: 96
  - Failures: 0
  - Errors: 0
  - Skipped: 19
git diff --check: OK
```

Docker がローカルで利用できないため、Testcontainers IT 19 件は skip。CI の Linux runner + Docker では前回 round 30 時点で全 5 ジョブ PASS 済み。

## 3. コミット

- `7484433 feat: add safe euc filters`
- `b570b2b fix: constrain euc output field input`
- `CLAUDE_HANDOFF_31.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `CLAUDE_HANDOFF_31.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/web/src/views/ReportsView.tsx`
- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. EUC の次段

1. `filters` の設計書準拠項目をさらに追加
2. `filters` の日付形式・sex enum などの validation を 400 で返す
3. `outputFields` と標準仕様項目 ID の対応表を docs に追加
4. 個人番号出力を含む `APPROVAL_REQUIRED` / 承認後生成フローを明確化

### B. EUC パスワード通知の別経路化

- 現在は `X-Euc-Password` ヘッダで平文返却
- メール/SMS/庁内通知など別チャネルで通知するモジュールを検討
- `report_request.result_url` への passwordHash 追記は監査の仮実装なので、将来的には専用 audit/event テーブルが望ましい

### C. PDF/A-2b 真の適合性

- Noto CJK 明示埋め込み
- ICC sRGB profile 埋め込み
- veraPDF grep を warning ではなく fail に戻す

### D. 残り帳票

- 0010002–0010019
- 年報

## 6. 注意点

- `EucController.whereClause` は許可リスト方式。新規 filter を足すときも SQL 断片は固定文字列にし、値は bind parameter のままにする。
- LIKE 検索は `escape '\'` を使うため、`escapeLike` の処理を外さない。
- Web の `ReportsView` は OpenAPI enum から生成された型に合わせて、未知 field を送信前に落とす。
- `myNumber` は OpenAPI enum にはあるが、CSV 出力 SQL の `FIELD_EXPRESSIONS` にはない。個人番号出力は二段階承認の後続設計が先。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_30.md → CLAUDE_HANDOFF_31.md を読んで続きから。

Codex round 31 追加分:
- EUC filters を許可リスト式の SQL ビルダーで実装
- residentId / householdId / sex / addressCode / nationality / 日付範囲 / prefix / contains 系 filter に対応
- LIKE 値の % / _ / \ を escape
- outputFields に nameKana / addressCode / nationality / movedInDate を追加
- OpenAPI filters schema と outputFields enum を更新し、api.d.ts を再生成
- Web ReportsView は enum 型に合わせて許可 field のみ送信し、datalist 候補を表示
- README / gap_matrix を Spring 96 件、総検証 160 件、CI 全 5 ジョブ PASS に更新

確認済み:
- npm run generate:openapi: PASS
- npm run check: PASS
- npm run web:test: 42 PASS
- mvn -B -Dtest=EucControllerTest test: 7 PASS
- mvn -B test: 96 件（77 PASS + 19 SKIP、Docker なし）
- git diff --check: OK

次の優先:
A. filters の validation 強化と設計書項目拡張
B. 個人番号出力を含む EUC の APPROVAL_REQUIRED / 承認後生成フロー
C. EUC パスワード通知の別経路化
D. PDF/A-2b 真の適合
E. 残り帳票 0010002–0010019 / 年報

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
