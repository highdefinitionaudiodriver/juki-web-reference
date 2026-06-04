import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminView } from "./AdminView";

describe("AdminView", () => {
  it("監査ログ更新ボタンで onRefresh が呼ばれる", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<AdminView audit={[]} onRefresh={onRefresh} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "監査ログ更新" }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("onEucListQueued / onEucApprove が未指定なら EUC 承認キューは表示されない", () => {
    render(<AdminView audit={[]} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /EUC 承認キュー/ })).not.toBeInTheDocument();
  });

  it("EUC 承認キュー: 一覧表示と承認 / 却下ボタンが動く", async () => {
    const onEucListQueued = vi.fn().mockResolvedValue([
      {
        jobId: "EUC-7",
        status: "QUEUED",
        requesterUserId: "u-test",
        outputFields: ["residentId", "myNumber"],
        includeMyNumber: true,
      },
    ]);
    const onEucApprove = vi
      .fn()
      .mockResolvedValue({ jobId: "EUC-7", status: "DONE", resultUrl: "/api/v1/euc/EUC-7/result.zip" });

    render(
      <AdminView
        audit={[]}
        onRefresh={vi.fn()}
        onEucListQueued={onEucListQueued}
        onEucApprove={onEucApprove}
      />
    );

    // 初回 useEffect で一覧取得 → 行が表示される
    expect(await screen.findByText("EUC-7")).toBeInTheDocument();
    expect(screen.getByText(/個人番号含む/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("コメント（任意・全操作共通）"), "管理者OK");
    await user.click(screen.getByRole("button", { name: "EUC-7 を承認" }));

    expect(onEucApprove).toHaveBeenCalledWith("EUC-7", "APPROVE", "管理者OK");
    expect(await screen.findByText(/EUC-7: APPROVE -> DONE/)).toBeInTheDocument();
  });

  it("EUC 承認キュー: 承認待ち 0 件のとき空メッセージを表示", async () => {
    render(
      <AdminView
        audit={[]}
        onRefresh={vi.fn()}
        onEucListQueued={vi.fn().mockResolvedValue([])}
        onEucApprove={vi.fn()}
      />
    );
    expect(await screen.findByText("承認待ちの EUC 依頼はありません。")).toBeInTheDocument();
  });

  it("onExportAudit 指定時に CSV出力ボタンを表示し呼び出す", async () => {
    const onExportAudit = vi.fn();
    render(<AdminView audit={[]} onRefresh={vi.fn()} onExportAudit={onExportAudit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    expect(onExportAudit).toHaveBeenCalledTimes(1);
  });


  it("onExportAll 指定時に 全データエクスポート ボタンを表示し呼び出す", async () => {
    const onExportAll = vi.fn();
    render(<AdminView audit={[]} onRefresh={vi.fn()} onExportAll={onExportAll} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "全データエクスポート" }));
    expect(onExportAll).toHaveBeenCalledTimes(1);
  });

});
