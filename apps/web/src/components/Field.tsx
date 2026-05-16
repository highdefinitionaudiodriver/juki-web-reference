import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

export function Field({ label, value, onChange, ...rest }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

type SelectProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<[string, string]>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">;

export function SelectField({ label, value, onChange, options, ...rest }: SelectProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function InfoTable({ rows }: { rows: Array<[string, string | number | null | undefined]> }) {
  return (
    <table className="info">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{v ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
