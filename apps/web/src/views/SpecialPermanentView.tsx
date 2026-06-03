import { useEffect, useState } from "react";
import type { Resident, SpecialPermanentCert } from "../types";
import { Field } from "../components/Field";

type ExpiringRow = SpecialPermanentCert & { residentId: string; name: string };

type Props = {
  resident: Resident | null;
  loadCert: (residentId: string) => Promise<SpecialPermanentCert | null>;
  loadExpiring: () => Promise<ExpiringRow[]>;
  onRegister: (residentId: string, body: { certNumber: string; issuedDate: string }) => Promise<void>;
};

/**
 * SCR-802: 特別永住者管理（特別永住者証明書）
 *
 *  - 特別永住者証明書の番号・交付日・有効期間満了日を管理する。
 *  - 有効期間満了日は交付時 16 歳未満なら 16 歳の誕生日、16 歳以上なら交付日から 7 年（サーバ算出）。
 */
export function SpecialPermanentView({ resident, loadCert, loadExpiring, onRegister }: Props) {
  const [cert, setCert] = useState<SpecialPermanentCert | null>(null);
  const [expiring, setExpiring] = useState<ExpiringRow[]>([]);
  const [certNumber, setCertNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));

  const refresh = async () => {
    setExpiring(await loadExpiring());
    if (resident?.residentId) setCert(await loadCert(resident.residentId));
    else setCert(null);
  };
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.residentId]);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>特別永住者証明書</h2>
        {resident ? (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              対象: <strong>{resident.familyNameKanji} {resident.givenNameKanji}</strong>（{resident.residentId}）
            </p>
            {cert && (
              <table style={{ marginBottom: 12 }}>
                <tbody>
                  <tr><th>証明書番号</th><td>{cert.certNumber}</td></tr>
                  <tr><th>交付日</th><td>{cert.issuedDate}</td></tr>
                  <tr><th>有効期間満了日</th><td><strong>{cert.expiryDate}</strong></td></tr>
                </tbody>
              </table>
            )}
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!resident.residentId || !certNumber) return;
                await onRegister(resident.residentId, { certNumber, issuedDate });
                setCertNumber("");
                await refresh();
              }}
            >
              <Field label="証明書番号" value={certNumber} onChange={setCertNumber} />
              <Field label="交付日" type="date" value={issuedDate} onChange={setIssuedDate} />
              <button>{cert ? "更新（再交付）" : "交付登録"}</button>
            </form>
          </>
        ) : (
          <p className="muted">住民検索から対象住民を選択してください。</p>
        )}
      </section>

      <section className="panel">
        <h2>有効期間満了予定（90日以内）</h2>
        {expiring.length === 0 ? (
          <p className="muted">満了予定はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>住民</th><th>氏名</th><th>証明書番号</th><th>満了日</th></tr>
              </thead>
              <tbody>
                {expiring.map((r) => (
                  <tr key={r.residentId}>
                    <td>{r.residentId}</td>
                    <td>{r.name}</td>
                    <td>{r.certNumber}</td>
                    <td>{r.expiryDate}</td>
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
