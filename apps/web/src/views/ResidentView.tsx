import { useEffect, useState } from "react";
import type { Resident, Transaction } from "../types";
import { Badges } from "../components/Badges";
import { Field, InfoTable } from "../components/Field";

type Props = {
  resident: Resident | null;
  history: Transaction[];
  onUnmask: () => void;
  onUpdateAddress: (addressText: string, eventDate: string) => Promise<void>;
  onLoadHousehold?: (residentId: string) => Promise<Resident[]>;
  /** 事務メモ（申し送り）。指定があればメモ欄を表示。 */
  loadNotes?: (residentId: string) => Promise<Array<{ id: string; text: string; author: string; createdAt: string }>>;
  onAddNote?: (residentId: string, text: string) => Promise<void>;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ResidentView({ resident, history, onUnmask, onUpdateAddress, onLoadHousehold, loadNotes, onAddNote }: Props) {
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(today());
  const [members, setMembers] = useState<Resident[] | null>(null);
  const [notes, setNotes] = useState<Array<{ id: string; text: string; author: string; createdAt: string }>>([]);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (loadNotes && resident?.residentId) {
      loadNotes(resident.residentId).then(setNotes).catch(() => setNotes([]));
    } else {
      setNotes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.residentId]);

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

        {onAddNote && loadNotes && (
          <div className="stack" style={{ marginTop: 16 }}>
            <h3>事務メモ（申し送り）</h3>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!resident.residentId || !noteText.trim()) return;
                await onAddNote(resident.residentId, noteText);
                setNoteText("");
                setNotes(await loadNotes(resident.residentId));
              }}
            >
              <Field label="メモ" value={noteText} onChange={setNoteText} />
              <button>追加</button>
            </form>
            {notes.length === 0 ? (
              <p className="muted">メモはありません。</p>
            ) : (
              <ul className="member-list">
                {notes.map((n) => (
                  <li key={n.id}>
                    {n.text}（{n.author} / {n.createdAt.slice(0, 10)}）
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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

        {onLoadHousehold && (
          <div className="section-head" style={{ marginTop: 16 }}>
            <h3>世帯員</h3>
            <button
              onClick={async () => {
                if (resident.residentId) setMembers(await onLoadHousehold(resident.residentId));
              }}
            >
              世帯員を表示
            </button>
          </div>
        )}
        {members && (
          members.length === 0 ? (
            <p className="muted">世帯員が取得できませんでした。</p>
          ) : (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.residentId}>
                  {m.familyNameKanji} {m.givenNameKanji}（{m.relationToHead ?? "—"}）
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
