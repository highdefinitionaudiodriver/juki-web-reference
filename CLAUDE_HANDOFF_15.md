# CLAUDE_HANDOFF_15

作成日時: 2026-05-17

## 1. 今回 Codex が完了したこと

CLAUDE_HANDOFF_14.md 時点の `main` から、以下を追加実施した。

### A. OpenAPI diff CI の失敗検出を有効化

commit: `174a409 test: expand App search coverage`

`.github/workflows/ci.yml` の `openapi-diff` ジョブを調整。

- `Run OpenAPI diff` から `continue-on-error: true` を削除
  - 仕様と Spring runtime `/v3/api-docs` に差分が出た場合、CI が正しく失敗する。
- Spring API 待機時間を 90 秒 → 180 秒へ延長
  - GitHub Actions 初回起動時の Maven / Flyway / Spring 起動遅延に備える。
- 失敗時ログ表示は `if: failure()` に整理。

### B. App.tsx 統合テスト拡充

`apps/web/src/App.test.tsx` を 4 件 → 7 件へ拡張。

追加テスト:

| テスト | 内容 |
| --- | --- |
| 検索フォームの入力で searchResidents を再実行する | 氏名 / 住所 / 外国人のみを入力して `api.searchResidents(criteria)` を確認 |
| 転入反映後に notice を表示する | 異動画面で `api.moveIn()` 後、通知文言を確認 |
| 職権異動の起票後に notice を表示する | 職権異動画面で `api.officialTransaction()` 後、通知文言を確認 |

Vitest 合計:

- 7 files
- 24 tests

### C. README / gap_matrix 更新

- `README.md`
  - OpenAPI diff CI ジョブを実装状況へ反映
  - Web テスト 24 件を明記
  - `ci` プロファイルは `/v3/api-docs` 取得専用で本番利用禁止と追記
- `docs/gap_matrix.md`
  - 画面数を 8 view / 62% に修正
  - Vitest 24 件へ更新
  - CI の OpenAPI diff ジョブをテスト自動化状況へ追加

## 2. 検証結果

実行済み:

```powershell
npm run check
npm run web:test
npm run smoke
npm run web:build
npm run e2e:api
```

結果:

- `npm run check`: PASS
- `npm run web:test`: PASS
  - 7 files
  - 24 tests
- `npm run smoke`: PASS
- `npm run web:build`: PASS
  - JS 227.25 KB / gzip 71.19 KB
- `npm run e2e:api`: PASS
  - 13 tests

未実行:

- `mvn -B test`
  - 今回 Java コード変更なしのため未再実行。
  - CLAUDE_HANDOFF_14 時点では 61 件 (52 PASS + 9 SKIP)。
- `npm run e2e:a11y`
  - 今回 UI/CSS 変更なしのため未再実行。
  - 前回は 7 件すべて `ok`、Windows ローカルでは webServer 終了待ち timeout あり。

## 3. Git / 同期状況

GitHub:

- この引き継ぎ書作成前の作業コミット:
  - `174a409 test: expand App search coverage`

ローカル:

- 作業ディレクトリ: `C:\Users\highd\Documents\Github\juki-web-reference`
- 同期先: `G:\マイドライブ\claudecode\住民記録システム_Web版`

この引き継ぎ書作成後に、`CLAUDE_HANDOFF_15.md` も commit / push / G ドライブ同期すること。

## 4. 次に優先する作業候補

優先度 A:

- GitHub Actions の `openapi-diff` ジョブ初回実行結果を確認
  - 失敗する場合は `spring.log` を見て以下を調整:
    - Spring 起動待ち 180 秒で足りるか
    - `ci` プロファイルで Flyway + PostgreSQL が正常起動するか
    - `npm run openapi:diff` の差分が「本当に仕様差分」か「springdoc 表現差」か

優先度 B:

- Keycloak + Spring + Web の実 OIDC E2E
  - `tests/e2e/spring-oidc.spec.ts` 新設
  - 有効 JWT / 無効 JWT / ロール不足を確認

優先度 C:

- PDF/A veraPDF 実検証
  - Spring PDF endpoint から PDF を取得
  - `verapdf --flavour 2b` 相当を CI に追加

優先度 D:

- App.tsx 統合テスト追加
  - 証明発行 notice
  - 抑止登録/解除の成功・失敗 notice
  - 年報/EUC の notice

## 5. 注意点

- `openapi-diff` ジョブは今回から差分検出で CI を失敗させる。
- `ci` プロファイルは認可を完全に外す。`/v3/api-docs` 取得専用で、本番・結合試験では使わない。
- RTL の `getByRole` 型には Playwright と違って `exact` がないため、完全一致が必要な場合は `name: /^検索$/` のように正規表現を使う。
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。

## 6. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference を作業ディレクトリとして再開してください。
最新の引き継ぎは CLAUDE_HANDOFF_15.md です。
CLAUDE_HANDOFF_14.md 以降、Codex が OpenAPI diff CI の continue-on-error を削除し、
App.tsx 統合テストを 7 件まで拡張しました。
Vitest は 24 件 PASS、Node API E2E は 13 件 PASS です。
まず git status / git log / origin main との同期を確認し、
G:\マイドライブ\claudecode\住民記録システム_Web版 への同期状態も確認してください。
次は GitHub Actions の openapi-diff ジョブ実行結果確認、Keycloak + Spring + Web の実 OIDC E2E、
PDF/A veraPDF 検証、App.tsx の残 notice テストから優先して進めてください。
作業後は commit / push / G ドライブ同期し、次の CLAUDE_HANDOFF_16.md を作成してください。
```
