import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvenienceView } from "./ConvenienceView";
import type { ConveniRequest, ConveniStatus, Resident } from "../types";

const resident: Resident = {
  residentId: "R-001",
  householdId: "H-001",
  familyNameKanji: "鈴木",
  givenNameKanji: "花子",
  familyNameKana: "スズキ",
  givenNameKana: "ハナコ",
  birthDate: "1990-01-01",
  sex: "F",
  addressCode: "132010001001",
  addressText: "東京都サンプル市1-1",
  relationToHead: "本人",
  movedInDate: "2020-04-01",
  movedOutDate: null,
  juminCode: "**** **** ***",
  myNumber: "**** **** ****",
  nationality: null,
  alias: [],
  restrictions: [],
  validFrom: "2020-04-01T00:00:00+09:00",
  validTo: null,
};

const status: ConveniStatus = {
  partner: "J-LIS / 自治体中間サーバ",
  linkState: "CONNECTED",
  serviceHours: "6:30-23:00",
  checkedAt: "2026-06-03T10:00:00.000Z",
  totals: { total: 2, issued: 1, refused: 1, pending: 0 },
};

const history: ConveniRequest[] = [
  { conveniId: "CV-1", residentId: "R-001", formId: "0010001", storeCode: "STORE-1", requestedAt: "2026-06-03T10:00:00.000Z", status: "ISSUED", issueId: "CI-1", reason: null },
  { conveniId: "CV-2", residentId: "R-009", formId: "0010001", storeCode: "STORE-2", requestedAt: "2026-06-03T10:01:00.000Z", status: "REFUSED", issueId: null, reason: "支援措置・抑止対象のため" },
];

describe("ConvenienceView (SCR-507 コンビニ交付)", () => {
  it("J-LIS 連携状態と履歴を表示する", async () => {
    render(
      <ConvenienceView
        resident={resident}
        loadStatus={vi.fn().mockResolvedValue(status)}
        loadHistory={vi.fn().mockResolvedValue(history)}
        onRequest={vi.fn()}
      />,
    );
    expect(await screen.findByText("CONNECTED")).toBeInTheDocument();
    expect(screen.getByText("CV-1")).toBeInTheDocument();
    expect(screen.getByText("利用停止")).toBeInTheDocument();
  });

  it("交付要求フォーム送信で onRequest(residentId, storeCode) が呼ばれる", async () => {
    const onRequest = vi.fn().mockResolvedValue(undefined);
    render(
      <ConvenienceView
        resident={resident}
        loadStatus={vi.fn().mockResolvedValue(status)}
        loadHistory={vi.fn().mockResolvedValue([])}
        onRequest={onRequest}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /コンビニ交付要求を受領/ }));
    expect(onRequest).toHaveBeenCalledWith("R-001", "STORE-0001");
  });
});
