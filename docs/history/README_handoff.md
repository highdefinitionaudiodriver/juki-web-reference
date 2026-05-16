# 住民記録システム Web版 — 設計成果物 引き継ぎ書

最終更新: 2026-05-16
作業者: Claude Code (Opus 4.7)
引き継ぎ先: 任意のAIアシスタント（Codex 等）／人間設計者

## 1. 目的と背景

`G:\マイドライブ\住民自治システム\` 配下の以下の資料（住民記録システム標準仕様書 第6.1版・令和8年3月25日版／自治体システム等標準化検討会）を網羅的に実装するWebアプリ（**ChromeOS Flex** でも利用可能）の設計を行っている。

| ファイル | 内容 |
| --- | --- |
| 001062870.pdf (411p) | 標準仕様書 本体 |
| 001062866.pdf / 001062867.pdf | 同 抜粋／別版 |
| 001062862.pdf | 変更履歴 |
| 001062865.docx / 001062867.docx | Word版 |
| 001062872.xlsx | 機能・ループ／項目詳細／エラー・アラート／帳票関連項目／参照事項 一覧 |
| 001062875.xlsx | 様式表（住民票の写し ほか 0010001〜0010019 系列） |
| 001062878.xlsx | 帳票一覧・レイアウト・考え方 |
| 001062883.pptx | 概要スライド |

## 2. 既存成果物（このフォルダ内）

| 順 | ファイル | 種別 | 目的 |
| --- | --- | --- | --- |
| ベース | `住民記録システム_Web版_設計書.xlsx` | Excel | 設計書本体 16シート（表紙〜開発計画） |
| 補助 | `build_design.py` | Python | 設計書 Excel を再生成するスクリプト |
| a | `a_wireframes.html` | HTML | 13画面のワイヤーフレーム（ナビ付き、ブラウザで開く） |
| b | `b_er_diagram.html` | HTML+Mermaid | 22テーブルの ER 図、履歴方針、インデックス指針 |
| c | `c_openapi.yaml` | OpenAPI 3.1 | 40 path / 29 schema / 10 tag。yaml.safe_load 妥当性確認済 |
| – | `README_handoff.md` | 本書 | 引き継ぎ書 |

## 3. 主要な設計判断（決定済）

1. **クライアント**: SPA (React 18 + TypeScript)。PWA 化（オフライン下書き＋復帰送信）。Chromium 最新2世代対応で ChromeOS Flex を含む。
2. **認証**: OIDC + 2FA を基本、WebAuthn(FIDO2) を併用。ICカードはクライアント中継エージェントで対応（機種依存）。
3. **バックエンド**: Java 21 + Spring Boot 3 もしくは .NET 8（調達条件依存）。RDB は PostgreSQL 16。
4. **履歴**: SCD-2。`resident_history.snapshot` (jsonb) に全項目スナップショット、時点照会は `valid_from <= asOf < valid_to`。
5. **抑止**: API レイヤで存在を隠蔽（権限なしは 404）。項目別マスク (`permission.mask`) で個人番号・住民票コード等を `****` 置換。
6. **異動取消 (4.6)**: 物理削除なし。`transaction.parent_transaction_id` で論理取消。
7. **EUC (10.1)**: 個人番号出力は二段階承認＋パスワード付ZIP配信を必須に。
8. **改ざん防止 (5)**: 発行毎に verify_token + QR、`GET /verify/{token}` を公開エンドポイントとして提供。

## 4. 未着手 / 次のステップ候補

優先度順。本書を踏まえて Codex 等が継続する場合の TODO。

### A. 設計の精緻化
- [ ] 異動シナリオごとの**画面遷移図**（state machine: DRAFT→REVIEW→APPROVED→APPLIED→CANCELLED）
- [ ] 帳票テンプレ（0010001〜0010019）の**HTML/CSS print テンプレート**作成
- [ ] **CS連携／番号連携**の電文項目マッピング表（標準仕様書 7.1 と本システム ER の対応）
- [ ] **庁内他業務連携**（税/国保/選挙/戸籍/申請管理）のデータ要件マッピング
- [ ] **エラー・アラート 11章**の全 entry を OpenAPI のエラーコード体系に落とし込む
- [ ] **20.6 住基年報**の様式群を `reports/annual` テンプレ ID 単位に細分化
- [ ] **非機能の数値根拠**（同時接続数、ピーク時の応答時間 SLO）の自治体規模別シナリオ

### B. 実装
- [ ] **モノレポ初期化**（pnpm workspaces）: `apps/web` (React) / `apps/api` (Spring or .NET) / `packages/openapi` (Schema + 生成済クライアント)
- [ ] **OpenAPI → 型自動生成**（`openapi-typescript` で `c_openapi.yaml` から TS 型を生成）
- [ ] **PostgreSQL マイグレーション**（Flyway / Liquibase）を `b_er_diagram.html` の ER に基づき作成
- [ ] **テストデータ生成器**（架空住民1万件 + 抑止対象 + 外国人住民 + 世帯）
- [ ] **PDF 帳票生成サービス**（Playwright で HTML→PDF/A）
- [ ] **PWA 化** (Service Worker + Workbox)
- [ ] **OIDC IdP**（Keycloak）コンテナと開発用クライアント設定
- [ ] **E2E**（Playwright）：転入→住民票発行→転出 のゴールデンパス

### C. 検証
- [ ] OpenAPI を **Spectral** で lint
- [ ] アクセシビリティ：JIS X 8341-3:2016 AA を axe-core で自動チェック
- [ ] セキュリティ：OWASP ASVS Lv2 のチェックリスト

## 5. Codex などへ渡すときの最小プロンプト例

```
本リポジトリ G:\マイドライブ\claudecode\住民記録システム設計\ に
  - 設計書 Excel (..\住民記録システム_Web版_設計書.xlsx)
  - a_wireframes.html
  - b_er_diagram.html
  - c_openapi.yaml
  - README_handoff.md
がある。住民記録システム標準仕様書 第6.1版に準拠した Web アプリの実装を、
README_handoff.md セクション 4 の TODO 上から順に進めて。
ChromeOS Flex / Chromium 最新2世代で動作することを必ず保つこと。
作業前にすべての成果物を読み、矛盾があれば指摘してから修正案を提示してから着手すること。
```

## 6. 注意事項

- 本設計はドラフト v0.1。標準仕様書の章番号と対応する `機能ID (F-x-y-zz)` / `画面ID (SCR-xxx)` / `帳票ID (00100xx)` / `API-ID` のキーを変更しないこと（トレーサビリティ維持）。
- 個人番号・住民票コードは平文での画面表示・ログ保存・帳票出力すべてに権限制御が必要。テスト用ダミー値はチェックデジット計算済のものを用いる。
- 外国人氏名は IVS / 拡張漢字を扱うため、DB の collation・font・PDF 埋め込み font を Noto Sans CJK + 自治体拡張字体に統一すること。
