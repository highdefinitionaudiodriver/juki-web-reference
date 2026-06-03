import { useEffect, useState } from "react";
import type { BatchJob, BatchType } from "../types";

type Props = {
  load: () => Promise<{ types: BatchType[]; history: BatchJob[] }>;
  onRun: (type: string) => Promise<void>;
};

/**
 * バッチ管理（標準仕様書 9 バッチ / BAT-001〜）
 *
 *  - CS連携取込・整合性確認・年報集計・満了抽出などの主要バッチを実行し、履歴を確認する。
 *  - 実行には異動権限（TRANSACTION）が必要。
 */
export function BatchView({ load, onRun }: Props) {
  const [types, setTypes] = useState<BatchType[]>([]);
  const [history, setHistory] = useState<BatchJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const r = await load();
    setTypes(r.types);
    setHistory(r.history);
  };
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>バッチ実行</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>バッチ</th><th>説明</th><th></th></tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.type}>
                  <td><strong>{t.name}</strong></td>
                  <td className="muted">{t.description}</td>
                  <td>
                    <button
                      disabled={busy === t.type}
                      onClick={async () => {
                        setBusy(t.type);
                        try {
                          await onRun(t.type);
                          await refresh();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === t.type ? "実行中…" : "実行"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>実行履歴（{history.length}）</h2>
        {history.length === 0 ? (
          <p className="muted">実行履歴はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>バッチ</th><th>状態</th><th>処理件数</th><th>実行日時</th></tr>
              </thead>
              <tbody>
                {history.map((j) => (
                  <tr key={j.jobId}>
                    <td>{j.name}</td>
                    <td><span className="badge ok">{j.status}</span></td>
                    <td>{j.processed}</td>
                    <td>{j.finishedAt.slice(0, 19).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
