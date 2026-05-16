import type { CertificateIssue, Resident } from "../types";
import "./certificate.css";

type Props = {
  resident: Resident;
  issue?: CertificateIssue | null;
  members?: Resident[];
  formId?: string;
  scope?: "SELF" | "HOUSEHOLD" | "MEMBERS";
  showJuminCode?: boolean;
  showMyNumber?: boolean;
  municipality?: string;
  mayorName?: string;
};

const FORM_TITLE: Record<string, string> = {
  "0010001": "住 民 票 の 写 し",
  "0010002": "住民票記載事項証明書",
  "0010003": "住 民 票 の 写 し （世帯連記）",
  "0010004": "住民票の除票の写し",
  "0010007": "転 出 証 明 書",
  "0010009": "住民票コード通知票",
  "0010010": "個人番号通知票",
  "0010011": "住民票コード・個人番号変更通知票",
  "0010012": "在留期間満了事前通知票",
};

function formatWareki(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (y >= 2019) return `令和${y - 2018}年${m}月${day}日`;
  if (y >= 1989) return `平成${y - 1988}年${m}月${day}日`;
  if (y >= 1926) return `昭和${y - 1925}年${m}月${day}日`;
  return dateStr;
}

const masked = (v?: string | null) => (v ? <span className="masked">{v}</span> : <span className="masked">（省略）</span>);

export function CertificateTemplate({
  resident,
  issue,
  members,
  formId = "0010001",
  scope = "SELF",
  showJuminCode = false,
  showMyNumber = false,
  municipality = "サンプル市",
  mayorName = "山田 一郎",
}: Props) {
  const title = FORM_TITLE[formId] ?? "住 民 票 の 写 し";
  const list = scope === "SELF" ? [resident] : (members && members.length ? members : [resident]);

  return (
    <article className="cert-paper" id="cert-paper">
      <div className="frame">
        <div className="meta">
          <div>整理番号: {issue?.issueId ?? "（プレビュー）"}</div>
          <div className="right">様式: {formId}</div>
        </div>

        <h1 className="title">{title}</h1>

        <table className="cert">
          <tbody>
            <tr>
              <th>本籍・筆頭者</th>
              <td className="masked">（標準で省略）</td>
            </tr>
            <tr>
              <th>住所</th>
              <td>{resident.addressText ?? ""}</td>
            </tr>
            <tr>
              <th>世帯主</th>
              <td>
                {resident.relationToHead === "本人"
                  ? `${resident.familyNameKanji ?? ""} ${resident.givenNameKanji ?? ""}`
                  : "（世帯主名）"}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="cert members">
          <caption>世帯員 ({list.length} 名)</caption>
          <thead>
            <tr>
              <th>氏 名</th>
              <th>生年月日</th>
              <th>性別</th>
              <th>続柄</th>
              <th>住定日</th>
              <th>個人番号</th>
              <th>住民票コード</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.residentId}>
                <td>
                  <div>{`${r.familyNameKanji ?? ""} ${r.givenNameKanji ?? ""}`}</div>
                  <div style={{ fontSize: "9pt", color: "#555" }}>{`${r.familyNameKana ?? ""} ${r.givenNameKana ?? ""}`}</div>
                </td>
                <td>{formatWareki(r.birthDate)}</td>
                <td className="center">{r.sex === "M" ? "男" : r.sex === "F" ? "女" : "—"}</td>
                <td>{r.relationToHead ?? ""}</td>
                <td>{formatWareki(r.movedInDate)}</td>
                <td>{showMyNumber ? r.myNumber ?? "—" : masked(r.myNumber)}</td>
                <td>{showJuminCode ? r.juminCode ?? "—" : masked(r.juminCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="footer">
          <div className="issue-date">
            <div>
              発行年月日: {formatWareki((issue?.issuedAt ?? new Date().toISOString()).slice(0, 10))}
            </div>
            <div>{`発行: ${municipality} 住民課`}</div>
            <div>用途: {issue ? "—" : "（プレビュー）"}</div>
          </div>
          <div className="seal">
            <div>{municipality}長 {mayorName}</div>
            <div className="mayor">公 印</div>
          </div>
        </div>

        <div className="verify">
          <div>
            <div>本証明書は改ざん防止コード付です。</div>
            <div>
              検証URL: <code>/verify/{issue?.verifyToken ?? "<token>"}</code>
            </div>
          </div>
          <div className="qr">QR<br />{issue?.verifyToken ?? "PREVIEW"}</div>
        </div>
      </div>
    </article>
  );
}
