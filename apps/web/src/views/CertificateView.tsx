import { useState } from "react";
import type { CertificateIssue, CertificateReq, Resident } from "../types";
import { Field, SelectField } from "../components/Field";
import { CertificateTemplate } from "../print/CertificateTemplate";

type Props = {
  resident: Resident | null;
  onIssue: (req: CertificateReq) => Promise<CertificateIssue | void>;
};

export function CertificateView({ resident, onIssue }: Props) {
  const [formId, setFormId] = useState("0010001");
  const [scope, setScope] = useState<"SELF" | "HOUSEHOLD" | "MEMBERS">("SELF");
  const [copies, setCopies] = useState("1");
  const [usage, setUsage] = useState("窓口請求");
  const [showJuminCode, setShowJuminCode] = useState(false);
  const [showMyNumber, setShowMyNumber] = useState(false);
  const [issued, setIssued] = useState<CertificateIssue | null>(null);

  if (!resident) {
    return <section className="panel empty">証明発行対象を選択してください。</section>;
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h2>住民票の写し（標準帳票 0010001 系）</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resident.residentId) return;
            const issue = (await onIssue({
              residentId: resident.residentId,
              formId: formId as CertificateReq["formId"],
              scope,
              copies: Number(copies || 1),
              usageText: usage,
              showJuminCode,
              showMyNumber,
            })) ?? null;
            if (issue) setIssued(issue);
          }}
        >
          <SelectField
            label="様式"
            value={formId}
            onChange={setFormId}
            options={[
              ["0010001", "住民票の写し"],
              ["0010002", "記載事項証明"],
              ["0010003", "世帯連記"],
              ["0010004", "除票の写し"],
              ["0010007", "転出証明書"],
            ]}
          />
          <SelectField
            label="範囲"
            value={scope}
            onChange={(v) => setScope(v as "SELF" | "HOUSEHOLD" | "MEMBERS")}
            options={[
              ["SELF", "本人"],
              ["HOUSEHOLD", "世帯"],
              ["MEMBERS", "指定世帯員"],
            ]}
          />
          <label className="check">
            <input type="checkbox" checked={showJuminCode} onChange={(e) => setShowJuminCode(e.target.checked)} />
            住民票コードを表示
          </label>
          <label className="check">
            <input type="checkbox" checked={showMyNumber} onChange={(e) => setShowMyNumber(e.target.checked)} />
            個人番号を表示（要権限）
          </label>
          <Field label="部数" type="number" min="1" value={copies} onChange={setCopies} />
          <Field label="使用目的" value={usage} onChange={setUsage} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary">発行</button>
            <button type="button" onClick={() => window.print()}>印刷プレビュー</button>
          </div>
          {issued && (
            <div className="notice" style={{ marginTop: 8 }}>
              <div>
                発行済: <strong>{issued.issueId}</strong> / 手数料 <strong>{issued.fee}円</strong>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <a
                  className="primary"
                  style={{ textDecoration: "none", padding: "6px 12px", borderRadius: 6, color: "#fff" }}
                  href={`/api/v1/certificates/${encodeURIComponent(issued.issueId ?? "")}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  PDF を表示
                </a>
                <a
                  href={`/api/v1/certificates/${encodeURIComponent(issued.issueId ?? "")}/pdf`}
                  download={`certificate-${issued.issueId}.pdf`}
                  style={{ alignSelf: "center" }}
                >
                  PDF をダウンロード
                </a>
                <a
                  href={`/api/v1/verify/${encodeURIComponent(issued.verifyToken ?? "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ alignSelf: "center" }}
                >
                  改ざん防止コード検証 ({issued.verifyToken})
                </a>
              </div>
            </div>
          )}
        </form>
      </section>
      <section style={{ overflow: "auto" }}>
        <CertificateTemplate
          resident={resident}
          issue={issued}
          formId={formId}
          scope={scope}
          showJuminCode={showJuminCode}
          showMyNumber={showMyNumber}
        />
      </section>
    </div>
  );
}
