# 実装メモ

最終更新: 2026-05-16

## 今回実装した範囲

- `apps/web`: ChromeOS Flex / Chromium で動くブラウザSPA。住民検索、住民票照会、単項目修正、転入、転出、異動取消、住民票発行、住基年報、EUC、監査ログを操作可能。
- `apps/api`: Node.js 標準HTTPだけで動く開発用API。`c_openapi.yaml` の主要エンドポイントに合わせ、抑止対象の住所マスク、個人番号・住民票コードのマスク、異動取消の親子関係、証明書検証トークンを実装。
- `packages/openapi`: OpenAPI連携用の型定義置き場。ネットワーク接続が使える環境では `openapi-typescript` への置き換えを想定。
- `apps/api/db/V001__initial_schema.sql`: ER図に基づくPostgreSQL初期DDL。

## 設計書との差分・補足

- ハンドオフの資料パスに `G:\マイドライブ\住民自治システム\` とあるが、今回の実体は `G:\マイドライブ\claudecode\住民記録システム_Web版\基となった資料` 配下。
- 本実装は調達前のMVPとして、Spring Boot / .NET ではなくNode標準HTTPでOpenAPI互換のモックAPIを置いた。永続化・OIDC・WebAuthn・PDF/A生成は次フェーズ。
- 設計書のReact 18方針に対し、依存取得なしで即起動できるよう初期SPAはVanilla JSで実装。React化する場合も画面状態とAPI境界はそのまま移植可能。

## 起動

```powershell
npm run dev
```

起動後、ブラウザで `http://localhost:8787` を開く。

## 確認

```powershell
npm run check
npm test
```
