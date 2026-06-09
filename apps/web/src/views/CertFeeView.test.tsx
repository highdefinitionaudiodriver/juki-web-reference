import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertFeeView } from "./CertFeeView";
import type { CertFeeResult } from "../types";

const result: CertFeeResult = {
  certType: "住民票の写し",
  unitFee: 300,
  copies: 2,
  subtotal: 600,
  postalFee: 140,
  total: 740,
};

describe("CertFeeView (証明手数料の算定 / クイック算定)", () => {
  it("算定実行で合計手数料を即時表示する", async () => {
    const onCalc = vi.fn().mockResolvedValue(result);
    render(<CertFeeView onCalc={onCalc} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /手数料を算定/ }));
    expect(onCalc).toHaveBeenCalledWith({ certType: "住民票の写し", copies: 1, postal: false });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("手数料合計");
    expect(status).toHaveTextContent("740 円");
  });

  it("郵送チェックと通数を反映して算定リクエストを送る", async () => {
    const onCalc = vi.fn().mockResolvedValue(result);
    render(<CertFeeView onCalc={onCalc} />);
    const user = userEvent.setup();
    const copies = screen.getByLabelText("通数");
    await user.clear(copies);
    await user.type(copies, "2");
    await user.click(screen.getByLabelText(/郵送/));
    await user.click(screen.getByRole("button", { name: /手数料を算定/ }));
    expect(onCalc).toHaveBeenCalledWith({ certType: "住民票の写し", copies: 2, postal: true });
  });
});
