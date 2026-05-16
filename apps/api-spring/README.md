# resident-record-api (Spring Boot 3 / Java 21)

Node 版 `apps/api` の置き換えとなる本番想定の API スケルトン。  
Codex で継続実装するための雛型。

## 起動

```powershell
# 1. PostgreSQL を立ち上げる
docker compose -f apps/api-spring/docker-compose.yaml up -d

# 2. ビルド & 起動（Maven Wrapper を使う場合は mvnw を生成して使う）
cd apps/api-spring
mvn spring-boot:run
```

起動すると `:8788` でリッスン。Flyway が自動で `V001__initial_schema.sql` と
`V002__seed_master.sql` を適用する。

## 構成

| パッケージ | 役割 |
| --- | --- |
| `jp.go.local.resident.ResidentRecordApiApplication` | エントリ |
| `jp.go.local.resident.config.SecurityConfig` | OIDC リソースサーバ |
| `jp.go.local.resident.authz.Roles` | ロール定数（Node 版 authz.js と整合） |
| `jp.go.local.resident.authz.MaskService` | 抑止対象の存在隠蔽・項目別マスクの足場 |
| `jp.go.local.resident.domain.Resident` | ドメイン（spring-data-jdbc） |
| `jp.go.local.resident.repository.ResidentRepository` | リポジトリ |
| `jp.go.local.resident.api.ResidentController` | REST 入口 |
| `jp.go.local.resident.api.TransactionController` | 異動系 API の入口 |
| `jp.go.local.resident.api.CertificateController` | 証明発行・検証 API の入口 |
| `jp.go.local.resident.api.RestrictionController` | 抑止登録・解除 API の入口 |
| `jp.go.local.resident.api.*Controller` | EUC / 帳票 / 連携 / 管理 / 監査の薄い入口 |

## Codex 継続タスク

優先順:

1. **Maven 環境でコンパイル確認**: Codex 環境に `mvn` が無く、追加コントローラの Java コンパイルは未確認。
2. **SCD-2 履歴**: `resident_history` テーブルに jsonb スナップショットを書き込む `HistoryWriter` を `@TransactionalEventListener` で。
3. **時点照会**: `GET /residents/{id}?asOf=...` を `resident_history` 参照に。
4. **項目別マスク拡張**: `jumin_code` / `my_number` Repository を追加し、`MaskService` で住民票コード・個人番号を制御。
5. **PDF 帳票**: HTML テンプレ (`apps/web/src/print/certificate.css`) を Playwright 経由でサーバ生成、もしくは OpenPDF / iText に置換。
6. **Controller 本実装化**: 現在の追加Controllerは薄いDB接続。入力検証、例外、監査ログ、業務ルールを実装する。
7. **OpenAPI 同期**: `c_openapi.yaml` を SSOT として、`springdoc-openapi-starter-webmvc-ui` で実装と差分検出する。

## テスト

```powershell
mvn test
```

`org.testcontainers:postgresql` を使い、PostgreSQL を起動した状態の統合テストで
Flyway マイグレーション → リポジトリ → コントローラまでを通す。

## Web との接続

開発時は Vite proxy を Spring に向ける:

```ts
// apps/web/vite.config.ts
proxy: { "/api": { target: "http://localhost:8788" } }
```

切り替え方:
- Node 版を残す: `:8787` のまま
- Spring 版に移行: `:8788` に変更し、Node 版を停止
