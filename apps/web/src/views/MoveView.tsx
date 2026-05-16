import { useState } from "react";
import type { MoveInReq, MoveOutReq, Resident, Transaction } from "../types";
import { Field, SelectField } from "../components/Field";

type Props = {
  selected: Resident | null;
  history: Transaction[];
  onMoveIn: (req: MoveInReq) => Promise<void>;
  onMoveOut: (req: MoveOutReq) => Promise<void>;
  onCancel: () => Promise<void>;
};

const today = () => new Date().toISOString().slice(0, 10);

export function MoveView({ selected, history, onMoveIn, onMoveOut, onCancel }: Props) {
  const [family, setFamily] = useState("");
  const [given, setGiven] = useState("");
  const [birth, setBirth] = useState("2000-01-01");
  const [sex, setSex] = useState<"M" | "F" | "U">("U");
  const [inDate, setInDate] = useState(today());
  const [outDate, setOutDate] = useState(today());
  const [outAddress, setOutAddress] = useState("東京都外サンプル市1-1");

  return (
    <div className="grid two">
      <section className="panel">
        <h2>転入届</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await onMoveIn({
              eventDate: inDate,
              members: [
                {
                  familyNameKanji: family || "新規",
                  givenNameKanji: given || "住民",
                  familyNameKana: "シンキ",
                  givenNameKana: "ジュウミン",
                  birthDate: birth,
                  sex,
                  relationToHead: "本人",
                },
              ],
            });
          }}
        >
          <Field label="氏" value={family} onChange={setFamily} />
          <Field label="名" value={given} onChange={setGiven} />
          <Field label="生年月日" type="date" value={birth} onChange={setBirth} />
          <SelectField
            label="性別"
            value={sex}
            onChange={(v) => setSex(v as "M" | "F" | "U")}
            options={[
              ["U", "未設定"],
              ["M", "男"],
              ["F", "女"],
            ]}
          />
          <Field label="転入日" type="date" value={inDate} onChange={setInDate} />
          <button className="primary">転入を反映</button>
        </form>
      </section>

      <section className="panel">
        <h2>転出・取消</h2>
        {selected ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selected.residentId) return;
              await onMoveOut({ eventDate: outDate, newAddress: outAddress, members: [selected.residentId] });
            }}
          >
            <Field label="転出先" value={outAddress} onChange={setOutAddress} />
            <Field label="転出日" type="date" value={outDate} onChange={setOutDate} />
            <button className="danger">選択住民を転出</button>
          </form>
        ) : (
          <p className="muted">対象住民を選択してください。</p>
        )}
        {history[0] && (
          <button onClick={onCancel} style={{ marginTop: 12 }}>
            最新異動を取消 ({history[0].transactionId})
          </button>
        )}
      </section>
    </div>
  );
}
