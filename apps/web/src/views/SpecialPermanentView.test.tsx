import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpecialPermanentView } from "./SpecialPermanentView";
import type { Resident, SpecialPermanentCert } from "../types";

const resident: Resident = {
  residentId: "R-001",
  householdId: "H-001",
  familyNameKanji: "金",
  givenNameKanji: "太郎",
  familyNameKana: "キン",
  givenNameKana: "タロウ",
  birthDate: "1990-01-01",
  sex: "M",
  addressCode: "132010001001",
  addressText: "東京都サンプル市1-1",
  relationToHead: "本人",
  movedInDate: "2020-04-01",
  movedOutDate: null,
  juminCode: "**** **** ***",
  myNumber: "**** **** ****",
  nationality: "韓国",
  alias: [],
  restrictions: [],
  validFrom: "2020-04-01T00:00:00+09:00",
  validTo: null,
};

const cert: SpecialPermanentCert = { certNumber: "SP-0001", issuedDate: "2026-06-01", expiryDate: "2033-06-01" };

describe("SpecialPermanentView (SCR-802 特別永住者管理)", () => {
  it("住民未選択ならガイドを表示", async () => {
    render(
      <SpecialPermanentView resident={null} loadCert={vi.fn()} loadExpiring={vi.fn().mockResolvedValue([])} onRegister={vi.fn()} />,
    );
    expect(await screen.findByText(/対象住民を選択してください/)).toBeInTheDocument();
  });

  it("既存証明書の満了日を表示し、登録ボタンで onRegister が呼ばれる", async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(
      <SpecialPermanentView
        resident={resident}
        loadCert={vi.fn().mockResolvedValue(cert)}
        loadExpiring={vi.fn().mockResolvedValue([])}
        onRegister={onRegister}
      />,
    );
    await waitFor(() => expect(screen.getByText("SP-0001")).toBeInTheDocument());
    expect(screen.getByText("2033-06-01")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("証明書番号"), "SP-9999");
    await user.click(screen.getByRole("button", { name: /更新（再交付）/ }));
    expect(onRegister).toHaveBeenCalledWith("R-001", expect.objectContaining({ certNumber: "SP-9999" }));
  });
});
