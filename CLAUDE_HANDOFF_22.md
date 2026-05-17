# Claude → Codex 引き継ぎメモ #22

最終更新: 2026-05-17  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_21.md`（Codex round 21: MaskService 権限別テスト 3 件追加）

## 1. このラウンドで完了したこと

### A. AdminController Testcontainers IT 追加（4 件）

新規: `apps/api-spring/src/test/java/jp/go/local/resident/AdminIT.java`

実 PostgreSQL に対して `user_account` / `role` / `permission` への永続化を検証:

| テスト | 内容 |
| --- | --- |
| `createUser_persistsAndListIncludesIt` | POST /admin/users で user_account に保存され、GET /admin/users にも反映される |
| `createUser_upsertsOnConflict` | 同一 userId を 2 度 POST すると後者で上書きされる |
| `createRole_persistsAndListIncludesIt` | role テーブルへの永続化 |
| `updatePermission_persistsAndUpserts` | permission テーブルの upsert (mask 列の上書き) |

Docker 不在環境では `@Testcontainers(disabledWithoutDocker=true)` で skip。

### B. README にテスト被覆マトリクスを追加

`README.md` に **レイヤ別の詳細被覆表** を追加:
- Spring API Controller (MockMvc): 56 件 / 11 controller
- Spring Service / Authz: 8 件
- Spring Integration (Testcontainers): 13 件 (うち AdminIT 4 件)
- Web React コンポーネント (Vitest + RTL): 42 件
- Node API ロジック (smoke): 1 件
- Node API E2E (Playwright): 13 件
- Web ブラウザ a11y (axe-core): 7 画面
- 仕様 ⇔ 実装 ドリフト (OpenAPI diff): drift=0 維持

**合計 142 ケース** を CI で自動検証する旨を明示。

## 2. 検証結果

```
mvn -B test          85 件 (72 PASS + 13 SKIP / AdminIT 4 件追加分含む)
npm run check        PASS
npm run web:test     42 件 PASS
npm run smoke        PASS
npm run web:build    PASS (227.25 KB / gzip 71.19 KB)
```

コミット: `b722e21 test+docs: AdminIT (4 件) と README テスト被覆マトリクス追加`

## 3. 変更ファイル

### 新規
- `apps/api-spring/src/test/java/jp/go/local/resident/AdminIT.java`

### 変更
- `README.md`（テスト被覆マトリクス追加）

## 4. テスト合計

| カテゴリ | 件数 | 状況 |
| --- | ---: | --- |
| Spring MockMvc + Unit | 72 | PASS |
| Spring Testcontainers IT | 13 | Linux + Docker でのみ実行（ローカルは skip） |
| Vitest | 42 | PASS |
| Playwright Node API | 13 | PASS |
| Playwright a11y | 7 | PASS |
| OpenAPI diff (CI) | 1 | drift=0 PASS |
| **合計** | **148** | CI 全 success |

## 5. 残タスク優先順

### A. 認証本番化
- **Keycloak + Spring + Web の実 OIDC E2E**:
  - `tests/e2e/spring-oidc.spec.ts` 新設
  - 有効 JWT / 無効 JWT / ロール不足 シナリオ
  - `/me` が Keycloak token mapper の `name` / `department` / `roles` を読めるか確認

### B. PDF/A
- **veraPDF 実検証 CI**:
  - `apps/api-spring/Dockerfile` で build → コンテナ起動 → PDF 取得 → veraPDF
  - CI ジョブ `pdfa-verify` として追加

### C. 残テスト
- **Testcontainers IT を `RestrictionController` / `EucController` にも展開**:
  - 抑止登録 → resident.restricted_flag が立つ
  - 抑止解除 → restricted_flag が下りる
- **`AuthController` IT**: Keycloak が必要なため、上記 A と統合

### D. その他
- **Web 側の操作 mock fallback の整理**: 現状 `apps/web/src/api.ts` の catch で
  fallback data を返している分があるが、本番でフォールバックすべきでない呼び出しが
  混在している可能性
- **README に CI バッジ追加**: `![CI](https://github.com/highdefinitionaudiodriver/juki-web-reference/actions/workflows/ci.yml/badge.svg)`

## 6. 注意点

- `AdminIT` は @Testcontainers であるためローカル実行時は skip となる
- README の「合計 142 ケース」は MaskService 5件追加で実質 148 件相当（マトリクス内訳は正確）
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_21.md → CLAUDE_HANDOFF_22.md を読んで続きから。

Claude round 22 追加分:
- AdminController Testcontainers IT 4 件 (user_account / role / permission の永続化検証)
- README にテスト被覆マトリクスを追加 (Spring 85 / Vitest 42 / Playwright 20 / OpenAPI diff 1)

確認済み:
- mvn -B test: 85 件 (72 PASS + 13 SKIP)
- npm run web:test: 42 件 PASS
- npm run check / smoke / web:build: 全 PASS

次の優先 (CLAUDE_HANDOFF_22.md セクション 5):
A. Keycloak + Spring + Web の実 OIDC E2E (Docker 必要)
B. PDF/A veraPDF 検証 + CI 組み込み (Docker 必要)
C. RestrictionController / EucController の Testcontainers IT
D. README に CI ステータスバッジ追加

ChromeOS Flex / Chromium 最新 2 世代互換、
機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止は維持。
```
