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
        onExport={vi.fn()}
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
        onExport={vi.fn()}
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
        onExport={vi.fn()}
      />
    );
    expect(screen.getByText("東京都サンプル市1-1")).toBeInTheDocument();
    expect(screen.getByText("現住")).toBeInTheDocument();
  });

  it("氏名ヘッダのクリックで結果を昇順/降順に並び替える", async () => {
    const three: Resident[] = [
      { ...residents[0], residentId: "R-003", familyNameKanji: "佐藤", familyNameKana: "サトウ", givenNameKana: "イチ" },
      { ...residents[0], residentId: "R-001", familyNameKanji: "鈴木", familyNameKana: "スズキ", givenNameKana: "ニ" },
      { ...residents[0], residentId: "R-002", familyNameKanji: "田中", familyNameKana: "タナカ", givenNameKana: "サン" },
    ];
    render(
      <SearchView criteria={criteria} residents={three} onChange={vi.fn()} onSearch={vi.fn()} onSelect={vi.fn()} onExport={vi.fn()} />,
    );
    const user = userEvent.setup();
    const order = () => Array.from(document.querySelectorAll("tbody tr td:first-child")).map((td) => td.textContent);
    await user.click(screen.getByRole("columnheader", { name: /氏名/ }));
    expect(order()).toEqual(["R-003", "R-001", "R-002"]); // サトウ<スズキ<タナカ 昇順
    expect(screen.getByRole("columnheader", { name: /氏名/ })).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByRole("columnheader", { name: /氏名/ }));
    expect(order()).toEqual(["R-002", "R-001", "R-003"]); // 降順
    expect(screen.getByRole("columnheader", { name: /氏名/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("CSV出力ボタンで onExport が呼ばれる", async () => {
    const onExport = vi.fn();
    render(
      <SearchView
        criteria={criteria}
        residents={[]}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onExport={onExport}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

});
