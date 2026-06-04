import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificateView } from "./CertificateView";
import type { CertificateIssue, Resident } from "../types";

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

const issue: CertificateIssue = {
  issueId: "10",
  residentId: "R-001",
  formId: "0010001",
  copies: 2,
  fee: 600,
  verifyToken: "VTESTTOKEN",
  pdfUrl: "/api/v1/certificates/10/pdf",
  issuedAt: "2026-05-17T00:00:00+09:00",
  channel: "WINDOW",
};

describe("CertificateView", () => {
  it("住民が未選択ならガイドメッセージを表示", () => {
    render(<CertificateView resident={null} onIssue={vi.fn()} />);
    expect(screen.getByText(/証明発行対象を選択してください/)).toBeInTheDocument();
  });

  it("発行フォーム送信で CertificateReq を渡し、発行結果リンクを表示", async () => {
    const onIssue = vi.fn().mockResolvedValue(issue);
    render(<CertificateView resident={resident} onIssue={onIssue} />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("部数"));
    await user.type(screen.getByLabelText("部数"), "2");
    await user.clear(screen.getByLabelText("使用目的"));
    await user.type(screen.getByLabelText("使用目的"), "単体テスト");
    await user.click(screen.getByLabelText("住民票コードを表示"));
    await user.click(screen.getByRole("button", { name: "発行" }));

    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({
      residentId: "R-001",
      formId: "0010001",
      scope: "SELF",
      copies: 2,
      usageText: "単体テスト",
      showJuminCode: true,
      showMyNumber: false,
    }));
    expect(await screen.findByText(/発行済/)).toBeInTheDocument();
    expect(screen.getByText("PDF を表示")).toHaveAttribute("href", "/api/v1/certificates/10/pdf");
    expect(screen.getByText(/改ざん防止コード検証/)).toHaveAttribute("href", "/api/v1/verify/VTESTTOKEN");
  });

  it("様式・範囲・個人番号表示フラグを CertificateReq に反映する", async () => {
    const onIssue = vi.fn().mockResolvedValue({
      ...issue,
      formId: "0010003",
      copies: 1,
      fee: 300,
    });
    render(<CertificateView resident={resident} onIssue={onIssue} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("様式"), "0010003");
    await user.selectOptions(screen.getByLabelText("範囲"), "HOUSEHOLD");
    await user.click(screen.getByLabelText("個人番号を表示（要権限）"));
    await user.click(screen.getByRole("button", { name: "発行" }));

    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({
      residentId: "R-001",
      formId: "0010003",
      scope: "HOUSEHOLD",
      copies: 1,
      usageText: "窓口請求",
      showJuminCode: false,
      showMyNumber: true,
    }));
    expect(await screen.findByText(/発行済/)).toBeInTheDocument();
  });

  it("印刷プレビューで window.print を呼ぶ", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<CertificateView resident={resident} onIssue={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "印刷プレビュー" }));

    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("連件交付パネルで複数宛名番号を渡して onBulkIssue が呼ばれる", async () => {
    const onBulkIssue = vi.fn().mockResolvedValue(undefined);
    render(<CertificateView resident={resident} onIssue={vi.fn()} onBulkIssue={onBulkIssue} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("宛名番号一覧"), "R-001, R-002, R-003");
    await user.click(screen.getByRole("button", { name: "連件交付" }));
    expect(onBulkIssue).toHaveBeenCalledWith(["R-001", "R-002", "R-003"], "0010001");
  });

});
