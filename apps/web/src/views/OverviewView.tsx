import { useEffect, useState } from "react";
import type { Overview, ViewId } from "../types";

type Props = {
  load: () => Promise<Overview>;
  onNavigate: (view: ViewId) => void;
};

type Card = { label: string; value: number; view?: ViewId; warn?: boolean };

/**
 * SCR-002: ダッシュボード（メインメニュー）
 *
 *  - 住民・異動・証明・抑止・本人通知・アラート等の主要指標を集約表示する。
 *  - 各カードから対応する業務画面へ遷移できる。
 */
export function OverviewView({ load, onNavigate }: Props) {
  const [ov, setOv] = useState<Overview | null>(null);

  useEffect(() => {
    load().then(setOv).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ov) return <section className="panel">読み込み中…</section>;

  const cards: Card[] = [
    { label: "住民（現在）", value: ov.residents.active, view: "search" },
    { label: "外国人住民", value: ov.residents.foreigners, view: "special" },
    { label: "特別永住者", value: ov.residents.specialPermanent, view: "special" },
    { label: "抑止対象", value: ov.residents.restricted, view: "restriction", warn: ov.residents.restricted > 0 },
    { label: "審査待ち異動", value: ov.transactions.pendingApproval, view: "official", warn: ov.transactions.pendingApproval > 0 },
    { label: "証明書交付", value: ov.certificates, view: "certificate" },
    { label: "コンビニ交付", value: ov.conveniRequests, view: "conveni" },
    { label: "本人通知 登録", value: ov.notifyRegistrations, view: "notify" },
    { label: "本人通知 発出", value: ov.notifications, view: "notify" },
    { label: "EUCテンプレート", value: ov.eucTemplates, view: "eucdesign" },
    { label: "バッチ実行", value: ov.batchJobs, view: "batch" },
    { label: "検知アラート", value: ov.alerts, view: "alerts", warn: ov.alerts > 0 },
  ];

  return (
    <section className="panel">
      <h2>ダッシュボード</h2>
      <p className="muted" style={{ marginBottom: 16 }}>住民記録システムの主要指標です。カードをクリックすると該当業務へ移動します。</p>
      <div className="card-grid">
        {cards.map((c) => (
          <button
            key={c.label}
            className={`stat-card${c.warn ? " warn" : ""}`}
            onClick={() => c.view && onNavigate(c.view)}
            disabled={!c.view}
          >
            <span className="stat-value">{c.value.toLocaleString("ja-JP")}</span>
            <span className="stat-label">{c.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
