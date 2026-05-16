import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestrictionView } from "./RestrictionView";
import type { Resident } from "../types";

const baseResident: Resident = {
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

describe("RestrictionView", () => {
  it("住民が未選択ならガイドメッセージを表示", () => {
    render(<RestrictionView resident={null} onCreate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/抑止対象を住民検索から選択してください/)).toBeInTheDocument();
  });

  it("対象住民の氏名と宛名番号を表示し、抑止 0 件のときは空メッセージ", () => {
    render(<RestrictionView resident={baseResident} onCreate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/鈴木/)).toBeInTheDocument();
    expect(screen.getByText(/花子/)).toBeInTheDocument();
    expect(screen.getByText(/R-001/)).toBeInTheDocument();
    expect(screen.getByText(/現在、抑止は登録されていません/)).toBeInTheDocument();
  });

  it("フォーム送信で onCreate が呼ばれる（既定値 DV / SELF / 当日）", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<RestrictionView resident={baseResident} onCreate={onCreate} onDelete={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /抑止を登録/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const firstCall = onCreate.mock.calls[0]!;
    const arg = firstCall[0] as { residentId: string; category: string; scope: string };
    expect(arg.residentId).toBe("R-001");
    expect(arg.category).toBe("DV");
    expect(arg.scope).toBe("SELF");
  });

  it("既存抑止がある場合、解除ボタンで onDelete(id) が呼ばれる", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const restricted: Resident = {
      ...baseResident,
      restrictions: [
        { id: "RST-1", residentId: "R-001", category: "DV", startDate: "2025-04-01", scope: "SELF", releaseRole: "RESTRICTION_RELEASE", note: "" },
      ],
    };
    render(<RestrictionView resident={restricted} onCreate={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByText("RST-1")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "解除" }));
    expect(onDelete).toHaveBeenCalledWith("RST-1");
  });
});
