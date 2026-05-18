import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsView } from "./ReportsView";

describe("ReportsView", () => {
  it("住基年報フォーム送信で onAnnualReport に年度とテンプレートを渡す", async () => {
    const onAnnualReport = vi.fn().mockResolvedValue(undefined);
    render(<ReportsView onAnnualReport={onAnnualReport} onEucQuery={vi.fn()} />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("テンプレートID"));
    await user.type(screen.getByLabelText("テンプレートID"), "annual-test");
    await user.clear(screen.getByLabelText("年度"));
    await user.type(screen.getByLabelText("年度"), "2027");
    await user.click(screen.getByRole("button", { name: "集計" }));

    expect(onAnnualReport).toHaveBeenCalledWith({
      templateId: "annual-test",
      fiscalYear: 2027,
      format: "XLSX",
    });
  });

  it("EUC 抽出フォーム送信で出力項目と個人番号フラグを渡す", async () => {
    const onEucQuery = vi.fn().mockResolvedValue(undefined);
    render(<ReportsView onAnnualReport={vi.fn()} onEucQuery={onEucQuery} />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("出力項目（カンマ区切り）"));
    await user.type(screen.getByLabelText("出力項目（カンマ区切り）"), "residentId, myNumber");
    await user.click(screen.getByLabelText("個人番号を含む（二段階承認）"));
    await user.click(screen.getByRole("button", { name: "抽出依頼" }));

    expect(onEucQuery).toHaveBeenCalledWith({
      outputFields: ["residentId", "myNumber"],
      includeMyNumber: true,
      format: "CSV",
    });
  });

  it("onEucApprove が無い場合は EUC 承認 UI が表示されない", () => {
    render(<ReportsView onAnnualReport={vi.fn()} onEucQuery={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "EUC 二段階承認" })).not.toBeInTheDocument();
  });

  it("EUC 承認 UI: APPROVE ボタンで onEucApprove(jobId, APPROVE, comment)", async () => {
    const onEucApprove = vi
      .fn()
      .mockResolvedValue({ jobId: "EUC-42", status: "DONE", resultUrl: "/api/v1/euc/EUC-42/result.zip" });
    render(
      <ReportsView
        onAnnualReport={vi.fn()}
        onEucQuery={vi.fn()}
        onEucApprove={onEucApprove}
      />
    );
    const user = userEvent.setup();

    expect(screen.getByRole("heading", { name: "EUC 二段階承認" })).toBeInTheDocument();
    // jobId が空のときは承認ボタンは disabled
    expect(screen.getByRole("button", { name: /承認/ })).toBeDisabled();
    await user.type(screen.getByLabelText("EUC job ID"), "EUC-42");
    await user.type(screen.getByLabelText("コメント (任意)"), "OK");
    await user.click(screen.getByRole("button", { name: /承認/ }));

    expect(onEucApprove).toHaveBeenCalledWith("EUC-42", "APPROVE", "OK");
    // 結果が表示される
    expect(await screen.findByText(/APPROVE -> DONE/)).toBeInTheDocument();
  });

  it("onEucListQueued が QUEUED 一覧を返すと jobId ボタンが表示される", async () => {
    const onEucListQueued = vi.fn().mockResolvedValue([
      {
        jobId: "EUC-7",
        status: "QUEUED",
        requesterUserId: "u-test",
        outputFields: ["residentId", "myNumber"],
        includeMyNumber: true,
      },
    ]);
    render(
      <ReportsView
        onAnnualReport={vi.fn()}
        onEucQuery={vi.fn()}
        onEucApprove={vi.fn()}
        onEucListQueued={onEucListQueued}
      />
    );
    // useEffect 経由で一覧取得される
    expect(await screen.findByRole("button", { name: /EUC-7 を承認フォームに設定/ })).toBeInTheDocument();
    expect(onEucListQueued).toHaveBeenCalled();
  });

  it("QUEUED 一覧の項目クリックで approveJobId 入力欄に値が入る", async () => {
    const onEucListQueued = vi.fn().mockResolvedValue([
      { jobId: "EUC-99", status: "QUEUED", outputFields: ["residentId"], includeMyNumber: false },
    ]);
    render(
      <ReportsView
        onAnnualReport={vi.fn()}
        onEucQuery={vi.fn()}
        onEucApprove={vi.fn()}
        onEucListQueued={onEucListQueued}
      />
    );
    const user = userEvent.setup();
    await screen.findByRole("button", { name: /EUC-99 を承認フォームに設定/ });
    await user.click(screen.getByRole("button", { name: /EUC-99 を承認フォームに設定/ }));
    expect((screen.getByLabelText("EUC job ID") as HTMLInputElement).value).toBe("EUC-99");
  });

  it("EUC 承認 UI: REJECT ボタンで onEucApprove(jobId, REJECT)", async () => {
    const onEucApprove = vi
      .fn()
      .mockResolvedValue({ jobId: "EUC-99", status: "FAILED", error: "Rejected by approver" });
    render(
      <ReportsView
        onAnnualReport={vi.fn()}
        onEucQuery={vi.fn()}
        onEucApprove={onEucApprove}
      />
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("EUC job ID"), "EUC-99");
    await user.click(screen.getByRole("button", { name: /却下/ }));

    expect(onEucApprove).toHaveBeenCalledWith("EUC-99", "REJECT", undefined);
    expect(await screen.findByText(/REJECT -> FAILED/)).toBeInTheDocument();
  });
});
