# EUC 出力項目・抽出条件対応表

最終更新: 2026-05-18

`POST /api/v1/euc/query` の `outputFields` / `filters` と、Spring 実装の SQL 変換ルールを整理する。
ユーザ入力を SQL 断片として扱わず、固定の許可リストから列・式を選択し、値は bind parameter に渡す。

## 出力項目

| outputFields | CSV ヘッダ | Spring SQL 式 | 備考 |
| --- | --- | --- | --- |
| `residentId` | `residentId` | `resident_id` | 住民 ID |
| `name` | `name` | `family_name_kanji || ' ' || given_name_kanji` | 氏名漢字 |
| `nameKana` | `nameKana` | `family_name_kana || ' ' || given_name_kana` | 氏名カナ |
| `addressText` | `addressText` | `address_text` | 住所文字列 |
| `addressCode` | `addressCode` | `address_code` | 住所コード |
| `birthDate` | `birthDate` | `birth_date::text` | 生年月日 |
| `sex` | `sex` | `sex` | `M` / `F` / `U` |
| `nationality` | `nationality` | `nationality` | 国籍 |
| `movedInDate` | `movedInDate` | `moved_in_date::text` | 住定日 |
| `householdId` | `householdId` | `household_id` | 世帯 ID |
| `myNumber` | なし | なし | 二段階承認判定用。DONE ジョブの CSV 出力対象にはしない |

未指定または全項目が未許可の場合は `residentId,name,addressText` を出力する。

## 抽出条件

| filters | 条件 | validation |
| --- | --- | --- |
| `residentId` | `resident_id = ?` | 文字列化して trim |
| `residentIdPrefix` | `resident_id like ? escape '\'` | LIKE meta 文字を escape |
| `householdId` | `household_id = ?` | 文字列化して trim |
| `sex` | `sex = ?` | `M` / `F` / `U` のみ |
| `addressCode` | `address_code = ?` | 文字列化して trim |
| `addressTextContains` | `address_text like ? escape '\'` | LIKE meta 文字を escape |
| `nameContains` | `family_name_kanji || ' ' || given_name_kanji like ? escape '\'` | LIKE meta 文字を escape |
| `nationality` | `nationality = ?` | 文字列化して trim |
| `birthDateFrom` | `birth_date >= cast(? as date)` | `yyyy-MM-dd` |
| `birthDateTo` | `birth_date <= cast(? as date)` | `yyyy-MM-dd`、from <= to |
| `movedInDateFrom` | `moved_in_date >= cast(? as date)` | `yyyy-MM-dd` |
| `movedInDateTo` | `moved_in_date <= cast(? as date)` | `yyyy-MM-dd`、from <= to |

未知の filter key、`filters` が object 以外、日付形式不正、日付範囲逆転、`sex` の enum 外は 400。

## 固定条件

EUC の抽出結果は、常に以下を満たす住民だけを対象とする。

- `moved_out_date is null`
- `restricted_flag = false`

DV 等支援措置対象の存在隠蔽を壊さないため、この固定条件は解除しない。

## 残課題

- 標準仕様書の項目 ID と `outputFields` の正式対応表作成
- 個人番号を含む EUC の二段階承認後生成フローの統制強化
- パスワード通知の別経路化
- ZIP password hash 記録先の専用 audit/event 化

## 承認・イベント記録

個人番号を含む EUC は `QUEUED` で受け付け、`POST /api/v1/euc/{jobId}/approve` で承認または却下する。
承認待ち一覧 `GET /api/v1/euc` と承認 API は `ADMIN` ロールに限定する。

| テーブル | 用途 |
| --- | --- |
| `report_approval` | 承認 step / approver / action / comment / acted_at を記録 |
| `report_event` | `EUC_APPROVE` / `EUC_REJECT` などのイベント details を JSONB で記録 |

同一ユーザによる自己承認は 409 で拒否する。多段承認、専用 WORM 監査は今後の拡張対象。
