import { useState } from "react";
import type { Resident } from "../types";
import { Field, SelectField } from "../components/Field";

type Props = {
  resident: Resident | null;
  onCreate: (body: {
    residentId: string;
    category: string;
    startDate: string;
    endDate?: string | null;
    scope: string;
    note?: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * SCR-301: 抑止設定（DV 等支援措置）
 *
 * 標準仕様書 第 3 章 3 / 10.3:
 *  - 操作は RESTRICTION_RELEASE / ADMIN ロールのみ
 *  - 抑止登録すると WINDOW などからは存在ごと隠蔽される
 */
export function RestrictionView({ resident, onCreate, onDelete }: Props) {
  const [category, setCategory] = useState("DV");
  const [scope, setScope] = useState("SELF");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  if (!resident) {
    return <section className="panel empty">抑止対象を住民検索から選択してください。</section>;
  }

  const current = resident.restrictions ?? [];

  return (
    <div className="grid two">
      <section className="panel">
        <h2>抑止登録（DV 等支援措置）</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          対象: <strong>{resident.familyNameKanji} {resident.givenNameKanji}</strong>（{resident.residentId}）
        </p>
        <div className="notice" style={{ marginBottom: 12 }}>
          ⚠ この画面の操作には <strong>RESTRICTION_RELEASE</strong> もしくは <strong>ADMIN</strong> ロールが必要です。
        </div>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resident.residentId) return;
            await onCreate({
              residentId: resident.residentId,
              category,
              startDate,
              endDate: endDate || null,
              scope,
              note,
            });
            setNote("");
          }}
        >
          <SelectField
            label="区分"
            value={category}
            onChange={setCategory}
            options={[
              ["DV", "DV"],
              ["STALKER", "ストーカー"],
              ["CHILD_ABUSE", "児童虐待"],
              ["OTHER", "その他"],
            ]}
          />
          <SelectField
            label="適用範囲"
            value={scope}
            onChange={setScope}
            options={[
              ["SELF", "本人のみ"],
              ["HOUSEHOLD", "本人 + 同一世帯員"],
            ]}
          />
          <Field label="開始日" type="date" value={startDate} onChange={setStartDate} />
          <Field label="終了日（任意）" type="date" value={endDate} onChange={setEndDate} />
          <Field label="備考" value={note} onChange={setNote} />
          <button className="danger">抑止を登録</button>
        </form>
      </section>

      <section className="panel">
        <h2>現行の抑止</h2>
        {current.length === 0 ? (
          <p className="muted">現在、抑止は登録されていません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>区分</th>
                  <th>範囲</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>備考</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td><span className="badge warn">{r.category}</span></td>
                    <td>{r.scope}</td>
                    <td>{r.startDate}</td>
                    <td>{r.endDate ?? "—"}</td>
                    <td>{r.note ?? ""}</td>
                    <td>
                      <button
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (r.id) onDelete(r.id);
                        }}
                      >
                        解除
                      </button>
                    </td>
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
