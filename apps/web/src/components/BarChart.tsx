/**
 * ダッシュボード用の軽量な横棒グラフ（外部ライブラリ非依存）。
 * React の style プロパティは CSSOM 経由で適用されるため、
 * 厳格な CSP（style-src に unsafe-inline なし）でも寸法が反映される。
 */
export type BarRow = { label: string; value: number };

export function BarChart({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="chart-bars" role="img" aria-label={ariaLabel}>
      {rows.map((r) => (
        <div key={r.label} className="chart-row">
          <span className="chart-label" title={r.label}>{r.label}</span>
          <div className="chart-track">
            <div className="chart-fill" style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
          </div>
          <span className="chart-value">{r.value.toLocaleString("ja-JP")}</span>
        </div>
      ))}
    </div>
  );
}
