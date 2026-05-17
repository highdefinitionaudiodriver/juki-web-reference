import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoveView } from "./MoveView";
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

const history: Transaction[] = [
  {
    transactionId: "TX-001",
    residentId: "R-001",
    householdId: "H-001",
    typeCode: "OUT",
    reasonCode: "MOVE_OUT",
    eventDate: "2026-05-17",
    processedDate: "2026-05-17",
    receiverOffice: "住民課",
    status: "APPLIED",
    parentTransactionId: null,
    items: [],
  },
];

describe("MoveView", () => {
  it("転入フォーム送信で onMoveIn に入力内容を渡す", async () => {
    const onMoveIn = vi.fn().mockResolvedValue(undefined);
    render(<MoveView selected={null} history={[]} onMoveIn={onMoveIn} onMoveOut={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("氏"), "佐藤");
    await user.type(screen.getByLabelText("名"), "一郎");
    await user.selectOptions(screen.getByLabelText("性別"), "M");
    await user.click(screen.getByRole("button", { name: "転入を反映" }));

    expect(onMoveIn).toHaveBeenCalledWith(expect.objectContaining({
      members: [expect.objectContaining({
        familyNameKanji: "佐藤",
        givenNameKanji: "一郎",
        sex: "M",
        relationToHead: "本人",
      })],
    }));
  });

  it("選択住民がいれば転出でき、履歴があれば取消ボタンを表示", async () => {
    const onMoveOut = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(<MoveView selected={resident} history={history} onMoveIn={vi.fn()} onMoveOut={onMoveOut} onCancel={onCancel} />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("転出先"));
    await user.type(screen.getByLabelText("転出先"), "東京都外サンプル市9-9");
    await user.click(screen.getByRole("button", { name: "選択住民を転出" }));
    expect(onMoveOut).toHaveBeenCalledWith(expect.objectContaining({
      newAddress: "東京都外サンプル市9-9",
      members: ["R-001"],
    }));

    await user.click(screen.getByRole("button", { name: /最新異動を取消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("選択住民がない場合は転出側にガイドメッセージを表示", () => {
    render(<MoveView selected={null} history={[]} onMoveIn={vi.fn()} onMoveOut={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/対象住民を選択してください/)).toBeInTheDocument();
  });
});
