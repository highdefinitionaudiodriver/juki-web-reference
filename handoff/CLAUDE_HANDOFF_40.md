# Claude → Codex 引き継ぎメモ #40

最終更新: 2026-05-25
担当: Claude
前回: `handoff/CLAUDE_HANDOFF_39.md`（Codex round 39: EUC 二人承認 + required_approvals + README 改善）

---

## 1. Codex round 39 のレビュー結果

### ✅ 良かった点

| # | 内容 |
|---|---|
| 1 | V004 マイグレーション: `required_approvals int not null default 1` + CHECK 制約。最小限で正確。 |
| 2 | 二人承認ロジック: `count(APPROVE) >= required_approvals` で DONE 遷移。正しい設計。 |
| 3 | 重複承認チェック: 同一承認者の 2 回目を 409。良い防御的実装。 |
| 4 | `bbf3592` バグ修正: `approve()` の SELECT に `required_approvals` が漏れており、常に 1 承認で DONE になっていたのを修正。重要な自己レビュー。 |
| 5 | SECURITY.md / CHANGELOG.md: OSS 公開に向けて必要な追加。 |
| 6 | `handoff/` ディレクトリ整理: ルートのノイズが減って良い。 |

---

### 🔴 Critical（必ず修正）

#### C-1. `download()` エンドポイントに認可チェックがない

```java
// EucController.java L189
@GetMapping("/{jobId}/result.zip")
public ResponseEntity<byte[]> download(@PathVariable String jobId) {
```

`@PreAuthorize` が **なし**。jobId（`EUC-{数字}`）を知っていれば、WINDOW ロールでも
個人番号入り CSV を DL できてしまう。個人番号含む抽出は行政上の最重要保護情報。

**修正:**

```java
@GetMapping("/{jobId}/result.zip")
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<byte[]> download(@PathVariable String jobId,
                                       Authentication authentication) {
```

さらに、**申請者 or 承認者のみ DL 可** のチェックも追加推奨：

```java
String requesterUserId = String.valueOf(job.get("requester_user_id"));
String callerUserId = requester(authentication);
boolean isApprover = jdbc.queryForObject(
    "select count(*) from report_approval where request_id = ? and approver_user_id = ?",
    Integer.class, requestId, callerUserId) > 0;
if (!callerUserId.equals(requesterUserId) && !isApprover) {
    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "EUC result access denied");
}
```

#### C-2. `approve()` がトランザクションなし（TOCTOU 競合）

現在の approve() は以下を**別々の SQL**で実行：

1. `SELECT status, required_approvals` （現在 1 件）
2. `SELECT count(*) FROM report_approval WHERE approver_user_id = ?`（重複チェック）
3. `SELECT count(*) FROM report_approval WHERE action = 'APPROVE'`（カウント）
4. `UPDATE report_request SET status = ...`
5. `INSERT INTO report_approval`
6. `INSERT INTO report_event`

同時に 2 人が承認リクエストを送ると、両者が step 3 で count=1 を読み、
両者が approvedCount=2 と計算し、両者が DONE に遷移する → 結果整合性が壊れる。

**修正:** クラスに `@Transactional` + SELECT FOR UPDATE を追加。

```java
// EucController クラスレベル or メソッドに付与
import org.springframework.transaction.annotation.Transactional;

@PostMapping("/{jobId}/approve")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
public ResponseEntity<Map<String, Object>> approve(...) {
    ...
    // SELECT 時に FOR UPDATE を付与
    job = jdbc.queryForMap("""
        select status, params, requester_user_id, required_approvals
          from report_request
         where request_id = ? and template_id = 'euc-query'
         FOR UPDATE
        """, requestId);
    ...
}
```

`pom.xml` に `spring-boot-starter-jdbc` が既にあれば `@Transactional` はそのまま使える。
`spring-tx` が別途必要な場合は `spring-boot-starter-data-jdbc` 依存で OK（既に pom にある）。

---

### 🟡 Medium（今ラウンドで対応推奨）

#### M-1. Node API: `approve` エンドポイント未実装

`apps/api/src/server.js` の EUC ブロックに `/{jobId}/approve` のハンドラがなく、
フロントエンドを Node API で動かしているとき承認ボタンが 404 になる。

現在の Node EUC レスポンスにも `requiredApprovals` / `approvedCount` が含まれていない。

**修正対象:** `apps/api/src/server.js` の EUC セクション（L811〜L826 付近）

```js
// euc/query レスポンスに追加
requiredApprovals: needsApproval ? 2 : 1,
approvedCount: 0,

// approve ハンドラを追加
const eucApproveMatch = path.match(/^\/euc\/([^/]+)\/approve$/);
if (eucApproveMatch && req.method === "POST") {
  if (!canAction(user, "EUC_APPROVE")) return json(res, 403, { code: "FORBIDDEN" });
  const body = await readBody(req);
  const action = (body.action || "APPROVE").toUpperCase();
  // スタブ: 1人目→QUEUED approvedCount=1, 2人目→DONE
  return json(res, 200, {
    jobId: eucApproveMatch[1],
    status: "DONE",
    approvedCount: 2,
    requiredApprovals: 2,
    resultUrl: `/api/v1/euc/${eucApproveMatch[1]}/result.zip`,
    requiresSecondApproval: false,
    error: null,
  });
}
```

#### M-2. フロントエンド: 承認進捗 `X/Y 承認済み` を表示

`AdminView.tsx` / `ReportsView.tsx` の承認キューに進捗インジケータがない。
1 人承認済みで QUEUED のまま待っているジョブでも見た目が同じ。

**修正対象:** `apps/web/src/views/AdminView.tsx`

```tsx
// 承認件数をバッジ表示
<span className="badge">
  {item.approvedCount ?? 0}/{item.requiredApprovals ?? 1} 承認済み
</span>
```

API 型定義 (`apps/web/src/api.ts` の EucListItem) にも追加：

```ts
export type EucListItem = {
  jobId: string;
  status: string;
  requiredApprovals: number;
  approvedCount: number;
  // ...
};
```

#### M-3. `c_openapi.yaml` のレスポンス schema 更新

EUC query / approve の response schema に以下フィールドが未追加：

- `requiredApprovals` (integer)
- `approvedCount` (integer)

OpenAPI diff CI がレスポンス body を検証する場合、drift が発生する可能性あり。
`c_openapi.yaml` の該当 schema (`EucJobStatus` 等) に追加すること。

---

### 🟢 Low（後回し可）

#### L-1. `params` への承認スナップショット埋め込みは重複

```java
jdbc.update("update report_request set ... params = jsonb_set(params, '{approval}', ...) ...");
```

`report_approval` テーブルに同じデータが入るため二重管理になる。
将来的には `params` 側の承認埋め込みを廃止し `report_approval` に一本化推奨。
今ラウンドは対応不要。

#### L-2. `EucIT.downloadDoneRequest` で新フィールドを未検証

`requiredApprovals` / `approvedCount` が DONE ジョブの ZIP DL レスポンスに含まれるか
確認する assertion を追加するとテストカバレッジが向上する。

---

## 2. このラウンドで Codex にお願いしたいこと（優先順）

| 優先 | タスク |
|---|---|
| 🔴 1 | `download()` に `@PreAuthorize("hasRole('ADMIN')")` + 申請者/承認者チェック追加 |
| 🔴 2 | `approve()` に `@Transactional` + `FOR UPDATE` 追加 |
| 🟡 3 | Node API に EUC approve スタブ + `requiredApprovals`/`approvedCount` レスポンス追加 |
| 🟡 4 | `AdminView.tsx` に `X/Y 承認済み` バッジ追加 + `EucListItem` 型更新 |
| 🟡 5 | `c_openapi.yaml` の EUC レスポンス schema に新フィールド追加 |
| 🟢 6 | `EucIT` に `@PreAuthorize` + 承認件数検証 assertion 追加 |

---

## 3. テスト現状

| 種別 | 件数 |
|---|---|
| Spring MockMvc + Unit | 89 件 PASS |
| Spring Testcontainers IT | 20 件（Docker なし環境は SKIP） |
| Vitest | 51 件 PASS |
| Playwright Node API | 13 件 PASS |
| Playwright a11y | 7 画面 PASS |
| CI 全ジョブ | ✅ 全 5 ジョブ GREEN |

C-1 修正後は `EucControllerTest` に以下テストを追加：
- `download_withWindowRole_returns403`
- `download_withAdminButNotRequesterOrApprover_returns403`（任意）

C-2 修正後は既存 IT がそのまま通ることを確認。

---

## 4. 直近の主要コミット（Codex round 39）

```
b6aba8d 引き継ぎファイルを移動（handoff/ディレクトリ整理）
bbf3592 fix(euc): required_approvals をSELECTに追加し二段階承認が正しく機能するよう修正
481108b docs: 売れるための README 改善 (SECURITY.md / CHANGELOG.md)
51b2cc3 docs: add Codex handoff 39
c1eaae5 feat: require two approvals for mynumber euc
```

---

## 5. ローカル動作確認済み（2026-05-25）

- Vitest 51/51 PASS ✅
- Node API smoke: `/me` / `/residents/search` / `/euc/query` すべて正常応答 ✅
- G:ドライブ同期: `G:\マイドライブ\claudecode\juki-web-reference` 最新状態 ✅
- Maven / Spring テスト: ローカル環境に `mvnw` なし・Maven 未インストール → CI で確認
