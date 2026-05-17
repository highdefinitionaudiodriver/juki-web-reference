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
  issueCertificate: vi.fn().mockResolvedValue({
    issueId: "CI-1",
    formId: "0010001",
    verifyToken: "VTOKEN",
    fee: 300,
  }),
  createRestriction: vi.fn().mockResolvedValue({ id: "RST-1" }),
  deleteRestriction: vi.fn().mockResolvedValue(null),
  annualReport: vi.fn().mockResolvedValue({
    jobId: "JOB-ANNUAL",
    status: "DONE",
    progress: 100,
    resultUrl: "/reports/annual.xlsx",
  }),
  eucQuery: vi.fn().mockResolvedValue({
    jobId: "JOB-EUC",
    status: "DONE",
    progress: 100,
    resultUrl: "/euc/result.csv",
    requiresSecondApproval: false,
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
    apiMocks.issueCertificate.mockClear();
    apiMocks.createRestriction.mockClear();
    apiMocks.deleteRestriction.mockClear();
    apiMocks.annualReport.mockClear();
    apiMocks.eucQuery.mockClear();
    // resident のモックを既定値（restrictions: []）に戻す
    apiMocks.resident.mockImplementation(async (id: string) => ({
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
    }));
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

  it("抑止登録が失敗するとエラー notice が表示される", async () => {
    apiMocks.createRestriction.mockRejectedValueOnce(new Error("forbidden"));
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "抑止設定" }));
    await user.click(screen.getByRole("button", { name: "抑止を登録" }));
    await waitFor(() => {
      expect(apiMocks.createRestriction).toHaveBeenCalled();
      expect(screen.getByText(/抑止登録に失敗しました/)).toBeInTheDocument();
    });
  });

  it("既存抑止がある住民で解除ボタン押下で deleteRestriction が呼ばれ notice 表示", async () => {
    const residentWithRestriction = {
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
      restrictions: [
        {
          id: "RST-99",
          residentId: "R-001",
          category: "DV",
          startDate: "2025-04-01",
          scope: "SELF",
          releaseRole: "RESTRICTION_RELEASE",
          note: "",
        },
      ],
      validFrom: "2018-06-01T00:00:00+09:00",
      validTo: null,
    };
    apiMocks.resident.mockResolvedValue(residentWithRestriction);

    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "抑止設定" }));
    // 抑止解除ボタンが見えるまで待つ
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "解除" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "解除" }));
    await waitFor(() => {
      expect(apiMocks.deleteRestriction).toHaveBeenCalledWith("RST-99");
      expect(screen.getByText(/抑止を解除しました: RST-99/)).toBeInTheDocument();
    });
  });

  it("EUC 個人番号含む依頼は二段階承認 notice を表示する", async () => {
    apiMocks.eucQuery.mockResolvedValueOnce({
      jobId: "JOB-EUC-PENDING",
      status: "QUEUED",
      progress: 10,
      resultUrl: null,
      requiresSecondApproval: true,
    });
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "統計/EUC" }));
    // 個人番号を含むチェックボックスを ON
    await user.click(screen.getByLabelText(/個人番号を含む/));
    await user.click(screen.getByRole("button", { name: "抽出依頼" }));
    await waitFor(() => {
      expect(screen.getByText(/EUC依頼を保留しました。二段階承認が必要です: JOB-EUC-PENDING/)).toBeInTheDocument();
    });
  });

  it("証明発行後に verifyToken と手数料の notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "証明発行" }));
    await user.click(screen.getByRole("button", { name: "発行" }));
    await waitFor(() => {
      expect(apiMocks.issueCertificate).toHaveBeenCalled();
      // notice メッセージで verifyToken と手数料を含む文言が含まれる
      expect(screen.getByText(/証明書を発行しました。検証トークン: VTOKEN \/ 手数料: 300円/)).toBeInTheDocument();
    });
  });

  it("抑止登録後に成功 notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "抑止設定" }));
    await user.click(screen.getByRole("button", { name: "抑止を登録" }));
    await waitFor(() => {
      expect(apiMocks.createRestriction).toHaveBeenCalled();
      expect(screen.getByText(/抑止を登録しました: R-001/)).toBeInTheDocument();
    });
  });

  it("住基年報の集計依頼後に notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "統計/EUC" }));
    await user.click(screen.getByRole("button", { name: "集計" }));
    await waitFor(() => {
      expect(apiMocks.annualReport).toHaveBeenCalled();
      expect(screen.getByText(/年報ジョブを受け付けました: JOB-ANNUAL/)).toBeInTheDocument();
    });
  });

  it("EUC 抽出依頼後に結果 URL の notice を表示する", async () => {
    render(<App />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText("山田 太郎").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "統計/EUC" }));
    await user.click(screen.getByRole("button", { name: "抽出依頼" }));
    await waitFor(() => {
      expect(apiMocks.eucQuery).toHaveBeenCalled();
      expect(screen.getByText(/EUC結果を作成しました/)).toBeInTheDocument();
    });
  });
});
