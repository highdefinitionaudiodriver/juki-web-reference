import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchView } from "./BatchView";
import type { BatchJob, BatchType } from "../types";

const types: BatchType[] = [
  { type: "RECONCILE", name: "本人確認情報 整合性確認 (BAT-RC)", description: "CS側本人確認情報と住民記録の突合" },
  { type: "ANNUAL_AGGREGATE", name: "住基年報 集計 (BAT-AR)", description: "住民基本台帳関係年報の集計" },
];
const history: BatchJob[] = [
  { jobId: "BATCH-1", type: "RECONCILE", name: "本人確認情報 整合性確認 (BAT-RC)", status: "DONE", startedAt: "2026-06-03T10:00:00.000Z", finishedAt: "2026-06-03T10:00:01.000Z", processed: 30, details: {} },
];

describe("BatchView (バッチ管理)", () => {
  it("バッチ定義と履歴を表示する", async () => {
    render(<BatchView load={vi.fn().mockResolvedValue({ types, history })} onRun={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("CS側本人確認情報と住民記録の突合")).toBeInTheDocument());
    expect(screen.getByText(/住基年報 集計/)).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("実行ボタンで onRun(type) が呼ばれる", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<BatchView load={vi.fn().mockResolvedValue({ types, history: [] })} onRun={onRun} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "実行" })).toHaveLength(2));
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "実行" })[0]!);
    expect(onRun).toHaveBeenCalledWith("RECONCILE");
  });
});
