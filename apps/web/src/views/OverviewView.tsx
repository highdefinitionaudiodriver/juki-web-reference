import { useEffect, useState } from "react";
import type { Announcement, Overview, ViewId } from "../types";
import { Field } from "../components/Field";
import { BarChart } from "../components/BarChart";

type Props = {
  load: () => Promise<Overview>;
  onNavigate: (view: ViewId) => void;
  /** お知らせ取得（指定があればダッシュボード上部に表示） */
  loadAnnouncements?: () => Promise<Announcement[]>;
  /** お知らせ登録（ADMIN向け。指定があれば登録フォームを表示） */
  onCreateAnnouncement?: (title: string, level: "info" | "warning" | "critical") => Promise<void>;
};

type Card = { label: string; value: number; view?: ViewId; warn?: boolean };

const LEVEL_CLASS: Record<string, string> = { info: "", warning: "warn", critical: "err" };

/**
 * SCR-002: ダッシュボード（メインメニュー）
 *
 *  - 住民・異動・証明・抑止・本人通知・アラート等の主要指標を集約表示する。
 *  - 各カードから対応する業務画面へ遷移できる。
 */
export function OverviewView({ load, onNavigate, loadAnnouncements, onCreateAnnouncement }: Props) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annLevel, setAnnLevel] = useState<"info" | "warning" | "critical">("info");

  const refreshAnn = async () => {
    if (loadAnnouncements) setAnnouncements(await loadAnnouncements());
  };

  useEffect(() => {
    load().then(setOv).catch(() => undefined);
    refreshAnn().catch(() => undefined);
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

      {loadAnnouncements && announcements.length > 0 && (
        <div className="stack" style={{ marginBottom: 16 }}>
          {announcements.map((a) => (
            <div key={a.id} className={`notice ${LEVEL_CLASS[a.level] ?? ""}`}>
              <strong>{a.title}</strong>{a.body ? ` — ${a.body}` : ""}
            </div>
          ))}
        </div>
      )}
      {onCreateAnnouncement && (
        <form
          className="inline-form"
          style={{ marginBottom: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!annTitle.trim()) return;
            await onCreateAnnouncement(annTitle, annLevel);
            setAnnTitle("");
            await refreshAnn();
          }}
        >
          <Field label="お知らせ" value={annTitle} onChange={setAnnTitle} />
          <label className="check">
            重要度
            <select aria-label="重要度" value={annLevel} onChange={(e) => setAnnLevel(e.target.value as "info" | "warning" | "critical")}>
              <option value="info">情報</option>
              <option value="warning">注意</option>
              <option value="critical">重要</option>
            </select>
          </label>
          <button>お知らせ登録</button>
        </form>
      )}

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

      <div className="chart-grid" style={{ marginTop: 20 }}>
        <div className="chart-panel">
          <h3>住民の構成</h3>
          <BarChart
            ariaLabel="住民の構成"
            rows={[
              { label: "現在住民", value: ov.residents.active },
              { label: "外国人住民", value: ov.residents.foreigners },
              { label: "特別永住者", value: ov.residents.specialPermanent },
              { label: "抑止対象", value: ov.residents.restricted },
            ]}
          />
        </div>
        <div className="chart-panel">
          <h3>交付・連携の状況</h3>
          <BarChart
            ariaLabel="交付・連携の状況"
            rows={[
              { label: "証明書交付", value: ov.certificates },
              { label: "コンビニ交付", value: ov.conveniRequests },
              { label: "本人通知発出", value: ov.notifications },
              { label: "審査待ち異動", value: ov.transactions.pendingApproval },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
