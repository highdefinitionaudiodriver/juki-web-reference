# Codex → Claude Code 引き継ぎメモ #3

最終更新: 2026-05-16
担当: Codex
対象: `G:\マイドライブ\claudecode\住民記録システム_Web版`
前回入力: `CLAUDE_HANDOFF_3.md`

## 1. 今回実施したこと

`CLAUDE_HANDOFF_3.md` セクション 4 の優先タスクを上から進めた。

### 優先1: `mvn test`

- Maven/JDK 21 は利用可能。
- Docker CLI はこの環境では未導入。
- `ResidentApiIT` が Surefire の既定パターン外で実行されていなかったため、`pom.xml` に Surefire includes を追加して `**/*IT.java` も対象にした。
- `ResidentApiIT` に `@Testcontainers(disabledWithoutDocker = true)` を付与し、Dockerなし環境では明示的にskipされるようにした。
- Dockerなしでも必ず走る `MaskServiceTest` を追加。

結果:

```powershell
mvn -B test
```

- `MaskServiceTest`: 2 passed
- `ResidentApiIT`: 2 skipped（Docker未導入のため）
- Maven build: SUCCESS

### 優先2: `/transactions/out` を本物の証明書発行に接続

追加:

- `apps/api-spring/src/main/java/jp/go/local/resident/service/CertificateIssueService.java`

変更:

- `CertificateController`
  - 証明発行処理を `CertificateIssueService.issue(...)` に委譲。

- `TransactionController`
  - `/transactions/out` で `certificate_issue` へ実レコードを挿入。
  - レスポンスの `certificate.verifyToken` が `PENDING_PDF` スタブではなく、実発行トークンになる。
  - `transaction_id` を `certificate_issue.transaction_id` に保存。

### 優先3: `HistoryWriter` を全異動パスへ拡張

変更:

- `TransactionController`
  - `/move`: 世帯内の現住者全員へ `ResidentChangedEvent` をpublish。
  - `/household`: `newHeadResidentId` があればpublish。
  - `/official`: 対象 `residentId` にpublish。
  - `/cancel`: 親transactionの `resident_id` にpublish。

既存の `/in` `/out` に加え、主要な変更系パスで `resident_history` へのSCD-2履歴書き込みが走る足場になった。

### 優先4: 抑止管理APIの `@PreAuthorize`

変更:

- `RestrictionController`
  - `POST /restrictions`
  - `DELETE /restrictions/{id}`

どちらも以下に変更。

```java
@PreAuthorize("hasRole('RESTRICTION_RELEASE') or hasRole('ADMIN')")
```

### CI足場

追加:

- `.github/workflows/ci.yml`

内容:

- Node 24
- `npm ci`
- `npm run generate:openapi`
- `npm run check`
- `npm run smoke`
- `npm run e2e:api`
- `npm run web:build`
- Java 21
- `apps/api-spring` で `mvn -B test`

GitHub Actions の Linux runner ならDockerが使えるため、`ResidentApiIT` も実行される想定。

## 2. 追加・変更ファイル

### 新規

- `.github/workflows/ci.yml`
- `apps/api-spring/src/main/java/jp/go/local/resident/service/CertificateIssueService.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/authz/MaskServiceTest.java`
- `CODEX_HANDOFF_3.md`

### 変更

- `apps/api-spring/pom.xml`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/CertificateController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/TransactionController.java`
- `apps/api-spring/src/main/java/jp/go/local/resident/api/RestrictionController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/ResidentApiIT.java`

## 3. 確認済みコマンド

PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
cd "G:\マイドライブ\claudecode\住民記録システム_Web版\apps\api-spring"
mvn -B compile test-compile
mvn -B test
```

結果:

- `compile test-compile`: SUCCESS
- `test`: SUCCESS
  - `MaskServiceTest`: 2 passed
  - `ResidentApiIT`: 2 skipped（Dockerなし）

Node/Web:

```powershell
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm run check
npm run e2e:api
npm run generate:openapi
npm run web:build
```

結果:

- `npm run check`: PASS
- `npm run e2e:api`: 4 passed
- `npm run generate:openapi`: PASS
- `npm run web:build`: PASS

## 4. 未確認・注意

- この環境には `docker` が無いため、`ResidentApiIT` のTestcontainers本体は未実行。
- `@Testcontainers(disabledWithoutDocker = true)` により、DockerがあるCI/PCでは実行、無いPCではskipされる。
- GitHub ActionsではDockerが使える想定だが、まだ実リモートCIでの実行結果は未確認。
- `CertificateIssueService` はPDF/A生成まではしていない。`pdfUrl` は `/api/v1/certificates/{issueId}/pdf` を指すが、そのGET endpointは未実装。
- `HistoryWriter` のpublish対象は広げたが、`/household` は `newHeadResidentId` のみ。分離・合併で影響する全住民の確定ロジックはまだ必要。
- `birth` / `death` / `koseki` はまだstubのため、履歴イベントも未発火。
- `MaskServiceTest` はMockitoのdynamic agent警告が出る。将来JDKではMockito agent設定をMavenに追加する必要がある。

## 5. 次にClaude Codeへお願いしたいこと

優先順:

1. Docker Desktop またはGitHub Actions上で `mvn -B test` を実行し、`ResidentApiIT` がskipではなく実行される状態で失敗を潰す。
2. `/api/v1/certificates/{issueId}/pdf` を追加し、まずはHTML/printテンプレートからのPDF生成方針を決める。
3. `HistoryWriter` の対象を `birth` / `death` / `koseki` と、世帯変更の影響住民全員に広げる。
4. `TransactionController` の業務ルールを強化する。
   - 転出済み住民の二重転出防止
   - 取消時の親transaction検証
   - 職権決裁の `transaction_approval` 書き込み
5. Spring APIでNode API E2E相当を通す設定を追加する。
   - `playwright.spring.config.ts` などを作る
   - `apps/web/vite.config.ts` proxyを `:8788` に切替可能にする
6. `springdoc-openapi-starter-webmvc-ui` を追加し、`/v3/api-docs` と `c_openapi.yaml` の差分検出をCIに組み込む。

## 6. 最小再開プロンプト

```text
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_3.md と CODEX_HANDOFF_3.md を読んで続きから進めて。
Codexは以下を実施済み:
- Surefireで *IT を拾うよう修正
- ResidentApiIT を Dockerなしskip化
- Dockerなしでも走る MaskServiceTest を追加
- CertificateIssueService を追加し /transactions/out を実証明発行へ接続
- HistoryWriter publish対象を /move /household /official /cancel に拡張
- RestrictionController を ADMIN でも操作可能に変更
- GitHub Actions CI を追加

確認済み:
- mvn -B compile test-compile PASS
- mvn -B test PASS（MaskServiceTest 2 passed / ResidentApiIT 2 skipped）
- npm run check PASS
- npm run e2e:api PASS
- npm run generate:openapi PASS
- npm run web:build PASS

次はDockerあり環境で ResidentApiIT を実行し、Spring APIをNode API E2E相当まで引き上げて。
```
