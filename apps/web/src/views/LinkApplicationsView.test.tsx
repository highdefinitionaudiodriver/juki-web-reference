import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkApplicationsView } from "./LinkApplicationsView";
import type { LinkApplication } from "../types";

const apps: LinkApplication[] = [
  {
    id: "LINK-1", source: "citizen-portal", externalId: "RX-1", receiptNumber: "R-1",
    procedureType: "moveout", applicant: { residentId: "100", name: "山田 花子" },
    status: "RECEIVED", receivedAt: "2026-06-08T01:00:00.000Z", updatedAt: "2026-06-08T01:00:00.000Z",
  },
];

describe("LinkApplicationsView (オンライン申請 受付簿)", () => {
  it("受信したオンライン申請を一覧表示する", async () => {
    render(<LinkApplicationsView load={vi.fn().mockResolvedValue(apps)} onAdvance={vi.fn()} onExport={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("山田 花子")).toBeInTheDocument());
    expect(screen.getByText("moveout")).toBeInTheDocument();
    expect(screen.getByText("citizen-portal")).toBeInTheDocument();
    expect(screen.getByText("受付")).toBeInTheDocument();
  });

  it("「処理中」へボタンで onAdvance が呼ばれる", async () => {
    const onAdvance = vi.fn().mockResolvedValue(undefined);
    render(<LinkApplicationsView load={vi.fn().mockResolvedValue(apps)} onAdvance={onAdvance} onExport={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "「処理中」へ" })).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "「処理中」へ" }));
    expect(onAdvance).toHaveBeenCalledWith("LINK-1", "PROCESSING");
  });

  it("CSV出力ボタンで onExport が呼ばれる", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<LinkApplicationsView load={vi.fn().mockResolvedValue([])} onAdvance={vi.fn()} onExport={onExport} />);
    await waitFor(() => expect(screen.getByText("受信した申請はありません。")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    expect(onExport).toHaveBeenCalled();
  });
});
