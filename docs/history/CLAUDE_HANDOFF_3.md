# Claude → Codex 引き継ぎメモ #3

最終更新: 2026-05-16  
担当: Claude Code (Opus 4.7)  
前回: `CODEX_HANDOFF.md` (Codex MVP) → `CLAUDE_HANDOFF_2.md` (React+TS+Vite, OpenAPI型, 抑止/権限, E2E, 帳票テンプレ, OIDC足場, Spring 雛型) → 本書

## 1. このラウンドで完了したこと

Codex が `CLAUDE_HANDOFF_2.md` を踏まえて Spring 側に `MaskService` / Controller 群 (TransactionController, CertificateController, RestrictionController ほか) / SecurityConfig の `JwtAuthenticationConverter` を追加し、Node 版にも DV 抑止対象の `/residents/{id}` / `/history` 404 化と E2E テストの拡張を施しました。Claude 側でその上に以下を実施：

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | **Maven + JDK 21 ローカル導入＋全 Java コンパイル確認** | ✓ `mvn compile` 23 source ファイル成功。`mvn test-compile` 含めて成功 |
| 2 | **MaskService の項目別マスク拡張** | ✓ `jumin_code` / `my_number` の Repository 追加、`MaskService.toResponse()` で API レイヤマスク／アンマスク制御を完全実装 |
| 3 | **SCD-2 履歴: `ResidentHistoryRepository` + `HistoryWriter` + `ResidentChangedEvent`** | ✓ jsonb スナップショット書込／時点照会クエリ／`@TransactionalEventListener(AFTER_COMMIT)` |
| 4 | **時点照会 `GET /residents/{id}?asOf=...`** | ✓ `ResidentController` で OffsetDateTime パース＋履歴 Repository 経由 |
| 5 | **`GET /residents/{id}/history` を Spring 側で実装＋抑止 404 化** | ✓ Node 互換挙動 |
| 6 | **Spring 統合テスト `ResidentApiIT` (Testcontainers + Spring Security Test)** | ✓ ファイル作成・コンパイル成功。実行には Docker が必要（本環境未導入のため Codex 側で実行） |
| 7 | **Node 側の回帰確認** | ✓ typecheck / smoke / Playwright API E2E 4 件すべて PASS |

## 2. 追加・変更ファイル

### 新規 (Spring)
| パス | 役割 |
| --- | --- |
| `apps/api-spring/src/main/java/jp/go/local/resident/domain/JuminCode.java` | 住民票コードドメイン (SCD-2) |
| `apps/api-spring/src/main/java/jp/go/local/resident/domain/MyNumber.java` | 個人番号ドメイン (暗号文保存) |
| `apps/api-spring/src/main/java/jp/go/local/resident/domain/ResidentChangedEvent.java` | 異動完了イベント |
| `apps/api-spring/src/main/java/jp/go/local/resident/repository/JuminCodeRepository.java` | 現行コード取得 |
| `apps/api-spring/src/main/java/jp/go/local/resident/repository/MyNumberRepository.java` | 現行番号取得 |
| `apps/api-spring/src/main/java/jp/go/local/resident/repository/ResidentHistoryRepository.java` | SCD-2: append / findSnapshotAt / listTransactions |
| `apps/api-spring/src/main/java/jp/go/local/resident/authz/HistoryWriter.java` | AFTER_COMMIT で履歴書込 |
| `apps/api-spring/src/test/java/jp/go/local/resident/ResidentApiIT.java` | Testcontainers 統合テスト |

### 変更
| パス | 内容 |
| --- | --- |
| `apps/api-spring/pom.xml` | `spring-boot-testcontainers` + `testcontainers:junit-jupiter` を追加 |
| `apps/api-spring/src/main/java/.../authz/MaskService.java` | `JuminCodeRepository` / `MyNumberRepository` を注入し `toResponse(Resident, Auth, unmask)` で Map 返却を実装 |
| `apps/api-spring/src/main/java/.../api/ResidentController.java` | `unmask` クエリ受領、`asOf` 時点照会、`/history` 抑止 404 |
| `apps/api-spring/src/main/java/.../api/TransactionController.java` | `ApplicationEventPublisher` を注入し、`/in` `/out` 完了時に `ResidentChangedEvent` を publish |

## 3. ビルド／テストコマンド

### Java（Spring 版）
ローカルに JDK 21 と Maven 3.9 が必要。Claude 環境では以下で導入済み：
- JDK: `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot` (winget `Microsoft.OpenJDK.21`)
- Maven: `C:\Users\highd\.local-maven\apache-maven-3.9.9` (Apache archive zip 展開)

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
cd apps\api-spring
mvn -B compile           # ✓ 23 source files
mvn -B test-compile      # ✓ test も含めて成功
mvn -B test              # ⚠ Docker Desktop 起動必須（Testcontainers）
mvn -B spring-boot:run   # PostgreSQL 起動済みなら :8788 で動く想定
```

### Node 側（変更なし／引き続き使う）
```powershell
npm run check       # ✓
npm run smoke       # ✓
npm run e2e:api     # ✓ 4 件
npm run web:build   # ✓
```

## 4. Codex 継続タスク（優先順）

優先 1 が **絶対先**（既存 Codex TODO の #1 を消化するため）。

### 1. **Docker Desktop 環境で `mvn test` を実行**
本環境は Docker 未インストールだったため、Testcontainers 実行は確認できていない。  
Codex 環境で：

```powershell
docker compose -f apps\api-spring\docker-compose.yaml up -d  # PostgreSQL 起動
cd apps\api-spring
mvn -B test
```

期待: `ResidentApiIT` が
- `contextLoadsAndSchemaApplied` ✓
- `residentLifecycle` (5 ダイナミックテスト) ✓

**もし失敗したら**:
- `R002 (抑止対象) を WINDOW で 404` ← `MaskService.applyResidentMask` の `restrictedFlag()` を見ているか確認
- `ADMIN + unmask` ← `JwtAuthenticationConverter` が `roles` クレームを `ROLE_ADMIN` に変換しているか確認（`SecurityConfig.java` 47-62 行）
- 履歴/時点照会のテストは `ResidentApiIT` には未含。`ResidentHistoryIT` を追加することを推奨

### 2. **TransactionController の `/out` を本物の証明書発行に接続**
現在は `Map.of("verifyToken", "PENDING_PDF")` のスタブ。`CertificateController.issue` を Service 層に抽出し、`TransactionController` から呼び出すこと。

### 3. **`HistoryWriter` を全異動パスで発火**
現状は `/in` `/out` のみ `publishEvent`。`/move` `/household` `/official` `/cancel` でも `ResidentChangedEvent` を発行する必要あり（影響を受ける residentId を確定して publish）。

### 4. **`@PreAuthorize` で抑止管理 API を保護**
`RestrictionController` のすべての操作系メソッドに：
```java
@PreAuthorize("hasRole('RESTRICTION_RELEASE') or hasRole('ADMIN')")
```

### 5. **OIDC IdP 接続**
`apps/api-spring/src/main/resources/application.yaml` の `issuer-uri` を Keycloak (推奨) に。
`docker-compose.yaml` に Keycloak を追加し、ロール → JWT claim `roles` を返す Mapper を構成。

### 6. **PDF/A 帳票**
`apps/web/src/print/CertificateTemplate.tsx` の HTML を、Spring 側 `CertificateService` から Playwright (PaaS で `node` ランタイム必要) or `OpenHTMLtoPDF` でレンダリングして `pdf_url` に保存。
`/api/v1/certificates/{issueId}/pdf` を Range レスポンス対応で追加。

### 7. **Web の dev proxy を Spring (:8788) に切替**
Node 版を完全に Spring に切り替える段階で `apps/web/vite.config.ts` の `proxy./api.target` を変更。E2E は Spring 版を起動して同じテストを通す。

### 8. **OpenAPI 同期**
`pom.xml` に `springdoc-openapi-starter-webmvc-ui` を追加し、`/v3/api-docs` を出力。CI で `c_openapi.yaml` との差分を検出するスクリプトを `tools/` に置く。

## 5. 設計トレーサビリティ（再確認）

機能 ID / 画面 ID / 帳票 ID / API-ID のキーは **改名禁止**。  
変更が必要な場合は以下を同時に更新：

```
c_openapi.yaml
└─→ packages/openapi/generated/api.d.ts (auto-gen)
└─→ apps/web/src/types.ts
└─→ apps/web/src/views/*.tsx
└─→ apps/api/src/server.js (Node)
└─→ apps/api-spring/src/main/java/.../*.java (Spring)
```

## 6. 既知の差分・リスク

- `apps/api/src/server.js` (Node) と `apps/api-spring/.../*.java` (Spring) の **二重実装** が現状。当面はどちらかを採用する判断が必要。E2E は `playwright.api.config.ts` で Node を import 起動するように Codex が変更済（テストは Node 側を見る）。Spring に切り替えるときは `playwright.config.ts` で Spring を `webServer` に指定。
- `MaskService.toResponse` で `my_number` のアンマスク値は **暗号文 (`enc:abcd`)** を返す。本番は KMS 復号後に平文（ただし監査ログ必須）。
- Spring 側の `transaction` テーブルへ書く `parent_transaction_id` は null か文字列のみ。`Cancel` の場合は親 ID をセット済。
- 時点照会 API は `?asOf=2025-04-01T00:00:00+09:00` 形式の OffsetDateTime のみ受領（`?asOf=2025-04-01` の日付単体は弾く → 400）。
- `apps/web-legacy/` は Codex 整理時に削除して良い（参照していない）。

## 7. 引き継ぎ用最小プロンプト

```
G:\マイドライブ\claudecode\住民記録システム_Web版 にて
CLAUDE_HANDOFF_3.md セクション 4 のタスク 1→8 を上から消化して。
- 1 をまず: Docker 起動して mvn test を通す。
- 失敗したら ResidentApiIT のアサーション期待値と MaskService の挙動を突き合わせる。
標準仕様書のキー（機能ID/画面ID/帳票ID/API-ID）改名時の全箇所同期、
ChromeOS Flex / Chromium 最新2世代 互換を引き続き保つこと。
作業前に docs/gap_matrix.md, docs/migration_react_vite.md,
README_handoff.md, CODEX_HANDOFF.md, CLAUDE_HANDOFF_2.md, 本書 を必ず読むこと。
```

## 8. ローカル環境セットアップ手順（新規 PC で続ける場合）

```powershell
# JDK 21
winget install --id Microsoft.OpenJDK.21 --silent --accept-source-agreements --accept-package-agreements

# Maven (winget に Apache Maven は無いので zip 展開)
$mvnZip = "$env:TEMP\maven.zip"
Invoke-WebRequest https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip -OutFile $mvnZip
Expand-Archive -Force -Path $mvnZip -DestinationPath "$env:USERPROFILE\.local-maven\"

# 環境変数（PowerShell プロファイルに書くと永続化）
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"

# Node 側依存
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm install

# Spring 側依存（初回のみ オンライン）
cd apps\api-spring
mvn -B dependency:resolve
```
