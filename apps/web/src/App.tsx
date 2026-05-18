import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { completeOidcLoginFromRedirect, logout, startOidcLogin } from "./auth";
import type {
  AuditLog,
  Me,
  Resident,
  SearchCriteria,
  Transaction,
  ViewId,
} from "./types";
import { Shell } from "./components/Shell";
import { SearchView } from "./views/SearchView";
import { ResidentView } from "./views/ResidentView";
import { MoveView } from "./views/MoveView";
import { OfficialView } from "./views/OfficialView";
import { CertificateView } from "./views/CertificateView";
import { ReportsView } from "./views/ReportsView";
import { AdminView } from "./views/AdminView";
import { RestrictionView } from "./views/RestrictionView";

const NAV: Array<[ViewId, string]> = [
  ["search", "住民検索"],
  ["resident", "住民票"],
  ["move", "異動"],
  ["official", "職権異動"],
  ["certificate", "証明発行"],
  ["restriction", "抑止設定"],
  ["reports", "統計/EUC"],
  ["admin", "権限/監査"],
];

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<ViewId>("search");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selected, setSelected] = useState<Resident | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [notice, setNotice] = useState<{ kind: "info" | "err"; message: string } | null>(null);
  const [criteria, setCriteria] = useState<SearchCriteria>({ name: "", address: "", foreignerOnly: false, includeRemoved: false });

  const refreshSearch = useCallback(async () => {
    const result = await api.searchResidents(criteria);
    setResidents(result.items ?? []);
    if (!selected && (result.items ?? [])[0]) {
      const first = (result.items ?? [])[0]!;
      const detail = await api.resident(first.residentId!);
      setSelected(detail);
      setHistory(await api.history(first.residentId!));
    }
  }, [criteria, selected]);

  const selectResident = useCallback(async (id: string, changeView = true) => {
    const detail = await api.resident(id);
    setSelected(detail);
    setHistory(await api.history(id));
    if (changeView) setView("resident");
  }, []);

  useEffect(() => {
    (async () => {
      await completeOidcLoginFromRedirect();
      setMe(await api.me());
      const result = await api.searchResidents({});
      setResidents(result.items ?? []);
      if ((result.items ?? [])[0]) {
        const first = (result.items ?? [])[0]!;
        setSelected(await api.resident(first.residentId!));
        setHistory(await api.history(first.residentId!));
      }
    })().catch((e) => setNotice({ kind: "err", message: String(e) }));
  }, []);

  const notify = useCallback((message: string) => setNotice({ kind: "info", message }), []);

  const title = useMemo(() => NAV.find(([id]) => id === view)?.[1] ?? "住民記録", [view]);
  const subtitle = useMemo(() => {
    if (view === "search") return "抑止対象者は住所とコードを権限に応じてマスクします。";
    if (selected) return `${selected.residentId} ${selected.familyNameKanji ?? ""}${selected.givenNameKanji ?? ""}`;
    return "対象住民未選択";
  }, [view, selected]);

  return (
    <Shell
      me={me}
      nav={NAV}
      view={view}
      title={title}
      subtitle={subtitle}
      notice={notice}
      onChangeView={setView}
      onLoginOidc={() => {
        startOidcLogin().catch((e) => setNotice({ kind: "err", message: String(e) }));
      }}
      onLogout={() => {
        logout();
        setMe(null);
        setNotice({ kind: "info", message: "ログアウトしました。" });
      }}
    >
      {view === "search" && (
        <SearchView
          criteria={criteria}
          residents={residents}
          onChange={(next) => setCriteria(next)}
          onSearch={refreshSearch}
          onSelect={(id) => selectResident(id)}
        />
      )}
      {view === "resident" && (
        <ResidentView
          resident={selected}
          history={history}
          onUnmask={async () => {
            if (!selected) return;
            setSelected(await api.resident(selected.residentId!, true));
          }}
          onUpdateAddress={async (addressText, eventDate) => {
            if (!selected) return;
            const updated = await api.updateResident(selected.residentId!, { addressText, reasonCode: "LIGHT_FIX", eventDate });
            setSelected(updated);
            setHistory(await api.history(selected.residentId!));
            notify("住民情報を更新し、異動履歴に記録しました。");
          }}
        />
      )}
      {view === "move" && (
        <MoveView
          selected={selected}
          history={history}
          onMoveIn={async (req) => {
            const tx = await api.moveIn(req);
            notify(`転入を反映しました: ${tx.transactionId}`);
            await refreshSearch();
          }}
          onMoveOut={async (req) => {
            const tx = await api.moveOut(req);
            notify(`転出を反映し、転出証明書を発行しました: ${tx.certificate.verifyToken}`);
            if (selected?.residentId) await selectResident(selected.residentId, false);
          }}
          onCancel={async () => {
            const latest = history[0];
            if (!latest?.transactionId) return;
            const tx = await api.cancelTransaction({ transactionId: latest.transactionId, reason: "入力誤りのため取消" });
            notify(`異動取消を登録しました: ${tx.transactionId}`);
            if (selected?.residentId) await selectResident(selected.residentId, false);
          }}
        />
      )}
      {view === "official" && (
        <OfficialView
          resident={selected}
          latestOfficial={history.find((tx) => tx.typeCode === "OFFICIAL") ?? null}
          onCreate={async (req) => {
            const tx = await api.officialTransaction(req);
            notify(`職権異動を起票しました: ${tx.transactionId}`);
            if (selected?.residentId) setHistory(await api.history(selected.residentId));
            return tx;
          }}
          onApprove={async (txId, req) => {
            const tx = await api.approveTransaction(txId, req);
            notify(`決裁を反映しました: ${txId} / ${tx.status}`);
            if (selected?.residentId) setHistory(await api.history(selected.residentId));
            return tx;
          }}
        />
      )}
      {view === "certificate" && (
        <CertificateView
          resident={selected}
          onIssue={async (req) => {
            const issue = await api.issueCertificate(req);
            notify(`証明書を発行しました。検証トークン: ${issue.verifyToken} / 手数料: ${issue.fee}円`);
            return issue;
          }}
        />
      )}
      {view === "reports" && (
        <ReportsView
          onAnnualReport={async (req) => {
            const job = await api.annualReport(req);
            notify(`年報ジョブを受け付けました: ${job.jobId} ${job.status}`);
          }}
          onEucQuery={async (req) => {
            const job = await api.eucQuery(req);
            notify(
              job.requiresSecondApproval
                ? `EUC依頼を保留しました。二段階承認が必要です: ${job.jobId}`
                : `EUC結果を作成しました: ${job.resultUrl}`
            );
          }}
          onEucApprove={async (jobId, action, comment) => {
            try {
              const job = await api.eucApprove(jobId, { action, comment });
              notify(
                job.status === "DONE"
                  ? `EUC ${jobId} を承認しました。結果: ${job.resultUrl ?? "-"}`
                  : `EUC ${jobId} を却下しました。状態: ${job.status}`
              );
              return job;
            } catch (e) {
              setNotice({ kind: "err", message: `EUC 承認に失敗しました: ${String(e)}` });
              return undefined;
            }
          }}
          onEucListQueued={async () => {
            try {
              return await api.eucList("QUEUED");
            } catch {
              return [];
            }
          }}
        />
      )}
      {view === "restriction" && (
        <RestrictionView
          resident={selected}
          onCreate={async (body) => {
            try {
              await api.createRestriction(body);
              notify(`抑止を登録しました: ${body.residentId} / ${body.category}`);
              if (selected?.residentId) await selectResident(selected.residentId, false);
            } catch (e) {
              setNotice({ kind: "err", message: `抑止登録に失敗しました: ${String(e)}` });
            }
          }}
          onDelete={async (id) => {
            try {
              await api.deleteRestriction(id);
              notify(`抑止を解除しました: ${id}`);
              if (selected?.residentId) await selectResident(selected.residentId, false);
            } catch (e) {
              setNotice({ kind: "err", message: `抑止解除に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "admin" && (
        <AdminView
          audit={audit}
          onRefresh={async () => setAudit(await api.audit())}
        />
      )}
    </Shell>
  );
}
