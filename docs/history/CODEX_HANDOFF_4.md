# Codex → Claude Code 引き継ぎメモ #4

最終更新: 2026-05-16
担当: Codex
対象: `G:\マイドライブ\claudecode\住民記録システム_Web版`
前回入力: Claude Code リミット到達後の継続依頼

## 1. 今回実施したこと

`CLAUDE_HANDOFF_3.md` / `CODEX_HANDOFF_3.md` の残タスクから、Docker不要で前進できる部分を進めた。

## 2. Spring: 証明書PDF取得 endpoint

追加:

- `apps/api-spring/src/main/java/jp/go/local/resident/service/CertificatePdfService.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/service/CertificatePdfServiceTest.java`

変更:

- `apps/api-spring/src/main/java/jp/go/local/resident/api/CertificateController.java`
  - `GET /api/v1/certificates/{issueId}/pdf` を追加。
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="certificate-{issueId}.pdf"`

現状:

- 本番PDF/Aではなく、`certificate_issue` の発行情報を元にした簡易PDF。
- PDF/A、和文フォント埋め込み、`CertificateTemplate.tsx` からの帳票レンダリングは次フェーズ。

## 3. Node API: PDF取得 endpoint 追従

変更:

- `apps/api/src/server.js`
  - `GET /api/v1/certificates/{issueId}/pdf` を追加。
  - Node E2Eで発行済み `issueId` からPDF取得できるようにした。

- `tests/e2e/golden-path.api.spec.ts`
  - 住民票発行後にPDFを取得し、`application/pdf` と `%PDF-1.4` を検証。

## 4. OpenAPI同期

変更:

- `c_openapi.yaml`
  - `/certificates/{issueId}/pdf` を追加。

実行済み:

```powershell
npm run generate:openapi
```

生成物:

- `packages/openapi/generated/api.d.ts`

## 5. Spring: 異動APIの業務ガード追加

変更:

- `apps/api-spring/src/main/java/jp/go/local/resident/api/TransactionController.java`

追加したガード:

- `/transactions/out`
  - 対象住民が存在しない場合 `404 NOT_FOUND`
  - 既に転出済みの場合 `409 ALREADY_MOVED_OUT`

- `/transactions/cancel`
  - 取消元transactionが存在しない場合 `404 NOT_FOUND`
  - `CANCEL` transactionを取消元に指定した場合 `409 INVALID_CANCEL_TARGET`

## 6. CI足場の継続

前回追加の `.github/workflows/ci.yml` は維持。

今回追加したPDF endpoint / OpenAPI生成 / Node E2E拡張もCI対象に入る。

## 7. 確認済みコマンド

Spring:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
cd "G:\マイドライブ\claudecode\住民記録システム_Web版\apps\api-spring"
mvn -B test
```

結果:

- `MaskServiceTest`: 2 passed
- `CertificatePdfServiceTest`: 1 passed
- `ResidentApiIT`: 2 skipped（Docker未導入）
- build: SUCCESS

Node/Web:

```powershell
cd "G:\マイドライブ\claudecode\住民記録システム_Web版"
npm run check
npm run e2e:api
npm run generate:openapi
```

結果:

- `npm run check`: PASS
- `npm run e2e:api`: 4 passed（PDF取得検証を含む）
- `npm run generate:openapi`: PASS

直前ラウンドで確認済み:

```powershell
npm run web:build
```

結果: PASS

## 8. 未確認・注意

- Dockerが無いため、`ResidentApiIT` のTestcontainers本体はまだ未実行。
- `CertificatePdfService` は簡易PDFスタブ。正式帳票ではない。
- Node APIにもPDFスタブを追加したが、Spring版と完全同一の内容ではない。API契約としては `application/pdf` を返す点を合わせた。
- OpenAPIに `/certificates/{issueId}/pdf` を追加したため、画面側で `pdfUrl` を使ってダウンロード/表示導線を作れる。
- `TransactionController` の業務ガードは最低限。転居・世帯変更・職権決裁の整合性チェックはまだ必要。

## 9. 次にClaude Codeへお願いしたいこと

優先順:

1. Dockerあり環境で `mvn -B test` を実行し、`ResidentApiIT` をskipではなく実行する。
2. `CertificatePdfService` を正式PDF/A生成へ置換する。
   - `apps/web/src/print/CertificateTemplate.tsx`
   - `apps/web/src/print/certificate.css`
   - Noto Sans/Serif CJK + 自治体外字フォント
3. Spring APIでNode API E2E相当を実行する設定を追加。
   - `playwright.spring.config.ts`
   - `mvn spring-boot:run` または jar 起動
   - PostgreSQL docker compose 起動
4. `TransactionController` の業務ルール強化。
   - 転居対象世帯の存在チェック
   - 世帯変更の影響住民全員への履歴イベント
   - 職権決裁で `transaction_approval` へ記録
5. `springdoc-openapi-starter-webmvc-ui` を追加し、`/v3/api-docs` と `c_openapi.yaml` の差分検出をCIに入れる。
6. GitHub Actionsで実CIを回し、Linux runner上のDocker/Testcontainers結果を確認する。

## 10. 最小再開プロンプト

```text
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_3.md / CODEX_HANDOFF_3.md / CODEX_HANDOFF_4.md を読んで続きから進めて。

Codex追加分:
- Springに GET /api/v1/certificates/{issueId}/pdf を追加
- CertificatePdfService とユニットテストを追加
- Node APIにも同PDF endpointを追加
- API E2EでPDF取得を検証
- c_openapi.yaml に /certificates/{issueId}/pdf を追加し型生成済み
- TransactionControllerで二重転出/不正取消の409/404ガードを追加

確認済み:
- mvn -B test PASS（Dockerなしのため ResidentApiIT はskip）
- npm run check PASS
- npm run e2e:api PASS
- npm run generate:openapi PASS

次はDockerあり環境で ResidentApiIT を実行し、PDF/A正式生成とSpring版E2Eへ進めて。
```
