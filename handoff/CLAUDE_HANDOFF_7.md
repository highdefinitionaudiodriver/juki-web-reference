# Codex → Claude Code 引き継ぎメモ #7

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_6.md`

## 1. このラウンドで完了したこと

### A1. `/codes/jumin` / `/codes/mynumber` 本実装

- Spring `ResidentSupplementController`
  - `ISSUE / CHANGE / FIX` を検証
  - 住民存在チェック
  - 現行コード存在チェック
  - `CHANGE / FIX` 時に旧現行レコードの `valid_to` を設定
  - 通知票を `CertificateIssueService` で同時発行
- Node API
  - `/api/v1/codes/jumin`
  - `/api/v1/codes/mynumber`
  - 同じ状態遷移と通知票返却を実装
- 帳票 ID
  - `0010009`: 住民票コード付番通知票
  - `0010010`: 個人番号付番通知票
  - `0010011`: 住民票コード・個人番号変更/修正通知票
- OpenAPI / generated types / Web API wrapper を同期
- MockMvc 3 件、Node E2E 1 件を追加

コミット: `1899a74 feat: implement code issue notifications`

### A2. 外国人在留情報 + 満了 30 日前通知

- Spring `PUT /residents/{residentId}/foreigner`
  - 住民存在チェック
  - `residencePeriodEnd` 必須化
  - `resident_foreigner` upsert
  - `resident.nationality` 更新
  - `expiresWithin30Days` を返却
- Spring `POST /reports/foreigner-expiring`
  - `baseDate` + `days` で在留期限対象者を抽出
  - 対象者へ `0010012` を `CertificateIssueService` で発行
- Node API に同等実装
- 帳票 ID
  - `0010012`: 在留期間満了事前通知票
- OpenAPI / generated types / Web API wrapper を同期
- MockMvc 2 件、Node E2E 1 件を追加

コミット: `55cb6fe feat: add foreigner expiry notices`

### A3. 連携 `/link/*` の戸籍受領を本実装化

- Spring `LinkController`
  - `/link/internal/koseki` で `noticeType` を分岐
  - `BIRTH` → `TransactionController.birth`
  - `DEATH` → `TransactionController.death`
  - `MARRIAGE / DIVORCE / ADOPTION` → `TransactionController.koseki`
  - `link_event.transaction_id` に反映済み異動を紐づけ
  - その他の連携口は `ACCEPTED` で受領ログ
- Node API に同等の戸籍連動受領を実装
- OpenAPI に `KosekiLinkReq` / `LinkAcceptResult` / `LinkApplyResult` を追加
- Node E2E 1 件を追加

コミット: `fc49273 feat: apply koseki link events`

### C1. `SCR-421` 職権異動画面

- Web `OfficialView.tsx` を追加
  - 職権異動の起票
  - 決裁ルート表示用入力
  - `APPROVE / CONDITIONAL / REMAND / REJECT`
- `App.tsx` にナビ `職権異動` を追加
- `api.ts` に `officialTransaction` / `approveTransaction` を追加
- Node API に `/transactions/official` と `/{txId}/approve` の互換実装を追加
- Node E2E 1 件を追加

コミット: `865e4a0 feat: add official transaction view`

## 2. 検証結果

最終確認:

```text
npm run check        PASS
npm run web:build    PASS
npm run e2e:api      PASS: 10 tests
mvn -B test          PASS: 23 tests (21 PASS + 2 SKIP)
```

補足:

- `ResidentApiIT` は Docker / Testcontainers 不在のため 2 SKIP。従来どおり。
- `web:build` は Vite production build OK。
- OpenAPI generated types は `npm run generate:openapi` 済み。

## 3. 主な変更ファイル

### Spring

- `apps/api-spring/src/main/java/jp/go/local/resident/api/ResidentSupplementController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/ReportController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/LinkController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/service/CertificatePdfService.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/ResidentSupplementControllerTest.java`

### Node / E2E

- `apps/api/src/server.js`
- `tests/e2e/golden-path.api.spec.ts`

### Web

- `apps/web/src/views/OfficialView.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/types.ts`
- `apps/web/src/print/CertificateTemplate.tsx`

### API / Docs

- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`
- `docs/gap_matrix.md`

## 4. 残タスク優先順

1. 帳票残り
   - `CertificatePdfService` の `form_id` 別 HTML レイアウト分岐
   - 0010002〜0010019、年報
   - 今回 0010009〜0010012 はタイトルだけ対応。専用レイアウトは未実装。
2. 連携 9 系統の業務別ペイロード反映
   - 税 / 国保 / 選挙 / コンビニ / マイナポータルなど
   - 現状は戸籍のみ異動反映、その他は受領ログ。
3. Keycloak Authorization Code + PKCE
   - `apps/web/src/auth.ts` の password dev login を置換
   - Spring Resource Server との実接続確認
4. Testcontainers IT 拡充
   - `HouseholdSplitMergeIT`
   - `/transactions/koseki` の改氏/復氏/養子縁組パターン
   - `/link/internal/koseki` の DB 実検証
5. 非機能
   - OpenAPI diff CI
   - axe-core A11y
   - PDF/A-2b の Linux + Noto CJK + veraPDF 検証

## 5. 注意点

- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止。
- 個人番号・住民票コードは平文表示・ログ・帳票出力に権限制御が必要。今回の Node/Spring API は結果返却に値を含むため、本番化時はロール・監査・マスク方針を再確認すること。
- `LinkController` は Spring 内で `TransactionController` を直接呼び出す簡易実装。将来はサービス層へ移す方がよい。
- Node API は開発用互換実装。Spring を正とする。

## 6. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_6.md → CLAUDE_HANDOFF_7.md を読んで続きから。

Codex round 7 追加分:
- /codes/jumin, /codes/mynumber: ISSUE/CHANGE/FIX + 0010009〜0010011 通知票
- /residents/{id}/foreigner: 在留情報 upsert + 30日前フラグ
- /reports/foreigner-expiring: 在留期限 30日前抽出 + 0010012 発行
- /link/internal/koseki: 戸籍受領から BIRTH/DEATH/KOSEKI を内部反映
- Web SCR-421 OfficialView: 職権異動 起票/決裁
- Node E2E は 10 件 PASS、Spring mvn test は 23 件 (21 PASS + 2 SKIP)

次の優先:
1. CertificatePdfService の form_id 別レイアウト分岐（0010002〜0010019）
2. 税/国保/選挙/コンビニ/マイナポータル連携の業務別ペイロード反映
3. Keycloak Authorization Code + PKCE
4. Testcontainers IT 拡充

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
