import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AliasView } from "./AliasView";
import type { AliasRecord, Resident } from "../types";

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

const items: AliasRecord[] = [
  { aliasId: "AL-1", kind: "ALIAS", valueKanji: "すずきはなこ", valueKana: "スズキハナコ", validFrom: "2026-06-03", validTo: null },
  { aliasId: "AL-2", kind: "FORMER_FAMILY", valueKanji: "佐藤", validFrom: "2020-01-01", validTo: "2026-01-01" },
];

describe("AliasView (SCR-103 通称・旧氏管理)", () => {
  it("住民未選択ならガイドを表示", () => {
    render(<AliasView resident={null} loadAlias={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText(/対象住民を選択してください/)).toBeInTheDocument();
  });

  it("履歴を表示し、有効分のみ廃止ボタンを出す", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <AliasView resident={resident} loadAlias={vi.fn().mockResolvedValue(items)} onAdd={vi.fn()} onRemove={onRemove} />,
    );
    await waitFor(() => expect(screen.getByText("すずきはなこ")).toBeInTheDocument());
    // 旧氏(廃止済)の値も表示
    expect(screen.getByText("佐藤")).toBeInTheDocument();
    // 有効1件のみ廃止ボタン（AL-2 は廃止済）
    const buttons = screen.getAllByRole("button", { name: "廃止" });
    expect(buttons).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(buttons[0]!);
    expect(onRemove).toHaveBeenCalledWith("R-001", "AL-1");
  });

  it("登録フォーム送信で onAdd が呼ばれる", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AliasView resident={resident} loadAlias={vi.fn().mockResolvedValue([])} onAdd={onAdd} onRemove={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("氏名（漢字）"), "山田はなこ");
    await user.click(screen.getByRole("button", { name: "登録" }));
    expect(onAdd).toHaveBeenCalledWith("R-001", { kind: "ALIAS", valueKanji: "山田はなこ", valueKana: "" });
  });
});
