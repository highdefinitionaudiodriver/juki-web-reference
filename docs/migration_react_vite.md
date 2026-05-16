# React + TS + Vite 移行 / OpenAPI 型自動生成 メモ

実施日: 2026-05-16  
担当: Claude Code (Opus 4.7)  
ベース: Codex MVP (`apps/web` Vanilla JS) → React 19 + TypeScript 5.6 + Vite 6 へ置換

## 1. 完了内容

### 1-1. プロジェクト再構成
- `apps/web` を React + TS + Vite 構成に置換。旧 Vanilla 実装は `apps/web-legacy/` に退避保存。
- ルート `package.json` に Vite dev / build / typecheck スクリプトを追加。
- `apps/web/vite.config.ts` で `/api` を `:8787` の Node API にプロキシ。
- `apps/api/src/server.js` を、ビルド済 `apps/web/dist` があれば優先配信、無ければ `apps/web-legacy` を配信するように改修。

### 1-2. OpenAPI 型自動生成
- `packages/openapi/` を `openapi-typescript@^7.13` で書き換え。
- `c_openapi.yaml` から `packages/openapi/generated/api.d.ts`（1,913 行）を生成。
- YAML 修正:
  - `valueKanji:{ type ...}` `issuerOffice:{ type ...}` の空白欠落 2 箇所
  - `CertificateReq.formId` の `enum: [0010001, ...]` を文字列リテラルに（YAMLが数値として解釈しないため）
  - `CertificateReq` の `default` 付きフィールドをオプション化
  - `AuditLog.details` を `additionalProperties: true` に
- `apps/web/src/types.ts` で生成型を 19 スキーマ分 re-export。

### 1-3. React コンポーネント
| ファイル | 役割 |
| --- | --- |
| `src/main.tsx` | エントリ + SW登録 |
| `src/App.tsx` | 状態管理＋ビュースイッチ |
| `src/types.ts` | OpenAPI 生成型の re-export |
| `src/api.ts` | typed fetch クライアント |
| `src/data.ts` | フォールバック seed |
| `src/components/Shell.tsx` | サイドバー＋トップバー |
| `src/components/Badges.tsx` | 状態バッジ |
| `src/components/Field.tsx` | Field / SelectField / InfoTable |
| `src/views/SearchView.tsx` | 住民検索 |
| `src/views/ResidentView.tsx` | 住民票・履歴 |
| `src/views/MoveView.tsx` | 転入・転出・取消 |
| `src/views/CertificateView.tsx` | 証明書発行 |
| `src/views/ReportsView.tsx` | 年報 / EUC |
| `src/views/AdminView.tsx` | ロール / 監査ログ |

### 1-4. 検証結果
```text
npm run web:typecheck   → PASS
npm run web:build       → PASS  (dist/assets/index-*.js 212KB / gzip 66.8KB)
npm run smoke           → PASS
curl /api/v1/me         → 200 OK
curl /                  → React版 index.html
```

## 2. 開発フロー

### 起動
```powershell
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm install
npm run generate:openapi  # 型再生成
npm run dev               # concurrently で API:8787 + Vite:5173 起動
```

- 開発時: <http://localhost:5173/> （Vite dev / HMR）
- API 単独確認時: <http://localhost:8787/api/v1/me>
- 本番想定: `npm run build` → `apps/web/dist` を Node API が配信

### 型再生成
`c_openapi.yaml` を編集したら必ず:
```powershell
npm run generate:openapi
npm run web:typecheck
```

## 3. 未対応 / 次の優先（CODEX_HANDOFF.md セクション6 から継続）

3. apps/api を Spring Boot 3 もしくは .NET 8 に置換 + DB 接続
4. 帳票 0010001 を HTML/CSS print テンプレ化（既に `<section class="paper">` の骨格は移植済）
5. 抑止／権限の本実装（API レイヤで存在隠蔽）
6. OIDC / WebAuthn 本実装（現状は `/auth/login` がダミー固定 token）
7. Playwright E2E（転入 → 住民票発行 → 転出）

## 4. 注意

- `apps/web-legacy/` は参照用。新規修正は `apps/web/src/` 配下のみ。
- OpenAPI YAML を変更する場合は `c_openapi.yaml`（ルート）が唯一の真実。
- Node 24 系で動作確認済（package.json の `engines.node >= 20`）。
