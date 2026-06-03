import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverviewView } from "./OverviewView";
import type { Overview } from "../types";

const overview: Overview = {
  residents: { total: 30, active: 28, foreigners: 5, specialPermanent: 2, restricted: 3 },
  transactions: { total: 12, pendingApproval: 1 },
  certificates: 7,
  conveniRequests: 4,
  notifyRegistrations: 2,
  notifications: 1,
  eucTemplates: 3,
  batchJobs: 6,
  alerts: 2,
};

describe("OverviewView (SCR-002 ダッシュボード)", () => {
  it("主要指標を表示する", async () => {
    render(<OverviewView load={vi.fn().mockResolvedValue(overview)} onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("住民（現在）")).toBeInTheDocument());
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("抑止対象")).toBeInTheDocument();
    expect(screen.getByText("検知アラート")).toBeInTheDocument();
  });

  it("カードクリックで onNavigate が呼ばれる", async () => {
    const onNavigate = vi.fn();
    render(<OverviewView load={vi.fn().mockResolvedValue(overview)} onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText("抑止対象")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByText("抑止対象"));
    expect(onNavigate).toHaveBeenCalledWith("restriction");
  });
});
