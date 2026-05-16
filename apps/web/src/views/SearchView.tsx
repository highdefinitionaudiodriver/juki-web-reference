import type { Resident, SearchCriteria } from "../types";
import { Field } from "../components/Field";
import { Badges } from "../components/Badges";

type Props = {
  criteria: SearchCriteria;
  residents: Resident[];
  onChange: (next: SearchCriteria) => void;
  onSearch: () => void;
  onSelect: (residentId: string) => void;
};

export function SearchView({ criteria, residents, onChange, onSearch, onSelect }: Props) {
  return (
    <section className="panel">
      <div className="toolbar">
        <Field label="氏名" value={criteria.name} onChange={(v) => onChange({ ...criteria, name: v })} />
        <Field label="住所" value={criteria.address} onChange={(v) => onChange({ ...criteria, address: v })} />
        <label className="check">
          <input
            type="checkbox"
            checked={criteria.foreignerOnly}
            onChange={(e) => onChange({ ...criteria, foreignerOnly: e.target.checked })}
          />
          外国人のみ
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={criteria.includeRemoved}
            onChange={(e) => onChange({ ...criteria, includeRemoved: e.target.checked })}
          />
          除票含む
        </label>
        <button className="primary" onClick={onSearch}>検索</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>宛名番号</th>
              <th>氏名</th>
              <th>生年月日</th>
              <th>住所</th>
              <th>続柄</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.residentId} onClick={() => r.residentId && onSelect(r.residentId)}>
                <td>{r.residentId}</td>
                <td>
                  <strong>{`${r.familyNameKanji ?? ""} ${r.givenNameKanji ?? ""}`}</strong>
                  <small>{`${r.familyNameKana ?? ""} ${r.givenNameKana ?? ""}`}</small>
                </td>
                <td>{r.birthDate}</td>
                <td>{r.addressText}</td>
                <td>{r.relationToHead}</td>
                <td>
                  <Badges resident={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
