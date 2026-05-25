import { useEffect, useState } from "react";
import type { EucAsyncJob, EucQueryReq, ReportReq } from "../types";
import { Field } from "../components/Field";

export type EucListItem = {
  jobId: string;
  status: string;
  requesterUserId?: string | null;
  requestedAt?: string | null;
  outputFields?: string[];
  includeMyNumber?: boolean;
  resultUrl?: string | null;
  requiredApprovals?: number;
  approvedCount?: number;
};

type EucOutputField = NonNullable<EucQueryReq["outputFields"]>[number];

const EUC_OUTPUT_FIELD_OPTIONS: EucOutputField[] = [
  "residentId",
  "name",
  "nameKana",
  "addressText",
  "addressCode",
  "birthDate",
  "sex",
  "nationality",
  "movedInDate",
  "householdId",
  "myNumber",
];

const EUC_OUTPUT_FIELDS = new Set<EucOutputField>(EUC_OUTPUT_FIELD_OPTIONS);

type Props = {
  onAnnualReport: (req: ReportReq) => Promise<void>;
  onEucQuery: (req: EucQueryReq) => Promise<void>;
  /**
   * EUC 二段階承認。jobId と APPROVE/REJECT + コメントを渡す。
   * 標準仕様書 10.1: 個人番号を含む抽出は別経路の承認者が APPROVE してから ZIP 配信される。
   */
  onEucApprove?: (jobId: string, action: "APPROVE" | "REJECT", comment?: string) => Promise<EucAsyncJob | void>;
  /**
   * QUEUED 状態の EUC 一覧取得。承認 UI で承認待ち一覧を表示するため。
   */
  onEucListQueued?: () => Promise<EucListItem[]>;
};

function parseOutputFields(value: string): EucOutputField[] {
  return value
    .split(",")
    .map((field) => field.trim())
    .filter((field): field is EucOutputField => EUC_OUTPUT_FIELDS.has(field as EucOutputField));
}

export function ReportsView({ onAnnualReport, onEucQuery, onEucApprove, onEucListQueued }: Props) {
  const [template, setTemplate] = useState("annual-20-6");
  const [year, setYear] = useState("2026");
  const [fields, setFields] = useState("residentId,name,addressText");
  const [withMyNumber, setWithMyNumber] = useState(false);
  const [approveJobId, setApproveJobId] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [approveStatus, setApproveStatus] = useState<string | null>(null);
  const [queuedList, setQueuedList] = useState<EucListItem[]>([]);

  const refreshQueued = async () => {
    if (!onEucListQueued) return;
    try {
      setQueuedList(await onEucListQueued());
    } catch {
      setQueuedList([]);
    }
  };

  useEffect(() => {
    refreshQueued();
    // 依存に onEucListQueued を入れると毎レンダリングで実行されるため空配列
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>住基年報</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await onAnnualReport({ templateId: template, fiscalYear: Number(year), format: "XLSX" });
          }}
        >
          <Field label="テンプレートID" value={template} onChange={setTemplate} />
          <Field label="年度" type="number" value={year} onChange={setYear} />
          <button className="primary">集計</button>
        </form>
      </section>
      <section className="panel">
        <h2>EUC 任意抽出</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await onEucQuery({
              outputFields: parseOutputFields(fields),
              includeMyNumber: withMyNumber,
              format: "CSV",
            });
          }}
        >
          <Field label="出力項目（カンマ区切り）" value={fields} onChange={setFields} list="euc-output-fields" />
          <datalist id="euc-output-fields">
            {EUC_OUTPUT_FIELD_OPTIONS.map((field) => (
              <option key={field} value={field} />
            ))}
          </datalist>
          <label className="check">
            <input
              type="checkbox"
              checked={withMyNumber}
              onChange={(e) => setWithMyNumber(e.target.checked)}
            />
            個人番号を含む（二段階承認）
          </label>
          <button className="primary">抽出依頼</button>
        </form>

        {onEucApprove && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <h3 style={{ marginBottom: 8 }}>EUC 二段階承認</h3>
            <p className="muted" style={{ marginBottom: 8 }}>
              個人番号を含む抽出は QUEUED 状態で承認待ちになります。jobId を入力して承認／却下してください。
            </p>

            {onEucListQueued && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>承認待ち一覧</strong>
                  <button type="button" onClick={refreshQueued} aria-label="承認待ち一覧を更新">
                    更新
                  </button>
                </div>
                {queuedList.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>承認待ちの EUC 依頼はありません。</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                    {queuedList.map((item) => (
                      <li key={item.jobId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => setApproveJobId(item.jobId)}
                          style={{ minWidth: 120, textAlign: "left" }}
                          aria-label={`${item.jobId} を承認フォームに設定`}
                        >
                          <strong>{item.jobId}</strong>
                        </button>
                        <small className="muted">
                          {item.requesterUserId ?? "-"} / {(item.outputFields ?? []).join(", ")}
                          {item.includeMyNumber ? " / 個人番号含む" : ""}
                          {item.status === "QUEUED" && ` / ${item.approvedCount ?? 0}/${item.requiredApprovals ?? 1} 承認済み`}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Field label="EUC job ID" value={approveJobId} onChange={setApproveJobId} placeholder="EUC-42" />
              <Field label="コメント (任意)" value={approveComment} onChange={setApproveComment} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary"
                  disabled={!approveJobId}
                  onClick={async () => {
                    const result = await onEucApprove(approveJobId, "APPROVE", approveComment || undefined);
                    setApproveStatus(result ? `APPROVE -> ${result.status} (${result.resultUrl ?? "-"})` : "APPROVE 完了");
                    await refreshQueued();
                  }}
                >
                  承認 (APPROVE)
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={!approveJobId}
                  onClick={async () => {
                    const result = await onEucApprove(approveJobId, "REJECT", approveComment || undefined);
                    setApproveStatus(result ? `REJECT -> ${result.status} (${result.error ?? "-"})` : "REJECT 完了");
                    await refreshQueued();
                  }}
                >
                  却下 (REJECT)
                </button>
              </div>
              {approveStatus && (
                <p className="muted" style={{ marginTop: 4 }}>
                  最終結果: <strong>{approveStatus}</strong>
                </p>
              )}
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
