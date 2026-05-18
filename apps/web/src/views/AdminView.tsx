import { useEffect, useState } from "react";
import type { AuditLog, EucAsyncJob } from "../types";
import { InfoTable } from "../components/Field";
import type { EucListItem } from "./ReportsView";

type Props = {
  audit: AuditLog[];
  onRefresh: () => Promise<void>;
  /**
   * EUC 承認キュー取得（管理者向け）。指定があれば「承認キュー」パネルが表示される。
   */
  onEucListQueued?: () => Promise<EucListItem[]>;
  /**
   * EUC 承認 / 却下。管理者用に AdminView からも操作できる。
   */
  onEucApprove?: (jobId: string, action: "APPROVE" | "REJECT", comment?: string) => Promise<EucAsyncJob | void>;
};

export function AdminView({ audit, onRefresh, onEucListQueued, onEucApprove }: Props) {
  const [queued, setQueued] = useState<EucListItem[]>([]);
  const [comment, setComment] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refreshQueue = async () => {
    if (!onEucListQueued) return;
    try {
      setQueued(await onEucListQueued());
    } catch {
      setQueued([]);
    }
  };

  useEffect(() => {
    refreshQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showApprovalQueue = Boolean(onEucListQueued && onEucApprove);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>ロール</h2>
        <InfoTable
          rows={[
            ["窓口担当", "住民検索、証明発行"],
            ["抑止解除", "支援措置対象の開示"],
            ["管理者", "権限、監査、連携設定、EUC 承認"],
          ]}
        />

        {showApprovalQueue && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <div className="section-head">
              <h3>EUC 承認キュー（管理者）</h3>
              <button type="button" onClick={refreshQueue} aria-label="EUC 承認キューを更新">
                更新
              </button>
            </div>
            <p className="muted" style={{ marginTop: 4, marginBottom: 8 }}>
              ROLE_ADMIN 限定。承認待ちの EUC 依頼を一覧から直接 承認 / 却下できます。
            </p>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>コメント（任意・全操作共通）</span>
              <input value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            {queued.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>承認待ちの EUC 依頼はありません。</p>
            ) : (
              <table className="info" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>jobId</th>
                    <th>申請者</th>
                    <th>出力項目</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {queued.map((item) => (
                    <tr key={item.jobId}>
                      <td><strong>{item.jobId}</strong></td>
                      <td>{item.requesterUserId ?? "-"}</td>
                      <td>
                        <small className="muted">
                          {(item.outputFields ?? []).join(", ")}
                          {item.includeMyNumber ? " ⚠ 個人番号含む" : ""}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="primary"
                          aria-label={`${item.jobId} を承認`}
                          onClick={async () => {
                            const result = await onEucApprove!(item.jobId, "APPROVE", comment || undefined);
                            setLastResult(result ? `${item.jobId}: APPROVE -> ${result.status}` : `${item.jobId}: APPROVE 完了`);
                            await refreshQueue();
                          }}
                        >
                          承認
                        </button>
                        {" "}
                        <button
                          type="button"
                          className="danger"
                          aria-label={`${item.jobId} を却下`}
                          onClick={async () => {
                            const result = await onEucApprove!(item.jobId, "REJECT", comment || undefined);
                            setLastResult(result ? `${item.jobId}: REJECT -> ${result.status}` : `${item.jobId}: REJECT 完了`);
                            await refreshQueue();
                          }}
                        >
                          却下
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {lastResult && (
              <p className="muted" style={{ marginTop: 8 }}>
                最終結果: <strong>{lastResult}</strong>
              </p>
            )}
          </div>
        )}
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
