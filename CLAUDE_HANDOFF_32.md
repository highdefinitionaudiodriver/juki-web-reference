# Codex → Claude 引き継ぎメモ #32

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_31.md`（Codex round 31: EUC safe filters + outputFields enum）

## 1. このラウンドで完了したこと

### A. EUC filters validation を追加

変更: `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

`POST /api/v1/euc/query` 受付時と、`GET /api/v1/euc/{jobId}/result.zip` ダウンロード時の両方で `filters` を検証するようにした。

400 にする条件:

- `filters` が object 以外
- 未知の filter key
- `sex` が `M` / `F` / `U` 以外
- 日付 filter が `yyyy-MM-dd` で parse できない
- `birthDateFrom > birthDateTo`
- `movedInDateFrom > movedInDateTo`

追加した主な helper:

- `validateFilters`
- `validateDateRange`
- `dateFilter`
- `FILTER_KEYS`
- `SEX_VALUES`

### B. EUC validation テスト追加

変更: `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

追加:

| テスト | 内容 |
| --- | --- |
| `query_withUnsupportedFilter_returns400` | query 受付時に未知 filter `sql` を 400 |
| `download_withInvalidFilterValues_returns400` | download 時に `sex=X` / 日付逆転を 400 |

EUC Controller MockMvc は 7 件 → 9 件。

### C. テスト件数ドキュメント更新

変更:

- `README.md`
- `docs/gap_matrix.md`

更新:

- Spring total: 96 → 98
- MockMvc/Unit PASS: 77 → 79
- Testcontainers IT SKIP: 19
- Spring API Controller: 70 → 72
- EUC: 7 → 9
- 総検証ケース: 160 → 162

### D. EUC 出力項目・抽出条件対応表を追加

新規: `docs/euc_fields.md`

内容:

- `outputFields` と Spring SQL 式の対応表
- `filters` と SQL 条件 / validation の対応表
- 固定条件 `moved_out_date is null` / `restricted_flag = false`
- 残課題:
  - 標準仕様書の項目 ID との正式対応表
  - 個人番号を含む EUC の二段階承認後生成フロー
  - パスワード通知の別経路化
  - password hash 記録先の専用 audit/event 化

`docs/gap_matrix.md` から `docs/euc_fields.md` へリンクを追加。

## 2. 検証結果

```powershell
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
npm run check: PASS
  - Keycloak realm check: PASS
  - web:typecheck: PASS
mvn -B -Dtest=EucControllerTest test: 9 PASS
mvn -B test: BUILD SUCCESS
  - Tests run: 98
  - Failures: 0
  - Errors: 0
  - Skipped: 19
git diff --check: OK
```

Docker がローカルで利用できないため、Testcontainers IT 19 件は skip。

## 3. コミット

- `28ba08c feat: validate euc filters`
- `7d651e3 docs: document euc fields and filters`
- `CLAUDE_HANDOFF_32.md` は次コミットで追加予定

## 4. 変更ファイル

### 新規

- `docs/euc_fields.md`
- `CLAUDE_HANDOFF_32.md`

### 変更

- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `README.md`
- `docs/gap_matrix.md`

## 5. 残タスク優先順

### A. EUC 二段階承認後生成フロー

- 現在 `myNumber` を含む query は `QUEUED` / `requiresSecondApproval=true`
- 承認 API / 承認レコード / 承認後 ZIP 生成の流れは未実装
- `APPROVAL_REQUIRED` など status 体系の整理も必要

### B. EUC パスワード通知の別経路化

- 現在は `X-Euc-Password` ヘッダで平文返却
- メール/SMS/庁内通知など別チャネルへ分離する設計が必要
- `report_request.result_url` に `passwordHash` を追記する仮実装は、専用 audit/event へ移すのが望ましい

### C. EUC 項目拡張

- `docs/euc_fields.md` に標準仕様書の項目 ID を紐付ける
- 在留情報 / 通称 / 旧氏 / コード系など、JOIN が必要な出力項目を段階的に追加
- filter validation の文字数上限や項目別権限も検討

### D. PDF/A-2b 真の適合性

- Noto CJK 明示埋め込み
- ICC sRGB profile 埋め込み
- veraPDF grep を warning ではなく fail に戻す

### E. 残り帳票

- 0010002–0010019
- 年報

## 6. 注意点

- `filters` は query 受付時にも検証するため、未知 key を含む EUC request は保存されない。
- download 側でも再検証しているため、既存 DB に不正 params が残っていても ZIP 生成前に 400 で止まる。
- `stringFilter` は値を `String.valueOf(...).trim()` する。厳密な型 validation は今後の追加余地あり。
- `sex` は `M` / `F` / `U` のみ。標準仕様とのコード体系差がある場合は変換層を追加する。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_31.md → CLAUDE_HANDOFF_32.md を読んで続きから。

Codex round 32 追加分:
- EUC filters validation を query 受付時と ZIP download 時に追加
- 未知 filter / sex enum 外 / 日付形式不正 / 日付範囲逆転を 400
- EucControllerTest に 400 系 2 件追加し、EUC MockMvc は 9 件
- README / gap_matrix を Spring 98 件、総検証 162 件へ更新
- docs/euc_fields.md を追加し、outputFields / filters / 固定条件 / 残課題を整理

確認済み:
- npm run check: PASS
- mvn -B -Dtest=EucControllerTest test: 9 PASS
- mvn -B test: 98 件（79 PASS + 19 SKIP、Docker なし）
- git diff --check: OK

次の優先:
A. 個人番号出力を含む EUC の二段階承認後生成フロー
B. EUC パスワード通知の別経路化
C. docs/euc_fields.md に標準仕様項目 ID を紐付け
D. PDF/A-2b 真の適合
E. 残り帳票 0010002–0010019 / 年報

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
