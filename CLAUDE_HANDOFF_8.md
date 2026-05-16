# Claude → Codex 引き継ぎメモ #8

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_7.md`（Codex round 7: /codes, /foreigner, /link/internal/koseki, SCR-421）

## 1. このラウンドで完了したこと

### A. 帳票: form_id 別レイアウト分岐

`CertificatePdfService` を 1 テンプレ → 3 テンプレに分岐:

| form_id | テンプレ | 内容 |
| --- | --- | --- |
| 0010001/0010002/0010003/0010004/0010005/0010007/0010008 | `certificate-template.html` | 住民票・除票・記載事項証明・閲覧用一部の写し・転出証明 系の本体帳票 |
| 0010009/0010010/0010011 | `notice-template.html` (新規) | 住民票コード／個人番号 通知票 |
| 0010012 | `foreigner-expiry-template.html` (新規) | 在留期間満了事前通知（30日前）。`resident_foreigner` 参照、残日数を計算して "○○ 日" 表示 |
| 0010013〜0010019 | `notice-template.html` | 通称変更・住所異動受理・職権処理・成年後見人異動・住居表示・町名整理 |

`titleFor()` に 0010008/0010013〜0010019 を追加（標準仕様書 4 章 表 20.1〜20.5 の名称）。

### B. 連携 9 系統の業務別ペイロード

`LinkController` を「全部受領ログのみ」から **業務別分岐** に拡張:

| エンドポイント | 業務処理 |
| --- | --- |
| `POST /link/cs/inbound` | residentId + fourInfo を受領し 4情報照合。status=MATCH/MISMATCH/NOT_FOUND、differences[] を返却 |
| `POST /link/number/inbound` | operation=ISSUE_LINK / LOOKUP / その他 を分岐。ISSUE_LINK は符号を払出、LOOKUP は住民の 4 情報を返却 |
| `POST /link/internal/{partner}` | partner ごとに分岐<br>・KOSEKI → 既存の戸籍連動<br>・TAX / INSURANCE / ELECTION → residentIds を受けて 4 情報相当を提供（個人番号・住民票コードは返さない）<br>・CVS / MYNAPORTAL / その他 → 受領ログのみ |
| `POST /link/application/inbound` | 受領ログ（後段で職員審査→/transactions/* を想定） |

`link_event` テーブルに全イベント INBOUND として監査記録、JSON payload も jsonb で保存。

Node `apps/api/src/server.js` にも同等の業務分岐を実装（Spring と挙動同期）。

### C. テスト

#### Spring `LinkControllerTest` （新規 7 件、@WebMvcTest）

- `cs_inbound_match_returns_200_MATCH`
- `cs_inbound_residentNotFound_404`
- `number_inbound_issueLink_returns_symbol`
- `internal_tax_provides_filtered_four_info`
- `internal_tax_missing_residentIds_400`
- `internal_cvs_accept_202`
- `internal_koseki_noticeType_required_400`

#### Node E2E 追加 3 件（→ 全 13 件 PASS）

- CS 連携 4 情報照合（MATCH / MISMATCH / 不在 404）
- 庁内連携 TAX 住民データ提供 + residentIds 必須
- 番号連携 LOOKUP

## 2. 検証結果

```
mvn -B test          30 件 (28 PASS + 2 SKIP / Docker なしの IT のみ)
npm run check        PASS
npm run smoke        PASS
npm run web:build    PASS (223.92 KB / gzip 70.0 KB)
npm run e2e:api      13 件 PASS
```

コミット: `7ad8e6c feat: 帳票 form_id 別レイアウト分岐 / 連携 9 系統の業務別ペイロード反映`

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/main/resources/notice-template.html`
- `apps/api-spring/src/main/resources/foreigner-expiry-template.html`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/LinkControllerTest.java`

### 変更
- `apps/api-spring/src/main/java/jp/go/local/resident/service/CertificatePdfService.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/LinkController.java`
- `apps/api/src/server.js`
- `tests/e2e/golden-path.api.spec.ts`

## 4. 残タスク（優先順）

### A. 認証・本番化
1. **Web から Keycloak Authorization Code + PKCE**: `apps/web/src/auth.ts` の `loginWithPassword` を置換。`docs/oidc_setup.md` で実 IdP との接続済まで誘導
2. **Spring との実接続テスト**: `mvn spring-boot:run` + Keycloak で実 JWT 検証
3. **個人番号・住民票コード平文返却の監査強化**: 現在 `/codes/*` の結果に値が含まれる。本番化時はロール・監査・マスク方針を再確認

### B. 帳票
1. **PDF/A-2b の実検証**: `Dockerfile` を `apps/api-spring/` に追加（base: eclipse-temurin:21-jre + apt-get install fonts-noto-cjk）。CI で `mvn package` → docker build → veraPDF で PDF/A 適合性検証
2. **0010002 / 0010003 / 0010005 の専用テンプレ**: 現状は本体テンプレに統合だが、レイアウト差分がある（記載事項証明は項目選択式、閲覧用は世帯一覧形式 等）
3. **帳票 0010006 / 年報 (20.6)**: 未対応の form_id

### C. テスト
1. **`HouseholdSplitMergeIT`** (Testcontainers): SPLIT で世帯員が移動していること、MERGE で closed_date が設定されること
2. **`/transactions/koseki` 完全網羅 IT**: 改氏 / 復氏 / 養子縁組 のパターン
3. **`/link/internal/{tax,insurance,election}` IT**: 実 PG で 4 情報抽出を検証
4. **Web 単体テスト**: Vitest + React Testing Library で `RestrictionView` / `OfficialView` / `CertificateView`

### D. 非機能
1. **OpenAPI diff を CI に組み込み**: Spring 起動 → `npm run openapi:diff` で差分検出
2. **アクセシビリティ**: Playwright + `axe-core` で WCAG AA
3. **OWASP ASVS Lv2 セルフチェック**

## 5. 注意点

- `LinkController` は Spring 内で `TransactionController` を直接呼び出す簡易実装（Codex round 7 から継承）。本実装では Service 層に切り出すこと
- `/link/internal/{tax,insurance,election}` は提供データから個人番号・住民票コードを意図的に除外している。本番では「業務同意済の項目セット」を `link_partner.allowed_fields` 等で管理すべき
- `notice-template.html` の `codeValue` は現状マスク済を表示。実運用では送付経路（封緘郵送 vs 窓口手交）で平文/マスク切替方針を決めること
- 在留期間満了通知の残日数は `issued_at` (timestamp) と `residence_period_end` (date) の差で算出。タイムゾーンに注意

## 6. 設計トレーサビリティ

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts (auto-gen)
└─→ apps/web/src/types.ts
└─→ apps/web/src/views/*.tsx
└─→ apps/api/src/server.js
└─→ apps/api-spring/src/main/java/.../*.java
└─→ apps/api-spring runtime /v3/api-docs (tools/openapi-diff.mjs で照合)
```

機能 ID / 画面 ID / 帳票 ID / API-ID の **改名禁止**。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_7.md → CLAUDE_HANDOFF_8.md を読んで続きから。

Claude round 8 追加分:
- CertificatePdfService を form_id 別 3 テンプレに分岐
  (notice-template / foreigner-expiry-template を新規)
  0010008 / 0010013〜0010019 のタイトルも追加
- LinkController に業務別ペイロード処理を追加
  - CS: 4 情報照合 (MATCH/MISMATCH/NOT_FOUND)
  - NUMBER: ISSUE_LINK で符号、LOOKUP で 4 情報
  - TAX/INSURANCE/ELECTION: residentIds で 4 情報相当を提供
    (個人番号・住民票コードは返さない)
- Node 版にも同等の分岐を実装
- Spring LinkControllerTest 7 件、Node E2E 3 件追加
- mvn test 30 件 (28 PASS + 2 SKIP), npm e2e:api 13 件 PASS

次の優先 (CLAUDE_HANDOFF_8.md セクション 4):
A1. Web から Keycloak Authorization Code + PKCE
A2. Spring との実接続テスト
B1. PDF/A-2b 実検証 Docker + veraPDF
B2. 0010002 / 0010003 / 0010005 の専用テンプレ
C1. HouseholdSplitMergeIT (Testcontainers)
C2. /transactions/koseki 完全網羅 IT
D1. OpenAPI diff を CI に

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
