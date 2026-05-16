import { useState } from "react";
import type { ApprovalReq, OfficialTxReq, Resident, Transaction } from "../types";
import { Field, SelectField } from "../components/Field";

type Props = {
  resident: Resident | null;
  latestOfficial: Transaction | null;
  onCreate: (body: OfficialTxReq) => Promise<Transaction>;
  onApprove: (txId: string, body: ApprovalReq) => Promise<Transaction>;
};

const today = () => new Date().toISOString().slice(0, 10);

export function OfficialView({ resident, latestOfficial, onCreate, onApprove }: Props) {
  const [reasonCode, setReasonCode] = useState<"OFFICIAL_WRITE" | "OFFICIAL_FIX" | "OFFICIAL_DELETE">("OFFICIAL_FIX");
  const [eventDate, setEventDate] = useState(today());
  const [legalBasis, setLegalBasis] = useState("住民基本台帳法に基づく職権記載");
  const [content, setContent] = useState("");
  const [route, setRoute] = useState("REVIEW,ADMIN");
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<Transaction | null>(latestOfficial);

  const target = draft ?? latestOfficial;
  const canApprove = Boolean(target?.transactionId && target.status !== "APPLIED" && target.status !== "CANCELLED");

  return (
    <div className="grid two">
      <section className="panel">
        <h2>職権異動 起票</h2>
        {resident ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resident.residentId) return;
              const tx = await onCreate({
                residentId: resident.residentId,
                reasonCode,
                eventDate,
                legalBasis,
                content: content || "記載内容を確認し、職権で補正する。",
                approvalRoute: route.split(",").map((item) => item.trim()).filter(Boolean),
              });
              setDraft(tx);
            }}
          >
            <SelectField
              label="理由"
              value={reasonCode}
              onChange={(v) => setReasonCode(v as typeof reasonCode)}
              options={[
                ["OFFICIAL_FIX", "職権修正"],
                ["OFFICIAL_WRITE", "職権記載"],
                ["OFFICIAL_DELETE", "職権消除"],
              ]}
            />
            <Field label="異動日" type="date" value={eventDate} onChange={setEventDate} />
            <Field label="根拠" value={legalBasis} onChange={setLegalBasis} />
            <Field label="内容" value={content} onChange={setContent} />
            <Field label="決裁ルート" value={route} onChange={setRoute} />
            <button className="primary">起票</button>
          </form>
        ) : (
          <p className="muted">対象住民を選択してください。</p>
        )}
      </section>

      <section className="panel">
        <h2>決裁</h2>
        {target ? (
          <div className="stack">
            <div className="notice-card">
              <strong>{target.transactionId}</strong>
              <span>{`${target.reasonCode ?? ""} / ${target.status ?? ""}`}</span>
            </div>
            <Field label="コメント" value={comment} onChange={setComment} />
            <div className="actions">
              {(["APPROVE", "CONDITIONAL", "REMAND", "REJECT"] as const).map((action) => (
                <button
                  key={action}
                  disabled={!canApprove}
                  className={action === "REJECT" ? "danger" : action === "APPROVE" ? "primary" : undefined}
                  onClick={async () => {
                    if (!target.transactionId) return;
                    const tx = await onApprove(target.transactionId, { action, comment });
                    setDraft({ ...target, ...tx });
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted">起票後に決裁できます。</p>
        )}
      </section>
    </div>
  );
}
