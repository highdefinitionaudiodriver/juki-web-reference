# Claude → Codex 引き継ぎメモ #29

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_28.md`（Codex round 28: EUC ZIP scaffold + IT）

## 1. このラウンドで完了したこと

### A. EUC 結果 ZIP の AES-256 パスワード付暗号化（zip4j）

#### 依存追加
`apps/api-spring/pom.xml`:
```xml
<dependency>
  <groupId>net.lingala.zip4j</groupId>
  <artifactId>zip4j</artifactId>
  <version>2.11.5</version>
</dependency>
```

#### EucController 改修
`apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`:
- `java.util.zip.ZipOutputStream` → `net.lingala.zip4j.io.outputstream.ZipOutputStream`
- AES-256 `KEY_STRENGTH_256`、`DEFLATE` 圧縮、`EncryptionMethod.AES`
- ダウンロード毎に SecureRandom で 16 文字パスワード生成
  - 文字集合は混同を避けるため `I/l/0/O` 除外
- レスポンスヘッダ:
  - `X-Euc-Password`: 平文パスワード（TLS 必須）
  - `X-Euc-Password-Hash`: SHA-256 (hex 64 文字)
- `report_request.result_url` の末尾に `?passwordHash=...` を追記し監査
  （平文パスワードは保存しない）

#### テスト
- `EucControllerTest`:
  - `download_doneJob_returnsEncryptedZipAndPasswordHeader`: 既存テストを暗号化版に置換、復号して CSV 検証
  - `download_wrongPassword_failsToOpen` (新規): 誤パスワードで例外を検証
- `EucIT`: パスワードヘッダ取得 → zip4j 復号 → CSV 検証

#### OpenAPI
`c_openapi.yaml` の `/euc/{jobId}/result.zip`:
- description を AES-256 パスワード付に更新
- response headers に `X-Euc-Password` / `X-Euc-Password-Hash` を追加
- 型生成: `packages/openapi/generated/api.d.ts`

## 2. 検証結果

```
mvn -B test          95 件 (76 PASS + 19 SKIP / Docker なしの IT 群)
                       — EucControllerTest 5 → 6 件
npm run check        PASS
npm run web:test     42 件 PASS
npm run smoke        PASS
npm run web:build    PASS
```

コミット: `ec90b83 feat: EUC 結果 ZIP を AES-256 パスワード付暗号化に置換 (zip4j)`

## 3. 🚨 CI 失敗状況（直近 main の前 run `25993014812`）

```
✅ Spring OIDC E2E (Keycloak)
❌ PDF/A veraPDF
❌ Web + Node API
✅ OpenAPI diff (spec ⇔ Spring runtime)
❌ Spring Boot + Testcontainers
```

### 失敗詳細

#### a) Web + Node API: a11y 4 画面が 30 秒タイムアウト
失敗テスト:
- a11y 住民票画面
- a11y 証明発行画面
- a11y 抑止設定画面 (SCR-301)
- a11y 異動画面

エラー: `page.waitForSelector: Test timeout of 30000ms exceeded`

共通パターン: 住民検索後に `tbody tr` を click し、各画面へ遷移する流れ。
住民検索画面のテストのみ通っており、検索結果クリック以降の画面遷移が CI 環境で
タイムアウトしている。考えられる原因:
- Vite preview ではなく Node API が静的配信している環境で、初期ロード時の
  `api.me()` または `api.searchResidents({})` 失敗時に React state が
  進行せずテーブルが空のまま
- a11y test の `getByRole({ name: "検索" })` が「住民検索」ナビボタンと
  検索ボタン両方にマッチして検索ボタンを押せていない可能性も。
  ローカルでは `exact: true` を付けて回避済

#### b) PDF/A veraPDF: HTTP 500
ログから `curl: (22) The requested URL returned error: 500` および
postgresql の `receiveErrorResponse` が確認できる。Spring 起動後の
PostgreSQL マイグレーション or 接続段階で失敗している可能性が高い。

#### c) Spring Boot + Testcontainers: CertificatePdfIT で 1 件 Error
postgres `receiveErrorResponse` → Tomcat の ErrorReportValve がトリガ。
EucIT, HouseholdSplitMergeIT, AdminIT 等は PASS している。
CertificatePdfIT のみの問題。

### 推奨対処（Codex）
1. **a11y**: CI 環境で `tests/e2e/a11y.spec.ts` を `--reporter=html` で実行し
   `error-context.md` を確認。ナビ「住民検索」と検索ボタンの衝突は
   `getByRole("button", { name: /^検索$/ })` で回避できる
2. **CertificatePdfIT**: Flyway マイグレーション順序 or 個別テストの seed が
   不足。`@Sql` で追加 seed を投入
3. **pdfa-verify**: 上記 CertificatePdfIT と同根。Spring 起動後の
   `/actuator/health` が 200 を返さず curl が 500 を受けている

## 4. 変更ファイル

### 変更
- `apps/api-spring/pom.xml`（zip4j 依存追加）
- `apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`
- `apps/api-spring/src/test/java/jp/go/local/resident/EucIT.java`
- `c_openapi.yaml`
- `packages/openapi/generated/api.d.ts`

### 新規
- `CLAUDE_HANDOFF_29.md`

## 5. 残タスク優先順

### A. 🚨 CI 失敗修正（最優先）
1. **a11y タイムアウト原因の特定と修正**: ナビボタンと検索ボタンのロケータ
   衝突か、初期データロード失敗か。`exact: true` 相当の対策を入れる
2. **CertificatePdfIT 修正**: seed 追加もしくは Flyway 順序見直し
3. **pdfa-verify ジョブの修正**: CertificatePdfIT 修正と並行

### B. EUC 強化
1. **outputFields の許可リスト拡張**: 設計書 EUC の標準項目に揃える
2. **filters の SQL ビルダー**: WHERE 句生成を白リスト DSL で
3. **status 体系の整理**: DONE / QUEUED / APPROVAL_REQUIRED / FAILED

### C. その他
- パスワード通知の別経路化（メール/SMS）
- パスワード長・複雑度設定の application.yaml 化
- 帳票 0010002–0010019 の個別レイアウト
- WebAuthn / mTLS 実装

## 6. 注意点

- AES-256 パスワード生成は `SecureRandom`。文字集合は 16 文字で
  `54^16 ≒ 10^28` 通り、ブルートフォース耐性十分
- `X-Euc-Password` は平文返却なので **TLS 必須**。本番では別経路通知
  （メール/SMS）への置換を強く推奨
- `report_request.result_url` にハッシュを `?passwordHash=...` で
  追記している。完了済ジョブの再ダウンロードでは新たなパスワード／ハッシュで
  上書きされる
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_28.md → CLAUDE_HANDOFF_29.md を読んで続きから。

Claude round 29 追加分:
- EUC 結果 ZIP を AES-256 パスワード付暗号化に (zip4j 2.11.5)
- ダウンロード毎にランダム 16 文字パスワード生成、X-Euc-Password ヘッダで返却
- SHA-256 ハッシュを X-Euc-Password-Hash と report_request.result_url に記録
- EucControllerTest 1 件追加 (誤パスワードで失敗)、EucIT も復号検証に書き換え
- OpenAPI に response headers の仕様追記

確認済み:
- mvn -B test: 95 件 (76 PASS + 19 SKIP)
- npm run check / web:test / smoke / web:build: 全 PASS

🚨 直前 CI で 3 ジョブ失敗 (handoff 29 セクション 3):
- Web + Node API: a11y 4 画面が 30s タイムアウト
- PDF/A veraPDF: HTTP 500 (postgres 起因疑い)
- Spring Boot + Testcontainers: CertificatePdfIT 1 件 Error

次の優先:
A. CI 失敗の修正 (a11y locator 衝突、CertificatePdfIT seed)
B. EUC outputFields/filters/status 体系の本実装
C. パスワード通知別経路化

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
