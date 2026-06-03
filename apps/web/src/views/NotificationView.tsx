import { useEffect, useState } from "react";
import type { HonninNotification, NotifyRegistration, Resident } from "../types";
import { Field } from "../components/Field";

type Props = {
  resident: Resident | null;
  loadRegistrations: () => Promise<NotifyRegistration[]>;
  loadNotifications: () => Promise<HonninNotification[]>;
  onRegister: (residentId: string, note: string) => Promise<void>;
  onUnregister: (registrationId: string) => Promise<void>;
};

const REQUESTER_LABEL: Record<string, string> = {
  THIRD_PARTY: "第三者",
  PROXY: "代理人",
  DELEGATE: "委任",
};

/**
 * SCR-801: 本人通知制度（標準仕様書 8.1 標準オプション機能）
 *
 *  - 住民が事前登録しておくと、第三者・代理人へ住民票の写し等が交付された際に
 *    本人へ通知（郵送）が発出される。
 *  - 登録・廃止は VIEW 権限（窓口担当）で操作可能。
 */
export function NotificationView({
  resident,
  loadRegistrations,
  loadNotifications,
  onRegister,
  onUnregister,
}: Props) {
  const [registrations, setRegistrations] = useState<NotifyRegistration[]>([]);
  const [notifications, setNotifications] = useState<HonninNotification[]>([]);
  const [note, setNote] = useState("");

  const refresh = async () => {
    setRegistrations(await loadRegistrations());
    setNotifications(await loadNotifications());
  };

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = registrations.filter((r) => r.status === "ACTIVE");

  return (
    <div className="grid two">
      <section className="panel">
        <h2>本人通知制度 登録</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          事前登録した住民に第三者・代理人請求があった場合、本人へ通知します。
        </p>
        {resident ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resident.residentId) return;
              await onRegister(resident.residentId, note);
              setNote("");
              await refresh();
            }}
          >
            <p>
              対象: <strong>{resident.familyNameKanji} {resident.givenNameKanji}</strong>（{resident.residentId}）
            </p>
            <Field label="備考" value={note} onChange={setNote} />
            <button>本人通知制度に登録</button>
          </form>
        ) : (
          <p className="muted">住民検索から対象住民を選択してください。</p>
        )}

        <h3 style={{ marginTop: 20 }}>登録中（{active.length}）</h3>
        {active.length === 0 ? (
          <p className="muted">登録はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>登録番号</th><th>住民</th><th>登録日</th><th>有効期限</th><th></th></tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.registrationId}>
                    <td>{r.registrationId}</td>
                    <td>{r.residentId}</td>
                    <td>{r.registeredAt.slice(0, 10)}</td>
                    <td>{r.expiresAt}</td>
                    <td>
                      <button
                        className="danger"
                        onClick={async () => {
                          await onUnregister(r.registrationId);
                          await refresh();
                        }}
                      >
                        廃止
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>通知記録（{notifications.length}）</h2>
        {notifications.length === 0 ? (
          <p className="muted">通知記録はありません。第三者・代理人請求で交付すると記録されます。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>通知番号</th><th>住民</th><th>請求区分</th><th>通知日時</th><th>状態</th></tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.notificationId}>
                    <td>{n.notificationId}</td>
                    <td>{n.residentId}</td>
                    <td><span className="badge warn">{REQUESTER_LABEL[n.requesterType] ?? n.requesterType}</span></td>
                    <td>{n.notifiedAt.slice(0, 19).replace("T", " ")}</td>
                    <td><span className="badge">{n.status}</span></td>
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
