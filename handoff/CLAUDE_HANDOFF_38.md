# Claude → Codex 引き継ぎメモ #38

最終更新: 2026-05-18  
担当: Claude Code (Opus 4.7)  
前回: `CLAUDE_HANDOFF_37.md`（Codex round 37: ADMIN ロール限定 + WINDOW 403 テスト）

## 1. このラウンドで完了したこと（E. AdminView での承認操作 UI）

### A. AdminView に EUC 承認キューを追加

`apps/web/src/views/AdminView.tsx`:
- `onEucListQueued?` / `onEucApprove?` の optional prop を追加（両方与えられた時のみ承認キューを描画）
- ロールパネル下に「EUC 承認キュー（管理者）」ブロック
- `useEffect` で初回ロード、「更新」ボタンで再取得
- 表形式: `jobId / 申請者 / 出力項目 / 承認・却下ボタン`
- 個人番号含む場合は `⚠ 個人番号含む` ラベル表示
- コメント入力は表全体で共通、承認 / 却下後に自動再取得 + 最終結果表示
- 承認待ち 0 件のときは「承認待ちの EUC 依頼はありません。」を表示

### B. App.tsx で AdminView に承認 ハンドラを接続

`apps/web/src/App.tsx`:
- `api.eucList("QUEUED")` を `onEucListQueued` に
- `api.eucApprove(jobId, { action, comment })` を `onEucApprove` に
- DONE / FAILED で notice を出し分け（ReportsView と同じ挙動）

### C. AdminView 単体テスト 4 件追加（47 → 51 件）

新規: `apps/web/src/views/AdminView.test.tsx`

| テスト | 内容 |
| --- | --- |
| 監査ログ更新ボタンで onRefresh が呼ばれる | 既存機能の固定 |
| onEucListQueued / onEucApprove 未指定なら承認キューは非表示 | optional 制御 |
| 一覧表示 + APPROVE で onEucApprove(jobId, APPROVE, comment) | クリック承認の動作 |
| 承認待ち 0 件のとき空メッセージ | 空状態 UI |

## 2. 検証結果

```
mvn -B test          107 件 (87 PASS + 20 SKIP)（Spring 側変更なし、round 37 状態維持）
npm run check        PASS
npm run web:test     51 件 PASS（AdminView 4 件追加）
npm run smoke        PASS
npm run web:build    PASS (231.01 KB / gzip 71.65 KB)
npm run e2e:api      13 件 PASS
```

コミット: `793971f feat: AdminView に EUC 承認パネルを追加 (管理者向け)`

## 3. 変更ファイル

### 新規
- `apps/web/src/views/AdminView.test.tsx`

### 変更
- `apps/web/src/views/AdminView.tsx`（承認キュー UI 追加）
- `apps/web/src/App.tsx`（AdminView に onEucListQueued / onEucApprove を接続）

## 4. テスト合計

| カテゴリ | 件数 |
| --- | ---: |
| Spring MockMvc + Unit | 87 |
| Spring Testcontainers IT | 20 |
| Vitest | **51** |
| Playwright Node API | 13 |
| Playwright a11y | 7 |
| OpenAPI diff (CI) | 1 |
| **合計** | **179** |

## 5. 残タスク優先順

### A. EUC 二人承認 / 多段承認（前回 1 から継続）
- `report_request.required_approvals INT DEFAULT 1` を追加するスキーマ migration
- `includeMyNumber=true` のとき `required_approvals=2` を投入
- `approve` 内で `report_approval` の APPROVE 件数をカウントし、`>= required_approvals` 達成時のみ
  `report_request.status = DONE` へ遷移
- 1 名目の承認は QUEUED のまま `report_approval(step=1)` 記録、2 名目は別 approver で `step=2` → DONE
- self-approval 409 は既存。さらに `同一 approver の重複承認禁止` を追加

### B. REJECT 後の再申請ポリシー
- `POST /api/v1/euc/{jobId}/resubmit` を新設、params をコピーして新 request_id 発行
- `report_event` に `RESUBMIT` を記録、原 jobId を `details` に保持
- AdminView / ReportsView に「再申請」ボタン

### C. 個人番号出力の本実装
- `FIELD_EXPRESSIONS` に `myNumber` を追加（承認済かつ ADMIN 限定）
- 暗号化列の復号 + 監査ログ強化

### D. EUC パスワード通知の別経路化
- `X-Euc-Password` ヘッダ廃止、メール / SMS / 庁内通知に分離
- `report_event` に `PASSWORD_NOTIFIED`（媒体名のみ、平文は残さない）

### E. PDF/A-2b 真の適合 / 残り帳票
- Noto CJK 明示 `useFont`、ICC sRGB profile 埋め込み
- veraPDF `|| ::warning::` → `|| exit 1`
- 0010002–0010019 / 年報の form_id 別レイアウト

## 6. 注意点

- AdminView の承認キュー UI は `onEucListQueued` と `onEucApprove` の両方が
  渡されたときのみ表示。片方だけ渡しても表示されない（誤操作防止）
- 同じ承認 UI が ReportsView と AdminView の両方にあるが、意図的：
  - ReportsView: 通常職員が自分の依頼状態を確認 + 自分で押せる場合に承認
  - AdminView: ADMIN が一括で承認キュー処理
  実運用では ReportsView 側を hide する選択肢もあり（Codex 判断）
- 機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持

## 7. 最小再開プロンプト

```text
C:\Users\highd\Documents\Github\juki-web-reference または
G:\マイドライブ\claudecode\住民記録システム_Web版 を確認し、
CLAUDE_HANDOFF_37.md → CLAUDE_HANDOFF_38.md を読んで続きから。

Claude round 38 追加分:
- AdminView に EUC 承認キューを追加 (管理者向け、表形式、ワンクリック承認/却下)
- App.tsx で AdminView の onEucListQueued / onEucApprove を api.eucList / api.eucApprove に接続
- AdminView.test.tsx 新規 4 件 → Vitest 51 件 PASS

確認済み:
- mvn -B test: 107 件 (87 PASS + 20 SKIP) - Spring 側変更なし
- npm run check / web:test 51 / smoke / web:build / e2e:api 13: 全 PASS

次の優先 (CLAUDE_HANDOFF_38.md セクション 5):
A. EUC 二人承認: report_request.required_approvals + approve count による DONE 遷移
B. REJECT 後の再申請 POST /euc/{jobId}/resubmit
C. 個人番号出力の復号・マスク・監査
D. パスワード通知の別経路化 (メール/SMS)
E. PDF/A-2b 真の適合 + 0010002-0010019 / 年報

機能 ID / 画面 ID / 帳票 ID / API-ID の改名禁止を維持。
```
