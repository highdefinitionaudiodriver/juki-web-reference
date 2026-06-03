import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EucDesignView } from "./EucDesignView";
import type { EucTemplate } from "../types";

const templates: EucTemplate[] = [
  { id: "EUCT-1", name: "住所一覧", domain: "RESIDENT", outputFields: ["residentId", "addressText"], includeMyNumber: false, requiresSecondApproval: false },
  { id: "EUCT-2", name: "番号付き", domain: "RESIDENT", outputFields: ["residentId", "myNumber"], includeMyNumber: true, requiresSecondApproval: true },
];

describe("EucDesignView (SCR-A01 EUC設計)", () => {
  it("登録済みテンプレートと承認区分を表示する", async () => {
    render(<EucDesignView loadTemplates={vi.fn().mockResolvedValue(templates)} onCreate={vi.fn()} onDelete={vi.fn()} onRun={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("住所一覧")).toBeInTheDocument());
    expect(screen.getByText("二人承認")).toBeInTheDocument();
    expect(screen.getByText("単独")).toBeInTheDocument();
  });

  it("実行ボタンで onRun(id) が呼ばれる", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<EucDesignView loadTemplates={vi.fn().mockResolvedValue(templates)} onCreate={vi.fn()} onDelete={vi.fn()} onRun={onRun} />);
    await waitFor(() => expect(screen.getByText("住所一覧")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "実行" })[0]!);
    expect(onRun).toHaveBeenCalledWith("EUCT-1");
  });

  it("個人番号を選ぶと二人承認の注意を表示する", async () => {
    render(<EucDesignView loadTemplates={vi.fn().mockResolvedValue([])} onCreate={vi.fn()} onDelete={vi.fn()} onRun={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("個人番号"));
    expect(screen.getByText(/二人承認が必要/)).toBeInTheDocument();
  });

  it("保存で onCreate が呼ばれる", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<EucDesignView loadTemplates={vi.fn().mockResolvedValue([])} onCreate={onCreate} onDelete={vi.fn()} onRun={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("テンプレート名"), "テスト抽出");
    await user.click(screen.getByRole("button", { name: "テンプレートを保存" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "テスト抽出", outputFields: ["residentId"] }));
  });
});
