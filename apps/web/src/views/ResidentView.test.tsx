import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResidentView } from "./ResidentView";
import type { Resident, Transaction } from "../types";

const baseResident: Resident = {
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

const historyTx: Transaction[] = [
  {
    transactionId: "TX-001",
    residentId: "R-001",
    householdId: "H-001",
    typeCode: "MOVE",
    reasonCode: "ADDRESS_FIX",
    eventDate: "2026-04-01",
    processedDate: "2026-04-01",
    receiverOffice: "住民課",
    status: "APPLIED",
    parentTransactionId: null,
    items: [],
  },
];

describe("ResidentView", () => {
  it("住民未選択時はガイドメッセージを表示", () => {
    render(<ResidentView resident={null} history={[]} onUnmask={vi.fn()} onUpdateAddress={vi.fn()} />);
    expect(screen.getByText(/住民検索から対象者を選択してください/)).toBeInTheDocument();
  });

  it("基本情報と異動履歴を表示する", () => {
    render(<ResidentView resident={baseResident} history={historyTx} onUnmask={vi.fn()} onUpdateAddress={vi.fn()} />);
    // 宛名番号 / 氏名 / 住所 / 続柄
    expect(screen.getByText("R-001")).toBeInTheDocument();
    expect(screen.getByText(/山田 太郎 \/ ヤマダ タロウ/)).toBeInTheDocument();
    expect(screen.getByText("東京都サンプル市1-1")).toBeInTheDocument();
    // 履歴
    expect(screen.getByText(/MOVE APPLIED/)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-01 \/ ADDRESS_FIX/)).toBeInTheDocument();
  });

  it("『コード表示』ボタンで onUnmask が呼ばれる", async () => {
    const onUnmask = vi.fn();
    render(<ResidentView resident={baseResident} history={[]} onUnmask={onUnmask} onUpdateAddress={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "コード表示" }));
    expect(onUnmask).toHaveBeenCalledTimes(1);
  });

  it("単項目修正ボタン押下で onUpdateAddress が呼ばれる（既定値が異動日に渡る）", async () => {
    const onUpdateAddress = vi.fn().mockResolvedValue(undefined);
    render(<ResidentView resident={baseResident} history={[]} onUnmask={vi.fn()} onUpdateAddress={onUpdateAddress} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "単項目修正" }));

    expect(onUpdateAddress).toHaveBeenCalledTimes(1);
    const [addr, date] = onUpdateAddress.mock.calls[0]!;
    // 何も入力しない場合、表示中の addressText が引き継がれる
    expect(addr).toBe(baseResident.addressText);
    // 異動日は今日の ISO 日付（YYYY-MM-DD）
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("外国人在留情報が無い場合はガイド文を表示", () => {
    render(<ResidentView resident={baseResident} history={[]} onUnmask={vi.fn()} onUpdateAddress={vi.fn()} />);
    expect(screen.getByText("外国人在留情報なし")).toBeInTheDocument();
  });

  it("外国人在留情報がある場合は在留資格と期限を表示", () => {
    const foreign: Resident = {
      ...baseResident,
      foreigner: {
        residenceStatus: "技術・人文知識・国際業務",
        residencePeriodEnd: "2027-10-19",
        passportNo: "P12345678",
        nationalityFull: "中華人民共和国",
        aliasKanji: "王 明",
        specialPermanentResident: false,
      },
    };
    render(<ResidentView resident={foreign} history={[]} onUnmask={vi.fn()} onUpdateAddress={vi.fn()} />);
    expect(screen.getByText("技術・人文知識・国際業務")).toBeInTheDocument();
    expect(screen.getByText("2027-10-19")).toBeInTheDocument();
    expect(screen.getByText("中華人民共和国")).toBeInTheDocument();
  });
});
