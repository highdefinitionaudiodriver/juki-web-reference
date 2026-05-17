# Claude → Codex 引き継ぎメモ #16

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_15.md`（Codex round 15: openapi-diff の continue-on-error 削除 / App.test 拡張）

## 1. このラウンドで完了したこと

### A. 🐛 openapi-diff CI バグ修正 → **3 ジョブ全 success**

#### 発見した問題
前ラウンドで CI が有効化された後、`openapi-diff` ジョブが **drift 86 件** で常時失敗していた。

#### 原因
`tools/openapi-diff.mjs` の path 比較が、spec と runtime のサーバベース URL を正規化していなかった:
- **spec** (`c_openapi.yaml`): `servers.url` に `/api/v1` がベイク済なので paths は `/residents/search`
- **runtime** (`Spring /v3/api-docs`): `@RequestMapping("/api/v1")` を含むため `/api/v1/residents/search`

加えて、パス変数名の表記揺れもあった:
- spec: `/residents/{residentId}`
- runtime: `/residents/{id}`

#### 修正
1. `serverBasePath()` を追加し `servers[0].url` からパス部分（例 `/api/v1`）を抽出
2. `normalizePath()` を追加し:
   - basePath を含まない path には付与
   - パス変数名 `{x}` を `{_}` に統一して構造比較
3. これで drift は **86 → 4 件** に減少

#### 残 4 件の真の実装漏れ → Spring に追加実装
- `GET /me`
- `POST /auth/login`
- `POST /auth/logout`
- `PUT /residents/{id}`

新規: `apps/api-spring/src/main/java/jp/go/local/resident/api/AuthController.java`
- `/auth/login`: 501 NOT_IMPLEMENTED（本番は IdP 経由）
- `/auth/logout`: 204
- `/me`: JWT クレームから自身情報を返す

変更: `apps/api-spring/src/main/java/.../api/ResidentController.java`
- `PUT /residents/{id}`: 軽微修正スタブ

→ **drift 0 件、CI 3 ジョブ全 success 達成**

### B. App.tsx 統合テスト 4 件追加（合計 28 件 PASS）

`apps/web/src/App.test.tsx` に追加:
- 証明発行後に verifyToken と手数料の notice 表示
- 抑止登録後に成功 notice 表示
- 住基年報の集計依頼後の notice 表示
- EUC 抽出依頼後の結果 URL notice 表示

`apiMocks` に `issueCertificate` / `createRestriction` / `deleteRestriction`
/ `annualReport` / `eucQuery` を追加。

## 2. 検証結果

```
mvn -B test          61 件 (52 PASS + 9 SKIP / Docker なしの IT 群)
npm run check        PASS
npm run web:test     28 件 PASS (Vitest, App.test.tsx 8 件 含む)
npm run smoke        PASS
npm run web:build    PASS (227.25 KB / gzip 71.19 KB)
```

GitHub Actions:
- Web + Node API: ✅ success
- Spring Boot + Testcontainers: ✅ success
- **OpenAPI diff (spec ⇔ Spring runtime): ✅ success**（diff = 0）

コミット:
- `2f76198 fix: openapi-diff の path 正規化と Spring 未実装 4 件を追加`
- `f61f5a5 test: App.tsx に証明発行/抑止/年報/EUC notice テストを追加`

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/main/java/jp/go/local/resident/api/AuthController.java`

### 変更
- `tools/openapi-diff.mjs`（path 正規化）
- `apps/api-spring/src/main/java/.../api/ResidentController.java`（PUT /{id} 追加）
- `apps/web/src/App.test.tsx`（notice テスト 4 件追加）

## 4. 残タスク優先順

### A. 認証本番化
1. **Keycloak + Spring + Web の実 OIDC E2E**:
   - `tests/e2e/spring-oidc.spec.ts` 新設
   - 有効 JWT / 無効 JWT / ロール不足 を確認
   - `apps/api-spring/keycloak-realm/juki-realm.json` で投入済の 3 ユーザを利用
2. `/me` の Spring 実装は JWT クレーム前提。Keycloak の token mapper で
   `name` / `department` / `roles` claim が出ているか実機確認

### B. PDF/A
1. **veraPDF 実検証**:
   - `apps/api-spring/Dockerfile` で build（`fonts-noto-cjk` 同梱）
   - 起動 → `/api/v1/certificates/{id}/pdf` 取得 → veraPDF
   - CI ジョブ `pdfa-verify` として組み込み

### C. テスト
1. **`AuthControllerTest` MockMvc**:
   - `/me` の JWT 解釈
   - `/auth/login` の 501
2. **`ResidentController#patch` MockMvc**:
   - 抑止対象は 404
   - 通常は 200 + accepted
3. **Web View テスト**: `OfficialView` / `MoveView` の細部
4. **a11y CI 安定化**: Windows ローカルで webServer 終了待ちが timeout する問題

### D. ドキュメント
- `docs/gap_matrix.md`: openapi-diff CI 動作中、Spring 53 controller method、Vitest 28 件
- README に CI ステータスバッジ追加

## 5. 注意点

- `openapi-diff` は **パス変数名を構造比較** する。例えば spec の `{residentId}` と
  Spring の `{id}` を同一視する。実装側で命名を揃えるリファクタは引き続き推奨だが、
  CI を壊さない
- `AuthController#login` は本番では 501 を返す（IdP 経由を強制）。dev で Node 経路を
  使うユースケースは `apps/api` 側に残る
- `/me` の Spring 実装は JWT クレーム前提。匿名 (`ci` プロファイル) では
  すべて null 返却
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 6. 設計トレーサビリティ

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts
└─→ apps/web/src/types.ts → views/*.tsx [Vitest 28件]
└─→ apps/api/src/server.js
└─→ apps/api-spring/src/main/java/.../*.java [MockMvc + IT 61件]
└─→ /v3/api-docs ← tools/openapi-diff.mjs ← CI で自動検証（drift=0）
```

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_15.md → CLAUDE_HANDOFF_16.md を読んで続きから。

Claude round 16 追加分:
- openapi-diff CI の path 正規化バグを修正 (86 件 drift → 0 件)
  servers.url の baseUrl と path 変数名 {x}→{_} を正規化
- Spring に AuthController 新設 (/me, /auth/login, /auth/logout) と
  ResidentController#patch (PUT /residents/{id}) を追加
- App.tsx notice テスト 4 件追加 (証明発行/抑止/年報/EUC)
- GitHub Actions 3 ジョブとも success 確認 (web-and-node / spring / openapi-diff)

確認済み:
- mvn -B test: 61 件 (52 PASS + 9 SKIP)
- npm run web:test: 28 件 PASS
- npm run check / smoke / web:build: 全 PASS
- CI: 3 ジョブとも success (openapi-diff drift=0)

次の優先 (CLAUDE_HANDOFF_16.md セクション 4):
A. Keycloak + Spring + Web の実 OIDC E2E (spring-oidc.spec.ts)
B. PDF/A veraPDF 検証 + CI 組み込み
C1. AuthControllerTest / ResidentController#patch の MockMvc
C2. Web View テスト拡充

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
