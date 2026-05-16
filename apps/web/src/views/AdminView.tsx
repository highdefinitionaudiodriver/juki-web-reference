import type { AuditLog } from "../types";
import { InfoTable } from "../components/Field";

type Props = {
  audit: AuditLog[];
  onRefresh: () => Promise<void>;
};

export function AdminView({ audit, onRefresh }: Props) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>ロール</h2>
        <InfoTable
          rows={[
            ["窓口担当", "住民検索、証明発行"],
            ["抑止解除", "支援措置対象の開示"],
            ["管理者", "権限、監査、連携設定"],
          ]}
        />
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>監査ログ</h2>
          <button onClick={onRefresh}>監査ログ更新</button>
        </div>
        <div className="timeline">
          {audit.map((log) => (
            <article key={log.logId}>
              <strong>{`${log.action ?? ""} ${log.resourceType ?? ""}`}</strong>
              <span>{`${log.resourceId ?? ""} / ${log.occurredAt ?? ""}`}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
