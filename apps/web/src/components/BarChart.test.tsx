import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";

describe("BarChart (ダッシュボード可視化)", () => {
  it("各行のラベルと値を表示し、最大値を100%として幅を按分する", () => {
    const { container } = render(
      <BarChart ariaLabel="テスト" rows={[
        { label: "現在住民", value: 100 },
        { label: "外国人住民", value: 25 },
        { label: "抑止対象", value: 0 },
      ]} />,
    );
    expect(screen.getByLabelText("テスト")).toBeInTheDocument();
    expect(screen.getByText("現在住民")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    const fills = container.querySelectorAll(".chart-fill");
    expect(fills).toHaveLength(3);
    expect((fills[0] as HTMLElement).style.width).toBe("100%"); // 100/100
    expect((fills[1] as HTMLElement).style.width).toBe("25%"); // 25/100
    expect((fills[2] as HTMLElement).style.width).toBe("0%"); // 0/100
  });

  it("全て0でも最大値1扱いで割り算エラーにならない", () => {
    const { container } = render(<BarChart rows={[{ label: "a", value: 0 }]} />);
    expect((container.querySelector(".chart-fill") as HTMLElement).style.width).toBe("0%");
  });
});
