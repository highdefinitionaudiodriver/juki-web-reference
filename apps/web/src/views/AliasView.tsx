import { useEffect, useState } from "react";
import type { AliasRecord, Resident } from "../types";
import { Field, SelectField } from "../components/Field";

type Props = {
  resident: Resident | null;
  loadAlias: (residentId: string) => Promise<AliasRecord[]>;
  onAdd: (residentId: string, body: { kind: "ALIAS" | "FORMER_FAMILY"; valueKanji: string; valueKana: string }) => Promise<void>;
  onRemove: (residentId: string, aliasId: string) => Promise<void>;
};

const KIND_LABEL: Record<string, string> = { ALIAS: "通称", FORMER_FAMILY: "旧氏" };

/**
 * SCR-103: 通称・旧氏管理（標準仕様書 1.1 管理項目）
 *
 *  - 通称（ALIAS）／旧氏（FORMER_FAMILY）の履歴を登録・参照・廃止する。
 *  - 廃止時は validTo を設定し履歴として保持（物理削除しない）。
 */
export function AliasView({ resident, loadAlias, onAdd, onRemove }: Props) {
  const [items, setItems] = useState<AliasRecord[]>([]);
  const [kind, setKind] = useState<"ALIAS" | "FORMER_FAMILY">("ALIAS");
  const [valueKanji, setValueKanji] = useState("");
  const [valueKana, setValueKana] = useState("");

  const refresh = async () => {
    if (resident?.residentId) setItems(await loadAlias(resident.residentId));
  };
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.residentId]);

  if (!resident) {
    return <section className="panel empty">住民検索から対象住民を選択してください。</section>;
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h2>通称・旧氏 登録</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          対象: <strong>{resident.familyNameKanji} {resident.givenNameKanji}</strong>（{resident.residentId}）
        </p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resident.residentId || !valueKanji) return;
            await onAdd(resident.residentId, { kind, valueKanji, valueKana });
            setValueKanji("");
            setValueKana("");
            await refresh();
          }}
        >
          <SelectField
            label="種別"
            value={kind}
            onChange={(v) => setKind(v as "ALIAS" | "FORMER_FAMILY")}
            options={[["ALIAS", "通称"], ["FORMER_FAMILY", "旧氏"]]}
          />
          <Field label="氏名（漢字）" value={valueKanji} onChange={setValueKanji} />
          <Field label="氏名（カナ）" value={valueKana} onChange={setValueKana} />
          <button>登録</button>
        </form>
      </section>

      <section className="panel">
        <h2>通称・旧氏 履歴（{items.length}）</h2>
        {items.length === 0 ? (
          <p className="muted">登録はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>種別</th><th>氏名(漢字)</th><th>カナ</th><th>適用開始</th><th>状態</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.aliasId}>
                    <td><span className="badge">{KIND_LABEL[a.kind] ?? a.kind}</span></td>
                    <td>{a.valueKanji}</td>
                    <td>{a.valueKana ?? ""}</td>
                    <td>{a.validFrom}</td>
                    <td>{a.validTo ? `廃止(${a.validTo})` : "有効"}</td>
                    <td>
                      {!a.validTo && (
                        <button
                          className="danger"
                          onClick={async () => {
                            if (resident.residentId) await onRemove(resident.residentId, a.aliasId);
                            await refresh();
                          }}
                        >
                          廃止
                        </button>
                      )}
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
