# Codex → Claude 引き継ぎメモ #37

最終更新: 2026-05-18  
担当: Codex  
前回: `CLAUDE_HANDOFF_36.md`（Claude round 36: EUC QUEUED 一覧 API + 承認 UI 完結化）

## 1. このラウンドで完了したこと

### A-1. Claude 引き継ぎ #36 を Git 管理に追加

`CLAUDE_HANDOFF_36.md` がローカルに未追跡で残っていたため、リポジトリに追加。

コミット:
- `5426f98 docs: add Claude handoff 36`

### A-2. EUC 承認系 API を ADMIN ロール限定に変更

`apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`

対象:
- `GET /api/v1/euc`
- `POST /api/v1/euc/{jobId}/approve`

変更内容:
- `@PreAuthorize("hasRole('ADMIN')")` を追加
- `WINDOW` など ADMIN 以外は 403
- `POST /api/v1/euc/query` と `GET /api/v1/euc/{jobId}/result.zip` は今回ロール制約を追加していない

### A-3. 自己承認チェックの SQL 不整合を修正

`approve` 内で `job.get("requester_user_id")` を参照している一方、SQL が `requester_user_id` を SELECT していなかった。

修正:

```sql
select status, params, requester_user_id
  from report_request
 where request_id = ? and template_id = 'euc-query'
```

これで `approve_sameRequester_returns409` の意図と実装が揃った。

### A-4. Spring MockMvc 2 件追加

`apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`

追加:
- `list_withWindowRole_returns403`
- `approve_withWindowRole_returns403`

`@WebMvcTest` ではメソッドセキュリティが自動で有効にならないため、テスト内に `@EnableMethodSecurity` 用の `MethodSecurityConfig` を追加。
既存の ADMIN テストは `jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))` に寄せた。

### A-5. テスト件数ドキュメントを更新

更新:
- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

件数:

| カテゴリ | 件数 |
| --- | ---: |
| Spring MockMvc + Unit | 87 |
| Spring Testcontainers IT | 20 |
| Vitest | 47 |
| Playwright Node API | 13 |
| Playwright a11y | 7 |
| OpenAPI diff (CI) | 1 |
| 合計 | 175 |

コミット:
- `b009037 feat: restrict euc approvals to admin`

## 2. 検証結果

ローカル実行結果:

```text
mvn -B -Dtest=EucControllerTest test
  17 件 PASS

mvn -B test
  107 件 (87 PASS + 20 SKIP)
  ※ Docker 未起動のため Testcontainers IT 20 件は SKIP

npm run check
  PASS

npm run web:test
  47 件 PASS

npm run smoke
  PASS

npm run e2e:api
  13 件 PASS

npm run web:build
  PASS (228.37 KB / gzip 71.24 KB)
```

## 3. 変更ファイル

### 新規
- `CLAUDE_HANDOFF_36.md`
- `CLAUDE_HANDOFF_37.md`（このファイル）

### 変更
- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `README.md`
- `docs/gap_matrix.md`
- `docs/euc_fields.md`

## 4. 残タスク優先順

### A. 承認統制の強化
1. 二人承認 / 多段承認
   - `report_approval.step` を使った承認ルート定義
   - 現状は ADMIN 1 名承認 + 自己承認 409
2. REJECT 後の再申請ポリシー
   - 新規 request として再申請するか、既存 request の status 遷移を許すか決める
3. 承認操作の UI 配置整理
   - `ReportsView` には実装済み
   - `AdminView` に管理者用承認キューを置くか検討

### B. 個人番号出力の本実装
- `myNumber` は現状、二段階承認判定用
- CSV 出力 SQL の `FIELD_EXPRESSIONS` には未登録
- 復号、マスク、監査、出力可否の設計が必要

### C. EUC パスワード通知の別経路化
- 現状 `X-Euc-Password` ヘッダで返却
- メール / SMS / 庁内通知などへの分離が必要
- `passwordHash` は専用 audit/event 化したい

### D. PDF/A-2b 真の適合 / 残り帳票
- Noto CJK 明示 `useFont`
- ICC sRGB profile 埋め込み
- veraPDF `|| ::warning::` を `|| exit 1` に戻す
- 0010002–0010019 / 年報の form_id 別レイアウト

## 5. 注意点

- `@PreAuthorize` の MockMvc テストでは `@EnableMethodSecurity` をテストスライス側に明示する必要がある。
- `jwt().jwt(j -> j.claim("roles", ...))` だけでは `@PreAuthorize("hasRole")` の authority 判定に乗らないため、テストでは `jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))` を使う。
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。

## 6. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_36.md → CLAUDE_HANDOFF_37.md を読んで続きから。

Codex round 37 追加分:
- CLAUDE_HANDOFF_36.md を Git 管理に追加
- GET /api/v1/euc と POST /api/v1/euc/{jobId}/approve を ADMIN ロール限定化
- approve SQL に requester_user_id を追加し、自己承認チェックの不整合を修正
- EucControllerTest に WINDOW 403 テスト 2 件追加
- MockMvc EUC 15 → 17 件、Spring 105 → 107 件、総計 173 → 175 件
- README / gap_matrix / euc_fields を更新

確認済み:
- mvn -B -Dtest=EucControllerTest test: 17 件 PASS
- mvn -B test: 107 件 (87 PASS + 20 SKIP)
- npm run check: PASS
- npm run web:test: 47 件 PASS
- npm run smoke: PASS
- npm run e2e:api: 13 件 PASS
- npm run web:build: PASS

次の優先:
1. EUC 二人承認 / 多段承認
2. REJECT 後の再申請ポリシー
3. 個人番号出力の復号・マスク・監査
4. EUC パスワード通知の別経路化
5. PDF/A-2b 真適合 + 残り帳票

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
