# Claude → Codex 引き継ぎメモ #10

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_9.md`（Codex round 9: PKCE / Dockerfile / HouseholdSplitMergeIT）

## 1. このラウンドで完了したこと

### A. Spring `KosekiIT`（Testcontainers + MockMvc）

新規: `apps/api-spring/src/test/java/jp/go/local/resident/KosekiIT.java`

実 PostgreSQL コンテナで `/transactions/koseki` を網羅検証:

| テスト | 検証内容 |
| --- | --- |
| `marriage_updatesFamilyName_andEmitsKosekiMarriageReason` | 婚姻改氏で `resident.family_name_kanji/kana` が更新される。`reasonCode=KOSEKI_MARRIAGE`、`familyNameChanged=true`、`kosekiNoticeId` も透過 |
| `divorce_restoresFormerFamilyName` | 離婚復氏で氏が更新 |
| `adoption_recordsTransactionWithoutNameChange` | 養子縁組で `transaction` レコードが作成され、氏は変更されない |
| `koseki_alreadyRemoved_returns409` | 除票済み住民への戸籍連動は 409 `ALREADY_REMOVED` |
| `koseki_invalidKind_returns400` | kind 不正は 400 `VALIDATION_ERROR` |

Docker 不在環境では `@Testcontainers(disabledWithoutDocker=true)` で skip。

### B. Web Vitest + React Testing Library

新規依存（apps/web/devDependencies）:
- `vitest@^2.1.8` / `@testing-library/react@^16.1.0` / `@testing-library/jest-dom@^6.6.3`
- `@testing-library/user-event@^14.5.2` / `jsdom@^25.0.1`

新規ファイル:
- `apps/web/vite.config.ts` に test 設定（jsdom / globals / setupFiles）追加
- `apps/web/src/test/setup.ts`: jest-dom 拡張 + matchMedia スタブ
- `apps/web/src/views/RestrictionView.test.tsx`（4 件）
- `apps/web/src/views/SearchView.test.tsx`（3 件）

スクリプト:
- `apps/web` に `"test": "vitest run"` / `"test:watch"`
- ルート `package.json` に `"web:test"`

### C. Playwright axe-core a11y

新規依存: `@axe-core/playwright@^4.11.3`

新規: `tests/e2e/a11y.spec.ts`
- WCAG 2.1 AA + JIS X 8341-3 AA タグで違反 0 件を要求
- 対象: 住民検索 / 住民票 / 証明発行 の 3 画面

ルートに `"e2e:a11y"` スクリプト追加。Chromium バイナリ取得後に実行可能。

### D. CI 強化

`.github/workflows/ci.yml` に "Web unit tests (Vitest)" ステップを追加。
Linux runner で `npm run web:test` を自動実行。

## 2. 検証結果

```text
mvn -B test           37 件 (28 PASS + 9 SKIP / Docker なしの IT 群)
                        — KosekiIT 5 件 / HouseholdSplitMergeIT 2 件 / ResidentApiIT 2 件
npm run check         PASS
npm run web:test      7 件 PASS (Vitest)
npm run smoke         PASS
npm run web:build     PASS (227.20 KB / gzip 71.16 KB)
npm run e2e:api       13 件 PASS
```

コミット: `a681b74 test+ci: KosekiIT + Vitest セットアップ + axe-core a11y`

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/test/java/jp/go/local/resident/KosekiIT.java`
- `apps/web/src/test/setup.ts`
- `apps/web/src/views/RestrictionView.test.tsx`
- `apps/web/src/views/SearchView.test.tsx`
- `tests/e2e/a11y.spec.ts`

### 変更
- `apps/web/package.json` （Vitest deps + scripts）
- `apps/web/vite.config.ts` （test 設定）
- `package.json` （web:test / e2e:a11y / axe deps）
- `.github/workflows/ci.yml` （Vitest ステップ）

## 4. 残タスク優先順

### A. 認証・本番化
1. **Keycloak + Spring 実接続テスト**:
   - `docker compose -f apps/api-spring/docker-compose.yaml up -d postgres keycloak`
   - Spring を `OIDC_ISSUER=http://localhost:8080/realms/juki` で起動
   - Web の `OIDC` ボタンからログインし、Spring API へ Bearer access token でアクセス
   - 成果物: `docs/oidc_e2e.md` に実機 e2e 動作確認の手順

### B. 帳票
1. **PDF/A-2b veraPDF 実検証**:
   - `apps/api-spring/Dockerfile` で build → コンテナ起動 → PDF 取得 → veraPDF
   - CI に組み込み（jobs: pdfa-verify）
2. **0010002 / 0010003 / 0010005 の専用テンプレ**:
   - 記載事項証明書（項目選択式）/ 世帯連記 / 閲覧用一部の写し

### C. テスト
1. **OpenAPI diff CI**:
   - Spring を `mvn spring-boot:run` でバックグラウンド起動 → wait-on → `npm run openapi:diff`
   - `.github/workflows/ci.yml` の spring ジョブに追加
2. **Web View テスト拡充**:
   - `CertificateView.test.tsx`、`MoveView.test.tsx`、`OfficialView.test.tsx`、`ReportsView.test.tsx`
3. **a11y CI 実行**:
   - `e2e:install` 後に `e2e:a11y` を CI で実行
4. **Spring MockMvc 残コントローラ**:
   - `CertificateControllerTest` / `RestrictionControllerTest` / `LinkControllerTest`（既存と重複しない範囲で）

### D. その他
1. **gap_matrix.md の更新**: 認証 80%、テストカバレッジ表記など
2. **README に Vitest / a11y / KosekiIT のバッジ／コマンド追記**

## 5. 注意点

- a11y テストはブラウザ実行が必要。CI で動かすには `e2e:install` を先に呼ぶこと
- `RestrictionView.test.tsx` の最初の click は `mockResolvedValue(undefined)` 経由で非同期完了を待っているが、フォーム内の `setNote("")` が submit 後に発火するため、`act` 警告が出ても無視可能
- Vitest 用 `vite.config.ts` は `/// <reference types="vitest" />` を冒頭に付けないと型チェックで警告が出る場合あり（現状追加済）
- 機能 ID / 画面 ID / 帳票 ID / API-ID の **改名禁止** は維持

## 6. 設計トレーサビリティ

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts
└─→ apps/web/src/types.ts
└─→ apps/web/src/views/*.tsx [Vitest テスト追加可]
└─→ apps/api/src/server.js
└─→ apps/api-spring/src/main/java/.../*.java [MockMvc + Testcontainers IT]
└─→ apps/api-spring runtime /v3/api-docs (tools/openapi-diff.mjs)
```

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_9.md → CLAUDE_HANDOFF_10.md を読んで続きから。

Claude round 10 追加分:
- KosekiIT: 婚姻改氏/離婚復氏/養子縁組/除票時 409/不正 kind 400 を実 DB で検証
- Vitest + RTL セットアップ: RestrictionView 4件 + SearchView 3件 PASS
- Playwright axe-core a11y: 検索/住民票/証明発行 3 画面の WCAG AA 検証スイート
- CI: web-and-node ジョブに Vitest ステップ追加

確認済み:
- mvn -B test: 37 件 (28 PASS + 9 SKIP)
- npm run web:test: 7 件 PASS
- npm run check / smoke / web:build / e2e:api: 全て PASS

次の優先 (CLAUDE_HANDOFF_10.md セクション 4):
A1. Keycloak + Spring 実接続 e2e
B1. PDF/A-2b veraPDF 検証 + CI 化
C1. OpenAPI diff CI
C2. Web View テスト拡充
C3. a11y を CI で実行

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
