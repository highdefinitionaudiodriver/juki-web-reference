import { useEffect, useState } from "react";
import type { ConveniRequest, ConveniStatus, Resident } from "../types";
import { Field } from "../components/Field";

type Props = {
  resident: Resident | null;
  loadStatus: () => Promise<ConveniStatus>;
  loadHistory: () => Promise<ConveniRequest[]>;
  onRequest: (residentId: string, storeCode: string) => Promise<void>;
};

const STATUS_LABEL: Record<string, string> = {
  ISSUED: "交付済",
  REFUSED: "利用停止",
  NOT_FOUND: "対象なし",
  PENDING: "処理中",
};
const STATUS_BADGE: Record<string, string> = {
  ISSUED: "ok",
  REFUSED: "warn",
  NOT_FOUND: "warn",
  PENDING: "",
};

/**
 * SCR-507: コンビニ交付確認（標準仕様書 第5章 証明 / 連携）
 *
 *  - J-LIS・自治体中間サーバ経由のマイナンバーカードによる証明書交付の連携状態と履歴を確認する。
 *  - 支援措置・抑止対象者はコンビニ交付が利用停止（REFUSED）される。
 */
export function ConvenienceView({ resident, loadStatus, loadHistory, onRequest }: Props) {
  const [status, setStatus] = useState<ConveniStatus | null>(null);
  const [history, setHistory] = useState<ConveniRequest[]>([]);
  const [storeCode, setStoreCode] = useState("STORE-0001");

  const refresh = async () => {
    setStatus(await loadStatus());
    setHistory(await loadHistory());
  };

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>J-LIS 連携状態</h2>
        {status ? (
          <table>
            <tbody>
              <tr><th>連携先</th><td>{status.partner}</td></tr>
              <tr><th>状態</th><td><span className={`badge ${status.linkState === "CONNECTED" ? "ok" : "warn"}`}>{status.linkState}</span></td></tr>
              <tr><th>サービス時間</th><td>{status.serviceHours}</td></tr>
              <tr><th>交付/停止/計</th><td>{status.totals.issued} / {status.totals.refused} / {status.totals.total}</td></tr>
              <tr><th>確認時刻</th><td>{status.checkedAt.slice(0, 19).replace("T", " ")}</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">連携状態を取得中…</p>
        )}

        <h3 style={{ marginTop: 20 }}>交付要求シミュレーション（中間サーバ受領）</h3>
        {resident ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resident.residentId) return;
              await onRequest(resident.residentId, storeCode);
              await refresh();
            }}
          >
            <p>対象: <strong>{resident.familyNameKanji} {resident.givenNameKanji}</strong>（{resident.residentId}）</p>
            <Field label="店舗コード" value={storeCode} onChange={setStoreCode} />
            <button>コンビニ交付要求を受領</button>
          </form>
        ) : (
          <p className="muted">住民検索から対象住民を選択してください。抑止対象者は利用停止になります。</p>
        )}
      </section>

      <section className="panel">
        <h2>コンビニ交付履歴（{history.length}）</h2>
        {history.length === 0 ? (
          <p className="muted">コンビニ交付の履歴はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>受付番号</th><th>住民</th><th>店舗</th><th>状態</th><th>理由</th></tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.conveniId}>
                    <td>{r.conveniId}</td>
                    <td>{r.residentId}</td>
                    <td>{r.storeCode}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td>{r.reason ?? "—"}</td>
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
