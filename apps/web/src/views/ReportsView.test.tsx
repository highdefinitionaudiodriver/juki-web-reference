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
});
