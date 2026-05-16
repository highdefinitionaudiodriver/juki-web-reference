import { useState } from "react";
import type { Resident, Transaction } from "../types";
import { Badges } from "../components/Badges";
import { Field, InfoTable } from "../components/Field";

type Props = {
  resident: Resident | null;
  history: Transaction[];
  onUnmask: () => void;
  onUpdateAddress: (addressText: string, eventDate: string) => Promise<void>;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ResidentView({ resident, history, onUnmask, onUpdateAddress }: Props) {
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(today());

  if (!resident) {
    return <section className="panel empty">住民検索から対象者を選択してください。</section>;
  }

  return (
    <div className="grid two">
      <section className="panel">
        <div className="section-head">
          <h2>基本情報</h2>
          <button onClick={onUnmask}>コード表示</button>
        </div>
        <InfoTable
          rows={[
            ["宛名番号", resident.residentId ?? ""],
            ["氏名", `${resident.familyNameKanji ?? ""} ${resident.givenNameKanji ?? ""} / ${resident.familyNameKana ?? ""} ${resident.givenNameKana ?? ""}`],
            ["生年月日", resident.birthDate ?? ""],
            ["性別", resident.sex ?? ""],
            ["個人番号", resident.myNumber ?? ""],
            ["住民票コード", resident.juminCode ?? ""],
            ["住所", resident.addressText ?? ""],
            ["世帯ID", resident.householdId ?? ""],
            ["続柄", resident.relationToHead ?? ""],
          ]}
        />
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await onUpdateAddress(address || resident.addressText || "", date);
            setAddress("");
          }}
        >
          <Field label="住所修正" value={address || resident.addressText || ""} onChange={setAddress} />
          <Field label="異動日" type="date" value={date} onChange={setDate} />
          <button className="primary">単項目修正</button>
        </form>
      </section>

      <section className="panel">
        <h2>状態・履歴</h2>
        <div className="badge-row">
          <Badges resident={resident} />
        </div>
        {resident.foreigner ? (
          <InfoTable
            rows={[
              ["在留資格", resident.foreigner.residenceStatus ?? ""],
              ["在留期限", resident.foreigner.residencePeriodEnd ?? ""],
              ["国籍", resident.foreigner.nationalityFull ?? ""],
            ]}
          />
        ) : (
          <p className="muted">外国人在留情報なし</p>
        )}
        <h3>異動履歴</h3>
        <div className="timeline">
          {history.map((tx) => (
            <article key={tx.transactionId}>
              <strong>{`${tx.typeCode ?? ""} ${tx.status ?? ""}`}</strong>
              <span>{`${tx.eventDate ?? ""} / ${tx.reasonCode ?? ""}`}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
