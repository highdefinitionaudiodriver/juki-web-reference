import { useEffect, useState } from "react";
import type { EucTemplate } from "../types";
import { Field } from "../components/Field";

type Props = {
  loadTemplates: () => Promise<EucTemplate[]>;
  onCreate: (body: { name: string; domain: string; outputFields: string[]; includeMyNumber: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const FIELD_OPTIONS = [
  ["residentId", "宛名番号"],
  ["familyNameKanji", "氏名(漢字)"],
  ["birthDate", "生年月日"],
  ["sex", "性別"],
  ["addressText", "住所"],
  ["juminCode", "住民票コード"],
  ["myNumber", "個人番号"],
] as const;

/**
 * SCR-A01: EUC設計（再利用可能な抽出テンプレート / BAT-012）
 *
 *  - 抽出対象ドメイン・出力項目を定義したテンプレートを登録・管理する。
 *  - 個人番号など機微情報を含む抽出は二人承認が必要（実行時 /euc/query と整合）。
 */
export function EucDesignView({ loadTemplates, onCreate, onDelete }: Props) {
  const [templates, setTemplates] = useState<EucTemplate[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("RESIDENT");
  const [fields, setFields] = useState<string[]>(["residentId"]);

  const refresh = async () => setTemplates(await loadTemplates());
  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (f: string) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const willNeedApproval = fields.includes("myNumber");

  return (
    <div className="grid two">
      <section className="panel">
        <h2>EUC抽出テンプレート設計</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name || fields.length === 0) return;
            await onCreate({ name, domain, outputFields: fields, includeMyNumber: fields.includes("myNumber") });
            setName("");
            setFields(["residentId"]);
            await refresh();
          }}
        >
          <Field label="テンプレート名" value={name} onChange={setName} />
          <Field label="対象ドメイン" value={domain} onChange={setDomain} />
          <fieldset className="stack" style={{ border: "1px solid var(--border)", padding: 8 }}>
            <legend>出力項目</legend>
            {FIELD_OPTIONS.map(([f, label]) => (
              <label key={f} className="check">
                <input type="checkbox" checked={fields.includes(f)} onChange={() => toggle(f)} />
                {label}
              </label>
            ))}
          </fieldset>
          {willNeedApproval && (
            <p className="notice">⚠ 個人番号を含むため、実行時は二人承認が必要になります。</p>
          )}
          <button>テンプレートを保存</button>
        </form>
      </section>

      <section className="panel">
        <h2>登録済みテンプレート（{templates.length}）</h2>
        {templates.length === 0 ? (
          <p className="muted">テンプレートはありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>名称</th><th>ドメイン</th><th>項目数</th><th>承認</th><th></th></tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.domain}</td>
                    <td>{t.outputFields.length}</td>
                    <td>{t.requiresSecondApproval ? <span className="badge warn">二人承認</span> : <span className="badge ok">単独</span>}</td>
                    <td><button className="danger" onClick={async () => { await onDelete(t.id); await refresh(); }}>削除</button></td>
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
