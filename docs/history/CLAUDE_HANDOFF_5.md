# Claude → Codex 引き継ぎメモ #5

最終更新: 2026-05-16  
担当: Claude Code (Opus 4.7)  
前回: `CODEX_HANDOFF_4.md` (Codex round 4: 簡易PDF endpoint, TransactionController 二重転出ガード, OpenAPI 同期)  
本書: Codex round 4 を踏まえた Claude の継続作業ログ

## 1. このラウンドで完了したこと

CODEX_HANDOFF_4.md セクション 9 の優先 2〜5 を中心に消化:

| # | 項目 | 結果 |
| --- | --- | --- |
| #5 | **springdoc-openapi の組み込み**＋**`c_openapi.yaml` との差分検出ツール** | ✓ `pom.xml` 依存追加、`application.yaml` 設定、SecurityConfig で `/v3/api-docs` `/swagger-ui/**` 公開、`tools/openapi-diff.mjs` 追加、`npm run openapi:diff` |
| #4 | **TransactionController 業務ルール強化** | ✓ `/move` 世帯存在＋在籍員チェック、`/household` 新世帯主が同世帯員チェック、`/official` 起票は DRAFT、`/{txId}/approve` 職権専用＋ `transaction_approval` への決裁ステップ記録、`/cancel` 二重取消防止 |
| #2 | **PDF を OpenHTMLtoPDF で HTML テンプレ → PDF レンダリング化** | ✓ Codex 版の簡易テキスト PDF を置換。`certificate-template.html`（A4 縦・和暦・公印・QR placeholder）を `CertificatePdfService` から `PdfRendererBuilder` で生成。`%PDF-` ヘッダ＋ `%%EOF` ＋ >1KB のテスト追加。Mockito stubbing も新クエリに合わせて書き換え |
| #3 | **`playwright.spring.config.ts`** + Spring 用スモークテスト `spring-smoke.spec.ts` | ✓ baseURL `:8788`、`/actuator/health` / `/v3/api-docs` / `/api/v1/verify/{token}` の 3 件。`npm run e2e:spring` で実行（要 Spring 起動済） |

| 検証 | 結果 |
| --- | --- |
| `mvn -B compile` (Spring main) | ✓ 25 source files |
| `mvn -B test` (Spring) | ✓ 3 PASS + 2 SKIP (Docker 未導入の ResidentApiIT のみスキップ) |
| `npm run check` (Node typecheck) | ✓ |
| `npm run smoke` (Node) | ✓ |
| `npm run e2e:api` (Playwright Node) | ✓ 4 件 PASS |
| `node tools/openapi-diff.mjs` | ✓ Spring 停止時はエラー終了で診断メッセージを表示 |

## 2. ファイル変更／追加サマリ

### 新規
| パス | 役割 |
| --- | --- |
| `apps/api-spring/src/main/resources/certificate-template.html` | A4 縦・和暦・公印・QR placeholder の HTML 帳票テンプレ |
| `tools/openapi-diff.mjs` | `c_openapi.yaml` ⇔ Spring `/v3/api-docs` の operation 差分検出 |
| `playwright.spring.config.ts` | Spring API 向け Playwright 設定（:8788） |
| `tests/e2e/spring-smoke.spec.ts` | Spring 起動済前提のスモーク（health, api-docs, verify） |

### 変更
| パス | 内容 |
| --- | --- |
| `apps/api-spring/pom.xml` | `springdoc-openapi-starter-webmvc-ui` 2.7.0 / `openhtmltopdf-core` `pdfbox` 1.0.10 を追加 |
| `apps/api-spring/src/main/resources/application.yaml` | `springdoc.api-docs` / `swagger-ui` 設定 |
| `apps/api-spring/src/main/java/.../config/SecurityConfig.java` | `/v3/api-docs/**` `/swagger-ui/**` を permitAll |
| `apps/api-spring/src/main/java/.../service/CertificatePdfService.java` | 簡易テキスト PDF を OpenHTMLtoPDF + HTML テンプレ生成に置換。和暦変換、項目別マスク、世帯主取得 |
| `apps/api-spring/src/test/java/.../service/CertificatePdfServiceTest.java` | 新スキーマに対応する Mockito stub と PDF 検証に書き換え |
| `apps/api-spring/src/main/java/.../api/TransactionController.java` | `/move` `/household` `/official` `/approve` `/cancel` の業務ルール強化（バリデーション・存在チェック・状態遷移・決裁記録） |
| `package.json` | `openapi:diff`, `e2e:spring` を script に追加、`js-yaml` を devDeps に |

## 3. ビルド・テストコマンド

### Java（Spring）
```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.local-maven\apache-maven-3.9.9\bin;$env:Path"
cd apps\api-spring
mvn -B test              # ✓ 3 PASS / 2 SKIP (ResidentApiIT は Docker 必要)
mvn -B spring-boot:run   # :8788 で起動
```

Spring 起動後、別ターミナルで：
```powershell
node tools\openapi-diff.mjs   # c_openapi.yaml ⇔ Spring 実装の差分
npm run e2e:spring            # Spring 版スモーク
```

### Node
```powershell
npm run check       # ✓
npm run smoke       # ✓
npm run e2e:api     # ✓ 4 件
npm run web:build   # ✓
```

## 4. 既知の差分／注意

- **OpenHTMLtoPDF の和文フォント**: 本サービスはサーバの OS にインストールされたフォントを利用する。CI/本番 Docker イメージには `fonts-noto-cjk` を入れること。入っていないと和文が `?` で化ける。テストは PDF バイト列の妥当性しか確認していない。
- **PDF/A-2b 準拠**: 現状は PDF 1.4 出力で PDF/A 準拠ではない。`PdfRendererBuilder.usePdfAConformance(PdfAConformance.PDFA_2_B)` と ICC プロファイル設定が必要。
- **`transaction_approval` への記録**: `/approve` で書き込むようにしたが、`role` カラムは固定値 `APPROVER` を入れている（決裁ルートテーブルから引くべき）。
- **`/official` 起票後の決裁前 publishEvent**: 起票時には publish しない（DRAFT のため）。`APPLIED` 化時のみ publish するように整合済。
- **springdoc は SecurityConfig で permitAll** にしているが、本番では `/swagger-ui` は社内ネットワークのみに制限すること。
- **Spring 側の Authentication 必須エンドポイントは Node 互換の `X-Dev-Roles` を受け付けない**。Codex の `JwtAuthenticationConverter` が JWT クレーム `roles` を `ROLE_*` に展開する仕組みになっているので、テストでも JWT を発行して `Authorization: Bearer ...` を付ける必要あり。
- **Codex round 4 の Node API PDF endpoint** とは中身が違う（Node はスタブ、Spring は本物の HTML レンダリング）。API 契約 (`application/pdf`) のみ互換。

## 5. Codex 継続タスク（優先順）

### 1. **Docker 環境で `mvn -B test` を実行し、`ResidentApiIT` の SKIP を解消**
- 期待: 全 5 テスト PASS（context load + 4 つの動的テスト）。
- Codex CI は Linux runner + Docker なので、`ResidentApiIT` が自動実行される想定。

### 2. **`CertificatePdfService` の PDF/A-2b 準拠化**
```java
builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.PDFA_2_B);
builder.useColorProfile(...); // sRGB ICC プロファイル
builder.useFont(noto, "Noto Serif CJK JP");  // 同梱フォント
```
- フォントは `src/main/resources/fonts/NotoSerifCJKjp-Regular.otf` を同梱して `useFont` で明示登録するのが堅い。

### 3. **`/v3/api-docs` と `c_openapi.yaml` の差分 0 を確認**
- Spring 起動 → `npm run openapi:diff`。
- 現状想定される差分: 操作 ID は揃っているが `c_openapi.yaml` 側にしかない `/transactions/birth`, `/transactions/death`, `/codes/jumin`, `/codes/mynumber` などスタブ実装の operation は spring 側にも存在するか確認。
- 漏れがあれば Controller を追加、もしくは yaml 側を実装に合わせる。

### 4. **JWT 認証必須エンドポイントの Spring E2E**
- `spring-smoke.spec.ts` は公開エンドポイント 3 件のみ。
- 次は dev-IdP（Keycloak コンテナ or 簡易 HS256 鍵共有）を docker-compose に足し、`Authorization: Bearer` で住民検索を叩く E2E を `spring-residents.spec.ts` として追加。

### 5. **GitHub Actions の CI を確認**
- `.github/workflows/ci.yml` で `mvn -B test`（Linux Docker 込み）が回ることを確認。
- 失敗ジョブを潰す。

### 6. **`HEAD_CHANGE` 以外の世帯変更操作**
- `SPLIT` （世帯分離）、`MERGE`（世帯合併）は現状単に transaction を切るだけ。
- 実装: SPLIT は新 household を発行し対象住民の household_id を更新。MERGE は対象住民を吸収先 household に付け替え、旧 household を closed_date 設定。

### 7. **Web UI から PDF ダウンロード導線**
- `apps/web/src/views/CertificateView.tsx` で発行後の `issueId` を保持し `<a href="/api/v1/certificates/{issueId}/pdf">PDF</a>` を表示する。
- 既に発行レコードは状態に持っているので簡単に追加可。

## 6. 設計トレーサビリティ（再掲）

```
c_openapi.yaml (SSOT)
└─→ packages/openapi/generated/api.d.ts (auto-gen by openapi-typescript)
└─→ apps/web/src/types.ts (re-export)
└─→ apps/web/src/views/*.tsx
└─→ apps/api/src/server.js (Node)
└─→ apps/api-spring/src/main/java/.../*.java (Spring)
└─→ apps/api-spring runtime: /v3/api-docs ← tools/openapi-diff.mjs で照合
```

機能 ID `F-x-y-zz` / 画面 ID `SCR-xxx` / 帳票 ID `00100xx` / API-ID `API-*` は引き続き **改名禁止**。

## 7. 最小再開プロンプト

```text
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CODEX_HANDOFF_4.md → CLAUDE_HANDOFF_5.md と CLAUDE_HANDOFF_3.md を読んで続きから。

Claude round 5 追加分:
- springdoc-openapi 2.7.0 を依存追加、SecurityConfig で /v3/api-docs と /swagger-ui を公開
- tools/openapi-diff.mjs で c_openapi.yaml ⇔ Spring /v3/api-docs の operation 差分検出
- CertificatePdfService を OpenHTMLtoPDF + certificate-template.html ベースに置換
  （和暦変換・項目別マスク・世帯主表示。テストは PDF バイト妥当性で検証）
- TransactionController に業務ルール (世帯存在チェック / 新世帯主は同世帯員 /
  職権起票は DRAFT / 決裁ステップ記録 / 二重取消防止) を追加
- playwright.spring.config.ts + spring-smoke.spec.ts を追加

確認済み:
- mvn -B test PASS (5 件中 3 PASS + 2 SKIP, Docker なしのため ResidentApiIT は skip)
- npm run check / smoke / e2e:api PASS

次の優先 (CLAUDE_HANDOFF_5.md セクション5):
1. Docker 環境で ResidentApiIT を実行
2. PDF/A-2b 準拠化と和文フォント埋め込み
3. /v3/api-docs と c_openapi.yaml の差分 0 確認
4. JWT 必須の Spring E2E (dev-IdP 経由)
5. GitHub Actions CI が回ることを確認
6. SPLIT/MERGE 世帯操作の実装
7. Web UI の PDF ダウンロード導線

ChromeOS Flex / Chromium 最新2世代 互換、機能ID/画面ID/帳票ID/API-IDの改名禁止は維持。
```
