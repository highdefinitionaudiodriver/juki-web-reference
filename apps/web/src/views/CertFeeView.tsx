import { useState } from "react";
import type { CertFeeReq, CertFeeResult } from "../types";
import { Field, SelectField, InfoTable } from "../components/Field";

type Props = {
  /** 手数料算定 API。指定がなければ算定不可。 */
  onCalc: (req: CertFeeReq) => Promise<CertFeeResult | void>;
};

const CERT_TYPES: Array<[string, string]> = [
  ["住民票の写し", "住民票の写し"],
  ["住民票記載事項証明書", "住民票記載事項証明書"],
  ["印鑑登録証明書", "印鑑登録証明書"],
  ["戸籍の附票の写し", "戸籍の附票の写し"],
  ["不在住証明書", "不在住証明書"],
  ["不在籍証明書", "不在籍証明書"],
];

/**
 * 証明手数料の算定（標準仕様書準拠）。
 * 証明種別・通数・郵送有無を入力すると即座に手数料合計を表示する
 * 「ぱっと入力→ぱっと結果」のクイック算定ビュー。
 */
export function CertFeeView({ onCalc }: Props) {
  const [certType, setCertType] = useState(CERT_TYPES[0]![0]);
  const [copies, setCopies] = useState("1");
  const [postal, setPostal] = useState(false);
  const [result, setResult] = useState<CertFeeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const yen = (n: number) => `${n.toLocaleString("ja-JP")} 円`;

  return (
    <div className="grid two">
      <section className="panel">
        <h2>証明手数料の算定</h2>
        <p className="muted">証明種別と通数を選ぶと、手数料合計をその場で算定します（手数料条例パラメータ準拠）。</p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = (await onCalc({ certType, copies: Number(copies || 1), postal })) ?? null;
              if (r) setResult(r);
            } finally {
              setBusy(false);
            }
          }}
        >
          <SelectField label="証明種別" value={certType} onChange={setCertType} options={CERT_TYPES} />
          <Field label="通数" type="number" min="1" value={copies} onChange={setCopies} />
          <label className="check">
            <input type="checkbox" checked={postal} onChange={(e) => setPostal(e.target.checked)} />
            郵送（郵送料を加算）
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary" disabled={busy}>
              {busy ? "算定中…" : "手数料を算定"}
            </button>
          </div>
        </form>
      </section>

      <section aria-label="算定結果" className="panel">
        {result ? (
          <div className="stack">
            <div
              role="status"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
                color: "#fff",
                borderRadius: 12,
                padding: "20px 24px",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.85 }}>手数料合計</div>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{yen(result.total)}</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                {result.certType} × {result.copies} 通{result.postalFee > 0 ? "（郵送）" : ""}
              </div>
            </div>
            <InfoTable
              rows={[
                ["証明種別", result.certType],
                ["単価", yen(result.unitFee)],
                ["通数", `${result.copies} 通`],
                ["小計", yen(result.subtotal)],
                ["郵送料", yen(result.postalFee)],
                ["合計", yen(result.total)],
              ]}
            />
          </div>
        ) : (
          <p className="muted">証明種別と通数を入力して「手数料を算定」を押してください。</p>
        )}
      </section>
    </div>
  );
}
