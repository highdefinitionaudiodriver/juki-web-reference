# Claude → Codex 引き継ぎメモ #6

最終更新: 2026-05-16  
担当: Claude Code (Opus 4.7)  
前回: `docs/history/CLAUDE_HANDOFF_5.md`（springdoc, OpenHTMLtoPDF, Spring smoke）  
本書: 直近のラウンドで Claude が加えた変更と、Codex に依頼する次の作業

## 1. このラウンドで完了したこと

### 機能拡張

| 項目 | 状況 |
| --- | --- |
| **Spring `/transactions/household` SPLIT/MERGE** | ✅ HEAD_CHANGE / SPLIT / MERGE を operation 分岐で完全実装。世帯員の household_member 付け替え、合併元の closed_date 設定、`HEAD_NOT_IN_HOUSEHOLD` / `CANNOT_SPLIT_ALL` / `HOUSEHOLD_EMPTY` 等のガード付き |
| **PDF サービス: PDF/A-2b スイッチ + 和文フォント埋め込み** | ✅ `certificate.font.serif-jp` で TTF/OTF 指定、`certificate.pdfa=true` で PDF/A-2b conformance（フォント無しなら自動フォールバック） |
| **Web: PDF ダウンロード導線** | ✅ `CertificateView` 発行後に「PDF を表示 / PDF をダウンロード / 改ざん防止コード検証」の 3 リンクを notice カードで表示 |
| **CI YAML 強化** | ✅ web-and-node と spring の 2 ジョブに分離、失敗時は Playwright report / Surefire reports をアーティファクト保存、`docker info` で Testcontainers 事前確認 |
| **Spring `/transactions/birth`** | ✅ 親世帯への新生児登録（親の在籍チェック、resident + household_member 登録、`ResidentChangedEvent` 発行） |
| **Spring `/transactions/death`** | ✅ 既除票チェック、moved_out_date 設定、世帯主だった場合は `head_resident_id` クリア + `HEAD_CHANGE_REQUIRED` アラート返却 |
| **Node 同等の BIRTH / DEATH** | ✅ apps/api/src/server.js に対応エンドポイント |
| **E2E**: 出生連動 / 死亡連動 + 重複死亡 409 | ✅ golden-path.api.spec.ts に 2 件追加 → 6 件 PASS |
| **Web: 抑止設定画面 (SCR-301)** | ✅ `RestrictionView.tsx` 新規追加。DV/STALKER/CHILD_ABUSE/OTHER × SELF/HOUSEHOLD の登録フォーム、現行抑止一覧、解除ボタン |
| **Keycloak dev IdP** | ✅ docker-compose に `keycloak` サービス、`keycloak-realm/juki-realm.json` で realm 自動投入（4 ロール + 3 ユーザ + roles claim mapper）。`docs/oidc_setup.md` に手順 |
| **Spring `/transactions/koseki`** | ✅ MARRIAGE / DIVORCE / ADOPTION を分岐、新氏指定で resident 更新、reason 別 (`KOSEKI_MARRIAGE` 等) で event 発行 |
| **Spring MockMvc テスト 12 件** | ✅ `@WebMvcTest + Mockito` で death / birth / cancel / household / koseki のバリデーション・存在チェック・状態違反を網羅。**Docker 不要なので CI で常に実行** |

### リポジトリ点検で見つけた不整合の修正

| # | 問題 | 修正 |
| - | --- | --- |
| 1 | `README.md` の `git clone` URL が旧名 `-_Web-` | `juki-web-reference` に修正 |
| 2 | `tools/build_design.py` に `G:\マイドライブ\...` の絶対パスをハードコード | `Path(__file__).parent.parent` を基準に変更、`argv[1]` / `OUT` 環境変数で上書き可 |
| 3 | `playwright.config.ts`（デフォルト）が `spring-*.spec.ts` を巻き込み、Spring 未起動時 `npm run e2e` が壊れる | `testIgnore: ["spring-*.spec.ts"]` で除外 |
| 4 | `docs/gap_matrix.md` が「Codex MVP・Vanilla JS・37.5%」のまま現状と乖離 | 完全リライト（API 62%+、画面 7 view、認証 60%、抑止権限 100%、履歴 80%、PDF 70%） |

## 2. 検証結果（最終グリーン）

```
mvn -B test          ✓ 18 件 (16 PASS + 2 SKIP / Docker なしの IT のみ)
                       ── 新規 MockMvc 12 件含む
npm run check        ✓
npm run smoke        ✓
npm run web:build    ✓ 220KB / gzip 69.2KB
npm run e2e:api      ✓ 6 件 PASS
```

CI（GitHub Actions Linux + Docker）では `ResidentApiIT` も自動実行される想定。

## 3. ファイル変更・追加サマリ

### 新規
| パス | 役割 |
| --- | --- |
| `apps/web/src/views/RestrictionView.tsx` | 抑止設定画面 (SCR-301) |
| `apps/api-spring/keycloak-realm/juki-realm.json` | Keycloak realm 自動投入用 |
| `docs/oidc_setup.md` | Keycloak 起動手順と本番差し替えポイント |
| `apps/api-spring/src/test/java/.../api/TransactionControllerTest.java` | MockMvc 12 件 |
| `CLAUDE_HANDOFF_6.md` | 本書 |

### 主要変更
| パス | 内容 |
| --- | --- |
| `apps/api-spring/src/main/java/.../api/TransactionController.java` | SPLIT / MERGE / BIRTH / DEATH / KOSEKI を本実装 |
| `apps/api-spring/src/main/java/.../service/CertificatePdfService.java` | PDF/A-2b + 和文フォント埋め込み |
| `apps/api-spring/docker-compose.yaml` | Keycloak サービス追加、PG に healthcheck |
| `apps/api-spring/src/main/resources/application.yaml` | `certificate.font.serif-jp` / `certificate.pdfa` 設定キー追加 |
| `apps/api-spring/pom.xml` | （前回ラウンド）openhtmltopdf + springdoc 追加 |
| `apps/api/src/server.js` | Node 版 BIRTH / DEATH |
| `apps/web/src/api.ts` | `createRestriction` / `deleteRestriction` / `birth` / `death` |
| `apps/web/src/App.tsx` | restriction ナビ追加 |
| `apps/web/src/types.ts` | `ViewId` に `"restriction"` 追加 |
| `apps/web/src/views/CertificateView.tsx` | PDF ダウンロード導線 |
| `.github/workflows/ci.yml` | 2 ジョブ並列化 + アーティファクト保存 |
| `playwright.config.ts` | spring-*.spec.ts 除外 |
| `tests/e2e/golden-path.api.spec.ts` | BIRTH / DEATH テスト追加 |
| `tools/build_design.py` | ハードコード解消 |
| `README.md` | git clone URL 修正 |
| `docs/gap_matrix.md` | 現状反映でリライト |

## 4. Codex 継続タスク（優先順）

### A. 機能拡張
1. **`/codes/jumin` / `/codes/mynumber` の本実装**: 付番 / 変更 / 修正 + 帳票 0010009 / 0010010 / 0010011 の通知票
2. **`/residents/{id}/foreigner`**: 在留資格・在留期間管理。在留期間満了の 30 日前抽出バッチで 0010012 を発行
3. **連携 `/link/*` 9 系統**: CS / 番号 / 戸籍 / 税 / 国保 / 選挙 / 申請管理 / コンビニ / マイナポータルのスケルトンを本実装に。最初は戸籍連動受領（`/link/internal/koseki` → `/transactions/{birth,death,koseki}` を内部呼び出し）が現実的
4. **`HouseholdSplitMergeIT`** (Testcontainers): SPLIT で世帯員が想定通り新世帯に移っていること、MERGE で合併元が closed_date 設定済になっていること
5. **`/transactions/koseki` の完全網羅テスト**: 改氏 / 復氏 / 養子縁組 の各パターンを Testcontainers IT で

### B. 帳票
1. **0010009 住民票コード通知票** など、`CertificatePdfService` の form_id ごとに HTML テンプレを分岐
2. **PDF/A-2b の実検証**: Docker イメージに `fonts-noto-cjk` を入れて、Linux で `certificate.pdfa=true` + `serif-jp` 指定 → veraPDF などで PDF/A 適合性検証

### C. UI
1. **`SCR-421` 職権異動画面**: 起票 → 決裁ルート表示 → 承認/差戻/却下。すでに Spring 側 `/transactions/official` + `/{txId}/approve` は実装済
2. **戸籍連動の Web UI**: BIRTH / DEATH / KOSEKI を `MoveView` に追加するか、専用 view を切る
3. **Web から Keycloak 経由ログイン**: Authorization Code + PKCE。`apps/web/src/auth.ts` の `loginWithPassword` を置換

### D. 非機能
1. **CI に `mvn -B test` の Testcontainers 実行結果を確認**: Linux runner で Docker が動くか、`ResidentApiIT` が PASS するかを actions ログで検証
2. **OpenAPI diff を CI に組み込み**: Spring を起動して `npm run openapi:diff -- --spring http://localhost:8788/v3/api-docs` を回す
3. **アクセシビリティ**: Playwright + `axe-core` で WCAG AA 違反 0 件

## 5. 設計トレーサビリティ（再掲）

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts (auto-gen by openapi-typescript)
└─→ apps/web/src/types.ts (re-export)
└─→ apps/web/src/views/*.tsx
└─→ apps/api/src/server.js (Node)
└─→ apps/api-spring/src/main/java/.../*.java (Spring)
└─→ apps/api-spring runtime /v3/api-docs ← tools/openapi-diff.mjs で照合
```

機能 ID / 画面 ID / 帳票 ID / API-ID の **改名禁止**。

## 6. 最小再開プロンプト

```text
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
docs/history/CLAUDE_HANDOFF_5.md → CLAUDE_HANDOFF_6.md を読んで続きから。

Claude round 6 追加分:
- Spring: SPLIT/MERGE/BIRTH/DEATH/KOSEKI 本実装
- Spring: MockMvc テスト 12 件 (death/birth/cancel/household/koseki のバリデーション網羅)
- Web: 抑止設定画面 SCR-301 (RestrictionView)、CertificateView の PDF DL 導線
- Keycloak dev IdP: docker-compose + realm JSON 自動投入 + docs/oidc_setup.md
- Node 版にも BIRTH / DEATH 追加、E2E 6 件 PASS
- リポジトリ点検: README URL 修正、build_design.py のハードコード解消、
  playwright.config.ts の spring 除外、gap_matrix.md 全面更新

確認済み:
- mvn -B test: 18 件 (16 PASS + 2 SKIP, Docker なしのため IT は skip)
- npm run check / smoke / web:build / e2e:api: PASS

次の優先 (CLAUDE_HANDOFF_6.md セクション4):
A1. /codes/jumin と /codes/mynumber + 通知票 0010009-0010011
A2. /residents/{id}/foreigner + 在留期間バッチ + 0010012
A3. /link/* 9 系統 (戸籍受領が一番現実的なスタート)
B1. CertificatePdfService の form_id 別 HTML テンプレ分岐
B2. PDF/A-2b 実検証 (fonts-noto-cjk 入り Docker + veraPDF)
C1. SCR-421 職権異動画面
C3. Web から Keycloak で Authorization Code + PKCE ログイン

ChromeOS Flex / Chromium 最新 2 世代 互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
