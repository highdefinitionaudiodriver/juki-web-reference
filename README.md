# 住民記録システム Web 版（リファレンス実装）

> 自治体システム等標準化検討会 「住民記録システム標準仕様書 第 6.1 版（令和 8 年 3 月 25 日版）」に準拠した、
> **ChromeOS Flex でも動作する** Web アプリケーションのリファレンス実装。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/highdefinitionaudiodriver/juki-web-reference/actions/workflows/ci.yml/badge.svg)](https://github.com/highdefinitionaudiodriver/juki-web-reference/actions/workflows/ci.yml)
![Status: WIP](https://img.shields.io/badge/status-work%20in%20progress-orange)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![Java](https://img.shields.io/badge/java-21-007396?logo=openjdk&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)

⚠️ **本リポジトリは AI 協働（Claude Code ⇔ Codex）による設計／実装の生プロセスを含むリファレンス実装です。**
本番自治体システムとしての実利用を意図したものではありません。設計・実装パターンの参考としてご利用ください。

---

## 🎯 これは何？（30秒で）

- **誰のため**：自治体情シス・地方自治体システム標準化に対応する SI ベンダー／ChromeOS Flex 等の低コスト端末でも動作する自治体システム設計に関心がある開発者
- **何が解決される**：自治体システム等標準化検討会「住民記録システム標準仕様書 第 6.1 版」の **Web 版リファレンス実装**。SaaS / クラウド前提でない、**ChromeOS Flex でも動く軽量実装パターン**の参考材料を提供
- **なぜ既存ツールではダメか**：自治体標準仕様の公開リファレンス実装は乏しい。本リポジトリは **AI 協働開発の生プロセスごと**公開しており、設計パターン・実装判断の意図まで参照できる
- **使う条件**：Node.js 20+ / Java 21 / React 19 / 学習・参考用途のみ

> ⚠️ **本リポジトリは本番自治体システムではありません**。設計・実装パターンの参考としてのみご利用ください。

## 💰 想定ユースケース・価格帯

| 用途 | 形態 |
|---|---|
| 自治体標準仕様の **設計学習・実装パターン参考** | 無料（MIT） |
| 自治体・SI ベンダー向け **設計レビュー・実装支援** | 応相談 |
| ChromeOS Flex 対応の自治体システム導入支援 | 個別見積もり |

---

## 何を解いているか

日本の市区町村における**住民基本台帳事務**（住民票・世帯・異動・証明・統計・連携）を司る基幹システムを、
ガバメントクラウド上で **ブラウザのみ** で動作する Web アプリとして実装した場合の設計・実装例を示します。

- 標準仕様書（PDF 411 ページ）の **第 3 章 機能要件** を機能 ID 付きで追跡可能に
- **第 4 章 様式・帳票要件**（住民票の写し 等）を HTML/CSS → PDF で出力
- 標準仕様書 **10.3 / 10.4 の項目別マスク**・**DV 等支援措置による存在隠蔽** を API レイヤで実装
- ChromeOS Flex 端末でも、追加クライアントソフトのインストール無しで利用可能

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (ChromeOS Flex / Chrome / Edge — Chromium 最新2世代)   │
│  React 19 + TypeScript 5.6 + Vite 6  (PWA)                      │
└──────────────┬──────────────────────────────────────────────────┘
               │ Bearer JWT (OIDC)
               ▼
┌──────────────────────────────┐         ┌──────────────────────┐
│  Node Dev API (apps/api)     │   or    │  Spring Boot 3 / J21 │
│  - 開発用・E2E 用            │         │  (apps/api-spring)   │
│  - in-memory seed            │         │  - 本番想定          │
└──────────────────────────────┘         │  - Flyway → PG 16    │
                                          │  - OpenHTMLtoPDF     │
                                          └──────────────────────┘
                                                     │
                                          ┌──────────▼───────────┐
                                          │  PostgreSQL 16       │
                                          │  22 設計テーブル     │
                                          │  + 2 承認/イベント   │
                                          └──────────────────────┘

連携 (TODO): 住基ネットCS / 番号連携 / 戸籍 / 税 / 国保 / 選挙 / 申請管理 / マイナポータル
```

## 実装状況

| 観点 | 状況 |
|---|---|
| API endpoint (40 設計) | Node / Spring とも主要業務 API を実装、戸籍・コード・在留・連携を拡張中 |
| 画面 (13 設計) | 8 view に集約実装（住民検索／住民票／異動／職権異動／証明発行／抑止／統計・EUC／権限・監査） |
| DB テーブル (22 設計) | DDL は Flyway で全 22 + EUC 承認/イベント 2 テーブル適用、JDBC で主要 10 テーブル運用中 |
| 帳票 (19+ 設計) | 0010001 / 0010007 を OpenHTMLtoPDF で生成、その他は ID 単位で出し分け対応 |
| 認証 | OIDC リソースサーバ + Keycloak dev IdP + Web PKCE、WebAuthn は足場 |
| 抑止／項目別マスク | 設計仕様準拠で実装（WINDOW から DV 対象は 404、個人番号は要権限） |
| 連携 (9 系統) | 戸籍連動は異動反映、CS/番号/税/国保/選挙は業務別ペイロード対応 |
| E2E / CI | Playwright API 13 件 PASS、a11y 7 画面、Spring OIDC E2E / OpenAPI diff / PDF/A veraPDF を含む CI 全 5 ジョブ PASS |
| Spring テスト | MockMvc + Testcontainers IT 109 件（Docker なし環境では IT 20 件 skip） |
| Web テスト | Vitest + React Testing Library 51 件 PASS |

詳細は [`docs/gap_matrix.md`](docs/gap_matrix.md) を参照。

### テスト被覆マトリクス

| レイヤ | テストランナ | 件数 | 内訳 |
|---|---|---:|---|
| Spring API Controller | MockMvc | 82 | Auth(3) / Resident(8) / ResidentSupplement(5) / Transaction(13) / Certificate(8) / Restriction(6) / Report(4) / Link(7) / Admin(7) / Audit(2) / EUC(19) |
| Spring Service / Authz | JUnit | 7 | MaskService(5) / CertificatePdfService(1) / SecurityConfig(1) |
| Spring Integration | Testcontainers + Spring Boot | 20 | ResidentApiIT(2) / HouseholdSplitMergeIT(2) / KosekiIT(5) / AdminIT(4) / RestrictionIT(2) / EucIT(4) / CertificatePdfIT(1) — Linux runner + Docker で実行、ローカル Docker なしは skip |
| Web React コンポーネント | Vitest + RTL | 51 | App(15) / View 8 ファイル(36) |
| Node API ロジック | Node スモーク | 1 | seed の住民検索結果でロール別マスク確認 |
| Node API E2E | Playwright | 13 | golden path（転入→住民票→転出→取消）/ 抑止隠蔽 / 戸籍連動 / 連携 |
| Web ブラウザ a11y | Playwright + axe-core | 7 | 住民検索 / 住民票 / 証明発行 / 抑止設定 / 異動 / 統計-EUC / 権限-監査 |
| 仕様 ⇔ 実装 ドリフト | OpenAPI diff (CI) | 1 | drift=0 維持 |

**合計 181 ケースを CI で自動検証**。Linux runner + Docker 環境では IT も含めて全件 PASS。

## クイックスタート

### 必要環境\n
- **推奨動作スペック**:
  - **開発・サーバー実行環境**:
    - CPU: 2コア/4スレッド以上のx86-64またはARM64プロセッサ (Core i3以上推奨)
    - メモリ: 8GB RAM以上 (DockerやPostgreSQLなどのデータベースコンテナ同時起動時)
    - ストレージ: SSD 10GB以上の空き容量
    - OS: Windows 10/11, macOS, Linux (Ubuntu 20.04+)
  - **クライアント・ブラウザ環境 (ChromeOS Flex等)**:
    - CPU: Intel Celeron / Core i3 相当以上
    - メモリ: 4GB RAM以上
    - ブラウザ: Google Chrome (最新版推奨), Microsoft Edge (最新版)
    - 画面解像度: 1366x768 以上 (1920x1080 推奨)
- Node.js 20+
- (Spring 版を動かす場合) Java 21 + Maven 3.9 + Docker Desktop

### Node 開発サーバで動かす（最速）

```powershell
git clone https://github.com/highdefinitionaudiodriver/juki-web-reference.git
cd juki-web-reference
npm install
npm run dev
# ブラウザで http://localhost:5173 (Vite dev) を開く
# API は http://localhost:8787 で同時起動
```

### テスト

```powershell
npm run check        # TypeScript 型検査
npm run web:test     # Vitest + React Testing Library
npm run smoke        # Node API ロジックのスモーク
npm run e2e:api      # Playwright API E2E (Node 版に対して)
npm run e2e:a11y     # axe-core による a11y E2E（Chromium install 後）
npm run openapi:diff -- --spring http://localhost:8788/v3/api-docs
npm run web:build    # Vite production build
```

### Spring Boot 版を動かす

```powershell
# 1) JDK 21 と Maven を準備
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"

# 2) PostgreSQL を起動
docker compose -f apps/api-spring/docker-compose.yaml up -d

# 3) アプリ起動
cd apps/api-spring
mvn -B spring-boot:run         # :8788

# 4) OpenAPI 確認
# http://localhost:8788/swagger-ui.html
# http://localhost:8788/v3/api-docs

# 5) c_openapi.yaml と実装の差分を検出
cd ../..
npm run openapi:diff -- --spring http://localhost:8788/v3/api-docs
```

CI の `openapi-diff` ジョブでは Spring を `ci` プロファイルで起動します。このプロファイルは
`/v3/api-docs` 取得専用で認可を無効化するため、本番・結合試験では使わないでください。

## ディレクトリ構成

```
.
├── apps/
│   ├── api/                  # Node.js 開発用 API（in-memory）
│   ├── api-spring/           # Spring Boot 3 / Java 21（本番想定）
│   └── web/                  # React 19 + Vite 6 SPA
├── packages/
│   └── openapi/              # c_openapi.yaml → TS 型生成
├── tests/e2e/                # Playwright (Node / Spring)
├── tools/                    # openapi-diff など補助スクリプト
├── docs/
│   ├── gap_matrix.md         # 設計 vs 実装 充足率
│   ├── migration_react_vite.md
│   └── implementation_notes.md
├── c_openapi.yaml            # OpenAPI 3.1 仕様（SSOT）
├── a_wireframes.html         # 13 画面のワイヤーフレーム
├── b_er_diagram.html         # 22 テーブルの ER 図 (Mermaid)
├── 住民記録システム_Web版_設計書.xlsx  # 16 シート設計書
└── docs/history/             # AI 協働の引き継ぎログ（参考）
```

## 設計成果物

| ファイル | 内容 |
|---|---|
| [`住民記録システム_Web版_設計書.xlsx`](住民記録システム_Web版_設計書.xlsx) | 全体設計（表紙〜開発計画 16 シート） |
| [`c_openapi.yaml`](c_openapi.yaml) | OpenAPI 3.1（40 path / 29 schema / 10 tag） |
| [`a_wireframes.html`](a_wireframes.html) | ブラウザで開くワイヤーフレーム |
| [`b_er_diagram.html`](b_er_diagram.html) | Mermaid ER 図 |
| [`apps/api-spring/src/main/resources/db/migration/`](apps/api-spring/src/main/resources/db/migration/) | Flyway マイグレーション（22 設計テーブル + EUC 承認/イベント 2 テーブル + シード） |

## 設計のキー

- **機能 ID** `F-x-y-zz`（設計書 04_機能一覧）
- **画面 ID** `SCR-xxx`（設計書 05_画面一覧 / `a_wireframes.html`）
- **帳票 ID** `00100xx`（設計書 06_帳票一覧）
- **API-ID** `API-*`（`c_openapi.yaml` の operationId）

これらは標準仕様書の章節と対応しており、コード／テスト／ドキュメント間の **トレーサビリティ** を維持します。

## 出典・準拠仕様

- [自治体システム等標準化検討会 住民記録システム標準仕様書](https://www.digital.go.jp/policies/local_governments/)
- [地方公共団体情報システムデータ要件・連携要件標準仕様書](https://www.digital.go.jp/policies/local_governments/)
- [地方公共団体情報システム共通機能標準仕様書](https://www.digital.go.jp/policies/local_governments/)

仕様書 PDF 本体は本リポジトリには含めていません。デジタル庁／総務省の公式サイトからダウンロードしてください。

## AI 協働の記録

本実装は Claude Code (Opus 4.7) と Codex の協働でゼロから設計・実装しました。
協働プロセスの引き継ぎログは [`docs/history/`](docs/history/) に保存しています：

- `CODEX_HANDOFF.md` … MVP 立ち上げ
- `CLAUDE_HANDOFF_2.md` … React+TS+Vite 移行、OpenAPI 型自動生成、抑止/権限本実装、Playwright、OIDC 足場、Spring 雛型
- `CLAUDE_HANDOFF_3.md` … MaskService 拡張、SCD-2 履歴、時点照会、Testcontainers
- `CODEX_HANDOFF_4.md` … PDF endpoint、業務ガード、OpenAPI 同期
- `CLAUDE_HANDOFF_5.md` … springdoc 統合、業務ルール強化、OpenHTMLtoPDF、Spring E2E

「設計を AI に渡してどこまで実装が進むか」のリアルなケーススタディとしても参照できます。

## ライセンス

[MIT License](LICENSE)

## コントリビューション

WIP のリファレンス実装のためフォーマルなコントリビューションプロセスは設けていません。
バグや改善提案は GitHub Issue でお気軽にどうぞ。

---

## 🤝 商用利用・カスタマイズ依頼

- 個人・社内利用は無料（MIT ライセンス）
- 法人・自治体・SI 向け導入支援、カスタマイズ、診断レポート受託は応相談
- 連絡先：highdefinitionaudiodriver@gmail.com

<!-- CODEX-CURRENT-STATUS:START -->
## 現状サマリ (2026-05-25)

- 対象: 住民記録システム Web 版（リファレンス実装）
- 作業ブランチ: main
- README更新時点の参照コミット: 5ce6427 docs: add recommended specs info to handoff docs
- Node.js / JavaScript 系プロジェクト。package.json を起点に依存関係とスクリプトを管理。
- apps ディレクトリ配下にアプリケーション実装を配置。
- docs ディレクトリ配下に設計・運用・補足資料を配置。
- tests ディレクトリ配下にテストを配置。
- 主要な確認コマンド: npm test / npm run check（定義がある場合）
- 次に進めるなら、README 内の利用手順と既存 docs / tests を起点に、未整備の検証手順・引き継ぎメモ・CI 化を補強する。
<!-- CODEX-CURRENT-STATUS:END -->

