# Codex → Claude Code 引き継ぎメモ #9

最終更新: 2026-05-17  
担当: Codex  
前回: `CLAUDE_HANDOFF_8.md`

## 1. このラウンドで完了したこと

### A1. Web から Keycloak Authorization Code + PKCE

`apps/web/src/auth.ts` に Authorization Code Flow + PKCE を実装しました。

- `startOidcLogin()`
  - `state` / `code_verifier` を生成
  - `code_challenge=S256` を作成
  - Keycloak `/protocol/openid-connect/auth` へ遷移
- `completeOidcLoginFromRedirect()`
  - redirect 後の `code/state` を検証
  - token endpoint へ `code_verifier` 付きで交換
  - `access_token` を既存 `getToken()` が読む localStorage に保存
  - `id_token` も保存
  - URL から `code/state/session_state` を除去
- 既存の dev `/auth/login` と WebAuthn stub は残しています。
- `Shell` 左下に `OIDC` / `Logout` ボタンを追加しました。
- Vite env 型 `apps/web/src/vite-env.d.ts` を追加しました。
- `docs/oidc_setup.md` を PKCE 実装済み手順に更新しました。
- `docs/gap_matrix.md` の認証充足率を 75% に更新しました。

コミット: `c54bbdf feat: add web OIDC PKCE login`

### B1. PDF/A-2b 実検証の土台

`apps/api-spring/Dockerfile` を追加しました。

- build stage: `maven:3.9.9-eclipse-temurin-21`
- runtime: `eclipse-temurin:21-jre-jammy`
- `fonts-noto-cjk` / `fontconfig` を同梱
- 既定で以下を設定
  - `CERT_FONT_SERIF_JP=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc`
  - `CERT_PDF_A=true`

`docs/pdfa_verification.md` を追加しました。

- Docker build
- PostgreSQL / Keycloak 起動
- Spring API 起動
- 証明書 PDF 取得
- veraPDF 検証手順

コミット: `7004d3d docs: add PDF/A verification container`

### C1. `HouseholdSplitMergeIT`

Testcontainers IT を追加しました。

新規:

- `apps/api-spring/src/test/java/jp/go/local/resident/HouseholdSplitMergeIT.java`

検証内容:

- `SPLIT`
  - 指定世帯員が新世帯へ移動
  - 元世帯は閉鎖されない
  - 元 `household_member.left_date` が設定
  - 新世帯で `relation_to_head='本人'` が設定
- `MERGE`
  - 合併元世帯員が吸収先世帯へ移動
  - 合併元 `household.closed_date` が設定
  - 元 `household_member.left_date` が設定

ローカル Docker なし環境では skip、GitHub Actions Linux + Docker では実行される想定です。

コミット: `50f5f61 test: add household split merge integration tests`

## 2. 検証結果

今回確認済み:

```text
npm run check        PASS
npm run web:build    PASS
npm run e2e:api      PASS: 13 tests
npm run smoke        PASS
mvn -B test          PASS: 32 tests (28 PASS + 4 SKIP)
```

補足:

- `HouseholdSplitMergeIT` と `ResidentApiIT` は Docker 不在のため各 2 件 skip。
- Docker がある CI では Testcontainers が PostgreSQL を起動して実行される想定。
- Docker build / veraPDF 実行は未実施。手順と Dockerfile の追加まで。

## 3. 主な変更ファイル

### Web / 認証

- `apps/web/src/auth.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/Shell.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/vite-env.d.ts`

### Spring / PDF/A / Test

- `apps/api-spring/Dockerfile`
- `apps/api-spring/src/test/java/jp/go/local/resident/HouseholdSplitMergeIT.java`

### Docs

- `docs/oidc_setup.md`
- `docs/pdfa_verification.md`
- `docs/gap_matrix.md`
- `CLAUDE_HANDOFF_9.md`

## 4. 残タスク優先順

1. Keycloak + Spring 実接続テスト
   - `docker compose -f apps/api-spring/docker-compose.yaml up -d postgres keycloak`
   - Spring を `OIDC_ISSUER=http://localhost:8080/realms/juki` で起動
   - Web の `OIDC` ボタンからログインし、Spring API へ Bearer access token でアクセス
2. PDF/A-2b 実検証
   - `apps/api-spring/Dockerfile` で build
   - `docs/pdfa_verification.md` の手順で PDF を発行
   - veraPDF で PDF/A-2b compliant を確認
   - CI に組み込む
3. OpenAPI diff CI
   - Spring runtime `/v3/api-docs` と `c_openapi.yaml` の差分を確認
   - 差分を潰してから `.github/workflows/ci.yml` に `npm run openapi:diff` を追加
4. `/transactions/koseki` 完全網羅 IT
   - 婚姻改氏
   - 離婚復氏
   - 養子縁組
   - 除票済み 409
5. Web 単体テスト
   - Vitest + React Testing Library
   - `RestrictionView`
   - `OfficialView`
   - `CertificateView`
6. A11y
   - Playwright + `axe-core`
   - WCAG AA / JIS X 8341-3

## 5. 注意点

- PKCE はブラウザ実装済みですが、Keycloak 実機を起動した end-to-end 確認は未実施です。
- `VITE_OIDC_REDIRECT_URI` 未指定時は `window.location.origin + window.location.pathname` を使います。Keycloak client の Redirect URIs と一致していることを確認してください。
- `logout()` は既定では local token 破棄のみ。`VITE_OIDC_LOGOUT=true` の場合だけ Keycloak end_session に遷移します。
- `apps/api-spring/Dockerfile` の Noto Serif CJK の実ファイルパスは distro により変わる場合があります。`docs/pdfa_verification.md` の `fc-match` で要確認。
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止。

## 6. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_8.md → CLAUDE_HANDOFF_9.md を読んで続きから。

Codex round 9 追加分:
- Web OIDC Authorization Code + PKCE 実装
  - startOidcLogin / completeOidcLoginFromRedirect
  - Shell に OIDC / Logout ボタン
  - docs/oidc_setup.md 更新
- PDF/A 実検証の土台
  - apps/api-spring/Dockerfile
  - docs/pdfa_verification.md
- HouseholdSplitMergeIT
  - SPLIT / MERGE の DB 永続状態検証

確認済み:
- npm run check PASS
- npm run web:build PASS
- npm run e2e:api 13件 PASS
- npm run smoke PASS
- mvn -B test 32件 (28 PASS + 4 SKIP)

次の優先:
1. Keycloak + Spring 実接続テスト
2. PDF/A-2b veraPDF 実検証と CI 組み込み
3. OpenAPI diff CI
4. /transactions/koseki 完全網羅 IT
5. Web 単体テスト / A11y

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
