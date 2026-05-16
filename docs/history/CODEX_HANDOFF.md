# Codex 実装引き継ぎメモ

最終更新: 2026-05-16
引き継ぎ先: Claude Code
対象: `G:\マイドライブ\claudecode\住民記録システム_Web版`

## 1. 現状

Claude Code が作成した設計成果物をもとに、Codex 側で Web 版 MVP の初期実装を追加した。

既存設計成果物:

- `README_handoff.md`
- `住民記録システム_Web版_設計書.xlsx`
- `a_wireframes.html`
- `b_er_diagram.html`
- `c_openapi.yaml`
- `基となった資料\*`

今回追加した実装:

- `apps/web`: ブラウザSPA
- `apps/api`: Node.js 標準HTTPの開発用API
- `apps/api/db/V001__initial_schema.sql`: PostgreSQL初期DDL
- `packages/openapi`: OpenAPI型定義置き場
- `docs/implementation_notes.md`: 実装メモ
- ルートの `package.json`, `pnpm-workspace.yaml`, `.gitignore`

## 2. 起動方法

```powershell
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm run dev
```

ブラウザで以下を開く。

```text
http://localhost:8787
```

## 3. 確認済み

以下は成功済み。

```powershell
npm run check
npm test
```

確認内容:

- `node --check` による API / Web JS の構文確認
- API スモークテスト
- `http://localhost:8787/api/v1/me` の応答確認
- ブラウザで `住民記録システム Web版` が表示され、`住民検索`、サンプル住民、`支援措置` 表示が見えること

## 4. 実装済み機能

Web:

- 住民検索
- 住民票照会
- 個人番号・住民票コードの表示切替
- 単項目住所修正
- 転入届
- 転出届
- 異動取消
- 住民票の写し発行
- 住基年報ジョブ受付
- EUC任意抽出依頼
- 権限ロール表示
- 監査ログ参照
- PWA用 manifest / service worker

API:

- `GET /api/v1/me`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/residents/search`
- `GET /api/v1/residents/{residentId}`
- `PUT /api/v1/residents/{residentId}`
- `GET /api/v1/residents/{residentId}/history`
- `POST /api/v1/transactions/in`
- `POST /api/v1/transactions/out`
- `POST /api/v1/transactions/cancel`
- `POST /api/v1/certificates/jumin`
- `GET /api/v1/verify/{token}`
- `POST /api/v1/reports/annual`
- `POST /api/v1/euc/query`
- `GET /api/v1/audit`

設計反映:

- 抑止対象者の住所マスク
- 個人番号・住民票コードのマスク
- 異動取消の `parentTransactionId`
- 証明書発行時の `verifyToken`
- EUCで個人番号を含む場合の二段階承認フラグ
- ER図ベースの初期DDL

## 5. 設計との差分

- 設計では React 18 + TypeScript だが、現MVPは依存取得なしで動作確認できる Vanilla JS SPA。
- 設計では Java 21 + Spring Boot 3 または .NET 8 だが、現MVPは Node.js 標準HTTPの開発用API。
- OpenAPI型生成はネットワーク接続なしで進めるため、現状は手書き型と `generate-types.js` の簡易スタブ生成に留めている。
- 本格OIDC、WebAuthn、DB永続化、PDF/A生成、Playwright帳票生成は未実装。

## 6. 次に進めるなら

優先順のおすすめ:

1. `apps/web` を React 18 + TypeScript + Vite に移行する。
2. `openapi-typescript` で `c_openapi.yaml` から型を正式生成する。
3. `apps/api` を Spring Boot 3 または .NET 8 に置き換える。
4. PostgreSQL + Flyway/Liquibase で `V001__initial_schema.sql` を適用する。
5. 住民検索、異動、証明発行のE2Eテストを Playwright で追加する。
6. 帳票 `0010001` から HTML/CSS print テンプレート化する。
7. OIDC / WebAuthn / 項目別権限マスクを本実装する。

## 7. 注意

- このフォルダは確認時点では Git リポジトリではなかった。
- 既存の `README_handoff.md` は設計引き継ぎ、こちらの `CODEX_HANDOFF.md` は実装引き継ぎとして扱う。
- `docs/implementation_notes.md` にも今回の設計差分を記載済み。
