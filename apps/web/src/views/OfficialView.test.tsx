import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficialView } from "./OfficialView";
import type { Resident, Transaction } from "../types";

const resident: Resident = {
  residentId: "R-001",
  householdId: "H-001",
  familyNameKanji: "山田",
  givenNameKanji: "太郎",
  familyNameKana: "ヤマダ",
  givenNameKana: "タロウ",
  birthDate: "1985-04-01",
  sex: "M",
  addressCode: "132010001001",
  addressText: "東京都サンプル市1-1",
  relationToHead: "本人",
  movedInDate: "2018-06-01",
  movedOutDate: null,
  juminCode: "**** **** ***",
  myNumber: "**** **** ****",
  nationality: null,
  alias: [],
  restrictions: [],
  validFrom: "2018-06-01T00:00:00+09:00",
  validTo: null,
};

const draft: Transaction = {
  transactionId: "TX-001",
  residentId: "R-001",
  householdId: "H-001",
  typeCode: "OFFICIAL",
  reasonCode: "OFFICIAL_FIX",
  eventDate: "2026-05-17",
  processedDate: "2026-05-17",
  receiverOffice: "住民課",
  status: "DRAFT",
  parentTransactionId: null,
  items: [],
};

describe("OfficialView", () => {
  it("住民が未選択なら起票側にガイドメッセージを表示", () => {
    render(<OfficialView resident={null} latestOfficial={null} onCreate={vi.fn()} onApprove={vi.fn()} />);
    expect(screen.getByText(/対象住民を選択してください/)).toBeInTheDocument();
    expect(screen.getByText(/起票後に決裁できます/)).toBeInTheDocument();
  });

  it("起票フォーム送信で onCreate が呼ばれ、DRAFT が決裁欄に表示される", async () => {
    const onCreate = vi.fn().mockResolvedValue(draft);
    render(<OfficialView resident={resident} latestOfficial={null} onCreate={onCreate} onApprove={vi.fn()} />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("内容"));
    await user.type(screen.getByLabelText("内容"), "職権修正の内容");
    await user.click(screen.getByRole("button", { name: "起票" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      residentId: "R-001",
      reasonCode: "OFFICIAL_FIX",
      content: "職権修正の内容",
      approvalRoute: ["REVIEW", "ADMIN"],
    }));
    expect(await screen.findByText("TX-001")).toBeInTheDocument();
    expect(screen.getByText(/OFFICIAL_FIX \/ DRAFT/)).toBeInTheDocument();
  });

  it("承認ボタンで onApprove(txId, APPROVE) が呼ばれ、状態が更新される", async () => {
    const onApprove = vi.fn().mockResolvedValue({ transactionId: "TX-001", status: "APPLIED", step: 1 });
    render(<OfficialView resident={resident} latestOfficial={draft} onCreate={vi.fn()} onApprove={onApprove} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("コメント"), "承認します");
    await user.click(screen.getByRole("button", { name: "APPROVE" }));

    expect(onApprove).toHaveBeenCalledWith("TX-001", { action: "APPROVE", comment: "承認します" });
    expect(await screen.findByText(/OFFICIAL_FIX \/ APPLIED/)).toBeInTheDocument();
  });
});
