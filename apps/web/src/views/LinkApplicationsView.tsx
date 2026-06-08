import { useEffect, useState } from "react";
import type { LinkApplication } from "../types";

type Props = {
  load: () => Promise<LinkApplication[]>;
  onAdvance: (id: string, status: string) => Promise<void>;
  onExport: () => Promise<void>;
};

const LABEL: Record<string, string> = { RECEIVED: "受付", PROCESSING: "処理中", COMPLETED: "完了", REJECTED: "却下" };
const NEXT: Record<string, string> = { RECEIVED: "PROCESSING", PROCESSING: "COMPLETED" };
const BADGE: Record<string, string> = { RECEIVED: "blue", PROCESSING: "warn", COMPLETED: "ok", REJECTED: "muted" };

/**
 * オンライン申請 受付簿（市民オンライン手続きポータル等からのインバウンド申請を職員が処理）
 *
 *  - /link/applications を一覧表示し、状態を進めると申請元（市民ポータル）へ自動通知される。
 *  - 参照・更新には VIEW 権限が必要。
 */
export function LinkApplicationsView({ load, onAdvance, onExport }: Props) {
  const [apps, setApps] = useState<LinkApplication[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => setApps(await load());
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = async (id: string, status: string) => {
    setBusy(id);
    try {
      await onAdvance(id, status);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <div className="section-head">
        <h2>オンライン申請 受付簿（{apps.length}）</h2>
        <div className="toolbar">
          <button onClick={() => refresh().catch(() => undefined)}>再読み込み</button>
          <button onClick={() => onExport().catch(() => undefined)}>CSV出力</button>
        </div>
      </div>
      <p className="muted">市民ポータル等から受信したオンライン申請です。状態を進めると申請元（市民）へ自動で通知されます。</p>
      {apps.length === 0 ? (
        <p className="muted">受信した申請はありません。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>受付日時</th><th>手続き</th><th>申請者</th><th>連携元</th><th>状態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const next = NEXT[a.status];
                const closed = a.status === "COMPLETED" || a.status === "REJECTED";
                return (
                  <tr key={a.id}>
                    <td>{a.receivedAt.slice(0, 19).replace("T", " ")}</td>
                    <td>{a.procedureType}</td>
                    <td>{a.applicant.name}</td>
                    <td>{a.source}</td>
                    <td><span className={`badge ${BADGE[a.status] ?? "muted"}`}>{LABEL[a.status] ?? a.status}</span></td>
                    <td>
                      {next && (
                        <button disabled={busy === a.id} onClick={() => advance(a.id, next)}>
                          {busy === a.id ? "更新中…" : `「${LABEL[next]}」へ`}
                        </button>
                      )}
                      {!closed && (
                        <button disabled={busy === a.id} style={{ marginLeft: 6 }} onClick={() => advance(a.id, "REJECTED")}>
                          却下
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
