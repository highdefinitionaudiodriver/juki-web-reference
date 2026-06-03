import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertSettingsView } from "./AlertSettingsView";
import type { AlertItem, AlertRules } from "../types";

const rules: AlertRules = {
  nightAccessEnabled: true,
  nightStartHour: 22,
  nightEndHour: 6,
  bulkSearchEnabled: true,
  bulkSearchThreshold: 50,
};

const alerts: AlertItem[] = [
  { type: "BULK_SEARCH", severity: "WARN", userId: "clerk-1", message: "大量検索の疑い: clerk-1 が 120 件", count: 120 },
];

describe("AlertSettingsView (SCR-A04 エラー・アラート設定)", () => {
  it("ルールと検知アラートを表示する", async () => {
    render(
      <AlertSettingsView
        loadRules={vi.fn().mockResolvedValue(rules)}
        loadAlerts={vi.fn().mockResolvedValue({ total: 1, alerts })}
        onSave={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("大量検索の閾値(件)")).toHaveValue(50));
    expect(screen.getByText("大量検索")).toBeInTheDocument();
    expect(screen.getByText(/clerk-1 が 120 件/)).toBeInTheDocument();
  });

  it("設定保存で onSave が呼ばれる", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AlertSettingsView
        loadRules={vi.fn().mockResolvedValue(rules)}
        loadAlerts={vi.fn().mockResolvedValue({ total: 0, alerts: [] })}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "設定を保存" })).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "設定を保存" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ bulkSearchThreshold: 50 }));
  });
});
