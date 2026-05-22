# Codex → Claude 引き継ぎメモ #23

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_22.md`（Claude round 22: AdminIT 4 件 + README テスト被覆マトリクス）

## 1. このラウンドで完了したこと

### A. Web API fallback を開発時限定に制御

変更: `apps/web/src/api.ts`

`me` / `searchResidents` / `resident` / `history` / `audit` は API 失敗時に seed fallback を返していたため、本番ビルドで API 障害や認可ミスが UI 上で隠れるリスクがあった。

今回、fallback を以下の条件に限定した。

```ts
const enableFallbackData = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FALLBACK_DATA === "true";
```

- `import.meta.env.DEV === true`: 開発サーバでは従来どおり fallback 利用可能
- `VITE_ENABLE_FALLBACK_DATA=true`: 明示指定時のみ fallback 利用可能
- production build 既定値: API エラーをそのまま throw

更新系 API はもともと fallback していないため、変更対象外。

### B. README / gap matrix のテスト件数を補正

変更:
- `README.md`
- `docs/gap_matrix.md`

`CLAUDE_HANDOFF_22.md` で残っていた README の `合計 142 ケース` と、現在のテスト実数との差分を補正。

現在の README マトリクス:

| カテゴリ | 件数 |
| --- | ---: |
| Spring API Controller | 66 |
| Spring Service / Authz | 6 |
| Spring Integration | 13 |
| Web React component | 42 |
| Node smoke | 1 |
| Node API E2E | 13 |
| Web a11y | 7 |
| OpenAPI diff | 1 |
| **合計** | **149** |

### C. README に CI badge を追加

追加:

```md
[![CI](https://github.com/highdefinitionaudiodriver/juki-web-reference/actions/workflows/ci.yml/badge.svg)](https://github.com/highdefinitionaudiodriver/juki-web-reference/actions/workflows/ci.yml)
```

## 2. 検証結果

```powershell
npm run check      PASS
npm run web:test   42 passed
npm run smoke      PASS
npm run web:build  PASS
```

今回 Java 実装は未変更のため、`mvn -B test` は再実行していない。直前の Claude round 22 時点では `85 件 (72 PASS + 13 SKIP)`。

## 3. コミット

- `176eb44 fix: gate web fallback data to dev`
- `CLAUDE_HANDOFF_23.md` は次コミットで追加予定

## 4. 変更ファイル

### 変更

- `apps/web/src/api.ts`
- `README.md`
- `docs/gap_matrix.md`

### 新規

- `CLAUDE_HANDOFF_23.md`

## 5. 残タスク優先順

### A. Keycloak + Spring + Web の実 OIDC E2E

- `tests/e2e/spring-oidc.spec.ts` 新設
- Keycloak dev realm 起動
- 有効 JWT / 無効 JWT / ロール不足
- `/me` が token mapper の `name` / `department` / `roles` を読むことを確認

### B. PDF/A veraPDF 検証

- Spring から証明 PDF を取得
- veraPDF で PDF/A-2b 検証
- GitHub Actions に `pdfa-verify` job を追加

### C. Testcontainers IT 拡張

- `RestrictionController`
  - 抑止登録で `resident.restricted_flag=true`
  - 抑止解除で `resident.restricted_flag=false`
- `EucController`
  - 依頼保存
  - 個人番号含む場合の二段階承認状態

### D. CI 実行結果確認

- README badge 追加済みなので、GitHub Actions 上で status が期待通り表示されるか確認
- OpenAPI diff job の Spring 起動待機が安定しているか確認

## 6. 注意点

- Web fallback は production 既定で無効化された。デモ用途で fallback を使う場合は `VITE_ENABLE_FALLBACK_DATA=true` を明示する。
- README の合計 149 は Node smoke 1 件を含む。`CLAUDE_HANDOFF_22.md` の合計 148 は smoke を別枠扱いした数字。
- 機能 ID / 画面 ID / 帳票 ID / API-ID は引き続き改名禁止。
- ChromeOS Flex / Chromium 最新 2 世代互換の前提は維持。

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_22.md → CLAUDE_HANDOFF_23.md を読んで続きから。

Codex round 23 追加分:
- apps/web/src/api.ts の fallback data を DEV または VITE_ENABLE_FALLBACK_DATA=true 限定に変更
- README に CI badge 追加
- README / docs/gap_matrix.md のテスト件数を Spring 85 / Vitest 42 / 合計 149 に補正

確認済み:
- npm run check: PASS
- npm run web:test: 42 passed
- npm run smoke: PASS
- npm run web:build: PASS

次の優先:
A. Keycloak + Spring + Web の実 OIDC E2E
B. PDF/A veraPDF 検証 + CI
C. RestrictionController / EucController の Testcontainers IT
D. GitHub Actions 実行結果確認

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
