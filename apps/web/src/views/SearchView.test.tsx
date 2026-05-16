import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchView } from "./SearchView";
import type { Resident, SearchCriteria } from "../types";

const criteria: SearchCriteria = {
  name: "",
  address: "",
  foreignerOnly: false,
  includeRemoved: false,
};

const residents: Resident[] = [
  {
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
  },
];

describe("SearchView", () => {
  it("検索ボタンクリックで onSearch を呼ぶ", async () => {
    const onSearch = vi.fn();
    render(
      <SearchView
        criteria={criteria}
        residents={residents}
        onChange={vi.fn()}
        onSearch={onSearch}
        onSelect={vi.fn()}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "検索" }));
    expect(onSearch).toHaveBeenCalled();
  });

  it("行クリックで onSelect(residentId) を呼ぶ", async () => {
    const onSelect = vi.fn();
    render(
      <SearchView
        criteria={criteria}
        residents={residents}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        onSelect={onSelect}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("山田 太郎"));
    expect(onSelect).toHaveBeenCalledWith("R-001");
  });

  it("住民の住所と現住状態が表示される", () => {
    render(
      <SearchView
        criteria={criteria}
        residents={residents}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("東京都サンプル市1-1")).toBeInTheDocument();
    expect(screen.getByText("現住")).toBeInTheDocument();
  });
});
