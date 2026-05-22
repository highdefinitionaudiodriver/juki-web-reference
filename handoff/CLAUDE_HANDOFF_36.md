# Claude → Codex 引き継ぎメモ #36

最終更新: 2026-05-18  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_35.md`（Codex round 35: V003 report_approval/report_event + 自己承認 409）

## 1. このラウンドで完了したこと（A. QUEUED 一覧 API + UI 完結化）

### A-1. Spring: `GET /api/v1/euc` を新規実装

`apps/api-spring/src/main/java/jp/go/local/resident/api/EucController.java`:

```
GET /api/v1/euc                  ← 直近 100 件全件
GET /api/v1/euc?status=QUEUED    ← QUEUED 絞り込み
GET /api/v1/euc?status=DONE      ← DONE / FAILED も同様
```

返却項目（UI 表示用に整形）:
| フィールド | 説明 |
| --- | --- |
| `jobId` | `EUC-{request_id}` |
| `status` | QUEUED / DONE / FAILED |
| `requesterUserId` | 申請者 |
| `requestedAt` | 申請日時 |
| `outputFields` | params から抽出した string[] |
| `includeMyNumber` | params.includeMyNumber または outputFields に myNumber 含有 |
| `resultUrl` | DONE のみ |

### A-2. OpenAPI + TS 型同期

- `c_openapi.yaml` に `/euc` GET を追加
- `npm run generate:openapi` で `packages/openapi/generated/api.d.ts` を再生成
- CI の openapi-diff は drift=0 を維持

### A-3. Spring MockMvc 2 件追加（13 → 15 件）

`apps/api-spring/src/test/java/jp/go/local/resident/api/EucControllerTest.java`:

| テスト | 内容 |
| --- | --- |
| `list_withStatusQueued_returnsQueuedJobs` | `?status=QUEUED` で QUEUED 行が返り、params から outputFields / includeMyNumber を抽出 |
| `list_withoutStatus_returnsAllJobsLimited` | status 未指定で全件（DONE 含む）が返る |

### A-4. Web UI: 承認待ち一覧 → ワンクリック承認

`apps/web/src/views/ReportsView.tsx`:
- `EucListItem` 型を新規 export
- `onEucListQueued?` prop を追加（QUEUED 一覧取得）
- `useEffect` で初回ロード、`refreshQueued` で手動再取得
- 一覧の **jobId ボタンをクリックすると承認フォームの jobId 入力に反映**
- 承認 / 却下後に自動で一覧再取得
- 一覧 0 件時は「承認待ちの EUC 依頼はありません」

`apps/web/src/api.ts`:
- `eucList(status?)` を追加
- 重複していた `eucApprove` を削除

`apps/web/src/App.tsx`:
- `onEucListQueued` を `api.eucList("QUEUED")` に接続

### A-5. Vitest 2 件追加（45 → 47 件）

`apps/web/src/views/ReportsView.test.tsx`:
| テスト | 内容 |
| --- | --- |
| `onEucListQueued が QUEUED 一覧を返すと jobId ボタンが表示される` | useEffect 経由の一覧取得を検証 |
| `QUEUED 一覧の項目クリックで approveJobId 入力欄に値が入る` | 一覧からフォームへの転記を検証 |

## 2. 検証結果

```
mvn -B test          105 件 (85 PASS + 20 SKIP / EUC MockMvc 15 件含む)
npm run check        PASS
npm run web:test     47 件 PASS
npm run smoke        PASS
npm run web:build    PASS (228.37 KB / gzip 71.24 KB)
npm run e2e:api      13 件 PASS
```

コミット: `cb236cd feat: EUC QUEUED 一覧 API + 承認 UI 完結化`

## 3. 変更ファイル

### 変更
- `apps/api-spring/src/main/java/.../api/EucController.java`（GET 追加 + JsonNode import）
- `apps/api-spring/src/test/java/.../api/EucControllerTest.java`（list 2 件追加）
- `apps/web/src/views/ReportsView.tsx`（一覧 UI / useEffect / refresh / クリックで転記）
- `apps/web/src/views/ReportsView.test.tsx`（Vitest 2 件追加）
- `apps/web/src/api.ts`（eucList 追加 / eucApprove 重複削除）
- `apps/web/src/App.tsx`（onEucListQueued を api.eucList に接続）
- `c_openapi.yaml`（/euc を追加）
- `packages/openapi/generated/api.d.ts`（再生成）

## 4. テスト合計

| カテゴリ | 件数 |
| --- | ---: |
| Spring MockMvc + Unit | 85 |
| Spring Testcontainers IT | 20 |
| Vitest | **47** |
| Playwright Node API | 13 |
| Playwright a11y | 7 |
| OpenAPI diff (CI) | 1 |
| **合計** | **173** |

## 5. 残タスク優先順

### A. 承認統制の強化（前回 B から繰り越し）
- 承認者ロール制約: 現状はクラスレベル PreAuthorize なし、self-approval check のみ
- 二人承認 / 多段承認: `report_approval.step` の運用ルートを定義
- REJECT 後の再申請ポリシー

### B. 個人番号出力の本実装
- 現在 `myNumber` は二段階承認判定でしか使われず、CSV 出力 SQL の `FIELD_EXPRESSIONS` には含まれない
- 承認後の復号・マスク・監査・出力制御の設計が必要

### C. EUC パスワード通知の別経路化
- `X-Euc-Password` ヘッダ平文返却を、メール/SMS/庁内通知に分離

### D. PDF/A-2b 真の適合 / 残り帳票
- Noto CJK 明示 `useFont`
- ICC sRGB profile 埋め込み
- veraPDF `|| ::warning::` を `|| exit 1` に戻す
- 0010002–0010019 / 年報の form_id 別レイアウト

### E. AdminView での承認操作
- 一般職員はリクエスト、管理側ロールは承認、を AdminView 側にも置く方が UX 的に整理しやすい

## 6. 注意点

- `GET /euc` は認証必須だがロール制約はかけていない（list 表示のため）。
  実運用では `@PreAuthorize` で承認者ロール限定にする検討を
- `EucListItem.requestedAt` は ISO 文字列で返るが、現在 UI では生表示。
  和暦表示や相対時間表示は別途
- `report_request.params` は jsonb なので、SQL 上 `params::text as params_json` でキャストして
  Java 側で `objectMapper.readTree` する。`params -> 'outputFields'` のような直接抽出も可能だが、
  null 防御の観点で全文取得 → parse のほうが安全
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_35.md → CLAUDE_HANDOFF_36.md を読んで続きから。

Claude round 36 追加分:
- Spring: GET /api/v1/euc を新規実装 (status クエリで QUEUED/DONE/FAILED 絞り込み)
- OpenAPI に /euc 追加、TS 型再生成 (drift=0)
- EucControllerTest 2 件追加 → MockMvc 15 件
- Web ReportsView に QUEUED 一覧表示 + クリックで approveJobId 転記
- 承認/却下後に一覧自動再取得
- api.ts に eucList(status) 追加、重複の eucApprove 削除
- App.tsx で onEucListQueued を api.eucList('QUEUED') に接続
- Vitest 2 件追加 → 47 件 PASS

確認済み:
- mvn -B test: 105 件 (85 PASS + 20 SKIP)
- npm run check / web:test 47 / smoke / web:build / e2e:api 13: 全 PASS

次の優先 (CLAUDE_HANDOFF_36.md セクション 5):
A. 承認者ロール制約 + 二人承認 + REJECT 再申請ポリシー
B. 個人番号出力の復号・マスク・監査
C. パスワード通知の別経路化 (メール/SMS)
D. PDF/A-2b 真の適合 + 0010002-0010019 / 年報
E. AdminView での承認操作 UI

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
