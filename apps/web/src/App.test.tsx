import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// api / auth モジュールのモック。useEffect の初期ロードと
// 各ナビ切替後の挙動を制御するため、最小限のレスポンスを返す。
const apiMocks = vi.hoisted(() => ({
  me: vi.fn().mockResolvedValue({
    userId: "u-test",
    fullName: "テスト ユーザ",
    department: "住民課",
    roles: ["ADMIN", "RESTRICTION_RELEASE"],
  }),
  searchResidents: vi.fn().mockResolvedValue({
    total: 1,
    page: 1,
    size: 50,
    items: [
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
    ],
  }),
  resident: vi.fn().mockImplementation(async (id: string) => ({
    residentId: id,
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
  })),
  history: vi.fn().mockResolvedValue([]),
  audit: vi.fn().mockResolvedValue([]),
  moveIn: vi.fn().mockResolvedValue({ transactionId: "TX-IN" }),
  officialTransaction: vi.fn().mockResolvedValue({
    transactionId: "TX-OFFICIAL",
    residentId: "R-001",
    typeCode: "OFFICIAL",
    reasonCode: "OFFICIAL_FIX",
    status: "DRAFT",
  }),
}));

vi.mock("./api", () => ({
  api: apiMocks,
}));

vi.mock("./auth", () => ({
  completeOidcLoginFromRedirect: vi.fn().mockResolvedValue(undefined),
  startOidcLogin: vi.fn(),
  logout: vi.fn(),
  getToken: () => null,
  setToken: vi.fn(),
}));

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    apiMocks.me.mockClear();
    apiMocks.searchResidents.mockClear();
    apiMocks.resident.mockClear();
    apiMocks.history.mockClear();
    apiMocks.audit.mockClear();
    apiMocks.moveIn.mockClear();
    apiMocks.officialTransaction.mockClear();
  });

  it("起動時に me / searchResidents / resident / history を呼び、住民検索ビューを描画する", async () => {
    render(<App />);
    await waitFor(() => expect(apiMocks.me).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.searchResidents).toHaveBeenCalled());
    // h1 として "住民検索" がタイトル表示される
    expect(screen.getByRole("heading", { level: 1, name: "住民検索" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0)
    );
  });

  it("ナビボタンで各 view に切替できる", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    const user = userEvent.setup();

    // 異動ビュー（ナビは textContent="異動"）
    await user.click(screen.getByRole("button", { name: "異動" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "転入届" })).toBeInTheDocument());

    // 抑止設定
    await user.click(screen.getByRole("button", { name: "抑止設定" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /抑止登録/ })).toBeInTheDocument()
    );

    // 統計/EUC
    await user.click(screen.getByRole("button", { name: "統計/EUC" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "住基年報" })).toBeInTheDocument());

    // 権限/監査
    await user.click(screen.getByRole("button", { name: "権限/監査" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /ロール/ })).toBeInTheDocument());
  });

  it("検索フォームの入力で searchResidents を再実行する", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    apiMocks.searchResidents.mockClear();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("氏名"), "佐藤");
    await user.type(screen.getByLabelText("住所"), "中央町");
    await user.click(screen.getByLabelText("外国人のみ"));
    await user.click(screen.getByRole("button", { name: /^検索$/ }));

    await waitFor(() =>
      expect(apiMocks.searchResidents).toHaveBeenCalledWith({
        name: "佐藤",
        address: "中央町",
        foreignerOnly: true,
        includeRemoved: false,
      })
    );
  });

  it("権限/監査ビューの『監査ログ更新』で audit() が呼ばれる", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "権限/監査" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "監査ログ更新" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "監査ログ更新" }));
    expect(apiMocks.audit).toHaveBeenCalled();
  });

  it("転入反映後に notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "異動" }));
    await user.click(screen.getByRole("button", { name: "転入を反映" }));

    await waitFor(() => {
      expect(apiMocks.moveIn).toHaveBeenCalled();
      expect(screen.getByText(/転入を反映しました: TX-IN/)).toBeInTheDocument();
    });
  });

  it("職権異動の起票後に notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "職権異動" }));
    await user.click(screen.getByRole("button", { name: "起票" }));

    await waitFor(() => {
      expect(apiMocks.officialTransaction).toHaveBeenCalled();
      expect(screen.getByText(/職権異動を起票しました: TX-OFFICIAL/)).toBeInTheDocument();
    });
  });

  it("起動時に api.me が失敗するとエラー notice が表示される", async () => {
    apiMocks.me.mockRejectedValueOnce(new Error("network down"));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/network down/)).toBeInTheDocument();
    });
  });
});
