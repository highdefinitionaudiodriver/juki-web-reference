import { useState } from "react";
import type { EucQueryReq, ReportReq } from "../types";
import { Field } from "../components/Field";

type EucOutputField = NonNullable<EucQueryReq["outputFields"]>[number];

const EUC_OUTPUT_FIELDS = new Set<EucOutputField>([
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
]);

type Props = {
  onAnnualReport: (req: ReportReq) => Promise<void>;
  onEucQuery: (req: EucQueryReq) => Promise<void>;
};

function parseOutputFields(value: string): EucOutputField[] {
  return value
    .split(",")
    .map((field) => field.trim())
    .filter((field): field is EucOutputField => EUC_OUTPUT_FIELDS.has(field as EucOutputField));
}

export function ReportsView({ onAnnualReport, onEucQuery }: Props) {
  const [template, setTemplate] = useState("annual-20-6");
  const [year, setYear] = useState("2026");
  const [fields, setFields] = useState("residentId,name,addressText");
  const [withMyNumber, setWithMyNumber] = useState(false);

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
          <Field label="出力項目（カンマ区切り）" value={fields} onChange={setFields} />
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
      </section>
    </div>
  );
}
