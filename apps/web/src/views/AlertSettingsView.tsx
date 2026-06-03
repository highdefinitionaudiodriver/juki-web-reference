import { useEffect, useState } from "react";
import type { AlertItem, AlertRules } from "../types";
import { Field } from "../components/Field";

type Props = {
  loadRules: () => Promise<AlertRules>;
  loadAlerts: () => Promise<{ total: number; alerts: AlertItem[] }>;
  onSave: (rules: Partial<AlertRules>) => Promise<void>;
};

const TYPE_LABEL: Record<string, string> = { NIGHT_ACCESS: "深夜アクセス", BULK_SEARCH: "大量検索" };

/**
 * SCR-A04: エラー・アラート設定 / アクセスログ分析（標準仕様書 11, BAT-011）
 *
 *  - 深夜アクセス・大量検索の検知ルールを設定し、監査ログからアラートを抽出表示する。
 *  - 設定変更は管理者（ADMIN / RESTRICTION_MANAGE）のみ。
 */
export function AlertSettingsView({ loadRules, loadAlerts, onSave }: Props) {
  const [rules, setRules] = useState<AlertRules | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const refresh = async () => {
    setRules(await loadRules());
    setAlerts((await loadAlerts()).alerts);
  };
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rules) return <section className="panel">読み込み中…</section>;

  return (
    <div className="grid two">
      <section className="panel">
        <h2>アラート検知ルール</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(rules);
            await refresh();
          }}
        >
          <label className="check">
            <input
              type="checkbox"
              checked={rules.nightAccessEnabled}
              onChange={(e) => setRules({ ...rules, nightAccessEnabled: e.target.checked })}
            />
            深夜アクセスを検知する
          </label>
          <Field label="深夜開始時(0-23)" type="number" value={String(rules.nightStartHour)} onChange={(v) => setRules({ ...rules, nightStartHour: Number(v) })} />
          <Field label="深夜終了時(0-23)" type="number" value={String(rules.nightEndHour)} onChange={(v) => setRules({ ...rules, nightEndHour: Number(v) })} />
          <label className="check">
            <input
              type="checkbox"
              checked={rules.bulkSearchEnabled}
              onChange={(e) => setRules({ ...rules, bulkSearchEnabled: e.target.checked })}
            />
            大量検索を検知する
          </label>
          <Field label="大量検索の閾値(件)" type="number" value={String(rules.bulkSearchThreshold)} onChange={(v) => setRules({ ...rules, bulkSearchThreshold: Number(v) })} />
          <button>設定を保存</button>
        </form>
      </section>

      <section className="panel">
        <h2>検知アラート（{alerts.length}）</h2>
        {alerts.length === 0 ? (
          <p className="muted">現在、検知されたアラートはありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>種別</th><th>利用者</th><th>内容</th></tr>
              </thead>
              <tbody>
                {alerts.map((a, i) => (
                  <tr key={i}>
                    <td><span className="badge warn">{TYPE_LABEL[a.type] ?? a.type}</span></td>
                    <td>{a.userId}</td>
                    <td>{a.message}</td>
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
