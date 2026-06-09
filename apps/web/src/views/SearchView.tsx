import { useState } from "react";
import type { Resident, SearchCriteria } from "../types";
import { Field } from "../components/Field";
import { Badges } from "../components/Badges";

type Props = {
  criteria: SearchCriteria;
  residents: Resident[];
  onChange: (next: SearchCriteria) => void;
  onSearch: () => void;
  onSelect: (residentId: string) => void;
  onExport: () => void;
};

type SortKey = "residentId" | "name" | "birthDate" | "addressText";
const SORT_VALUE: Record<SortKey, (r: Resident) => string> = {
  residentId: (r) => r.residentId ?? "",
  name: (r) => `${r.familyNameKana ?? ""} ${r.givenNameKana ?? ""}`,
  birthDate: (r) => r.birthDate ?? "",
  addressText: (r) => r.addressText ?? "",
};

export function SearchView({ criteria, residents, onChange, onSearch, onSelect, onExport }: Props) {
  const [sort, setSort] = useState<{ key: SortKey | ""; dir: 1 | -1 }>({ key: "", dir: 1 });
  const sorted = sort.key
    ? [...residents].sort((a, b) => SORT_VALUE[sort.key as SortKey](a).localeCompare(SORT_VALUE[sort.key as SortKey](b), "ja") * sort.dir)
    : residents;
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const indicator = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none";
  const sortableTh = (key: SortKey, label: string) => (
    <th onClick={() => toggleSort(key)} aria-sort={ariaSort(key)} style={{ cursor: "pointer", userSelect: "none" }} title="クリックで並び替え">
      {label}{indicator(key)}
    </th>
  );

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
        <button onClick={onExport}>CSV出力</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {sortableTh("residentId", "宛名番号")}
              {sortableTh("name", "氏名")}
              {sortableTh("birthDate", "生年月日")}
              {sortableTh("addressText", "住所")}
              <th>続柄</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
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
