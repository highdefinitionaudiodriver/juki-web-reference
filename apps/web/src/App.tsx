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
import { NotificationView } from "./views/NotificationView";
import { ConvenienceView } from "./views/ConvenienceView";
import { AliasView } from "./views/AliasView";
import { SpecialPermanentView } from "./views/SpecialPermanentView";
import { AlertSettingsView } from "./views/AlertSettingsView";
import { EucDesignView } from "./views/EucDesignView";
import { BatchView } from "./views/BatchView";
import { OverviewView } from "./views/OverviewView";

const NAV: Array<[ViewId, string]> = [
  ["overview", "ダッシュボード"],
  ["search", "住民検索"],
  ["resident", "住民票"],
  ["alias", "通称・旧氏"],
  ["special", "特別永住者"],
  ["move", "異動"],
  ["official", "職権異動"],
  ["certificate", "証明発行"],
  ["restriction", "抑止設定"],
  ["notify", "本人通知"],
  ["conveni", "コンビニ交付"],
  ["reports", "統計/EUC"],
  ["eucdesign", "EUC設計"],
  ["batch", "バッチ"],
  ["alerts", "アラート設定"],
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
      {view === "overview" && (
        <OverviewView
          load={() => api.getOverview()}
          onNavigate={setView}
          loadAnnouncements={() => api.listAnnouncements()}
          onCreateAnnouncement={
            me?.roles?.includes("ADMIN")
              ? async (title, level) => {
                  try {
                    await api.createAnnouncement({ title, level });
                    notify("お知らせを登録しました。");
                  } catch (e) {
                    setNotice({ kind: "err", message: `お知らせ登録に失敗しました: ${String(e)}` });
                  }
                }
              : undefined
          }
        />
      )}
      {view === "search" && (
        <SearchView
          criteria={criteria}
          residents={residents}
          onChange={(next) => setCriteria(next)}
          onSearch={refreshSearch}
          onSelect={(id) => selectResident(id)}
          onExport={async () => {
            try {
              await api.exportSearchCsv(criteria);
              notify("検索結果をCSV出力しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `CSV出力に失敗しました: ${String(e)}` });
            }
          }}
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
          onLoadHousehold={(rid) => api.household(rid)}
          loadNotes={(rid) => api.residentNotes(rid)}
          onAddNote={async (rid, text) => {
            try {
              await api.addResidentNote(rid, text);
              notify("事務メモを追加しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `メモ追加に失敗しました: ${String(e)}` });
            }
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
          onBulkIssue={async (residentIds, formId) => {
            try {
              const r = await api.issueCertificatesBulk(residentIds, formId);
              notify(`連件交付: ${r.issuedCount}件発行（手数料合計 ${r.totalFee}円 / 対象外 ${r.skipped.length}件）`);
            } catch (e) {
              setNotice({ kind: "err", message: `連件交付に失敗しました: ${String(e)}` });
            }
          }}
          loadHistory={async (rid) => (await api.certificateHistory(rid)).history}
        />
      )}
      {view === "notify" && (
        <NotificationView
          resident={selected}
          loadRegistrations={() => api.listNotifyRegistrations()}
          loadNotifications={() => api.listNotifications()}
          onRegister={async (residentId, note) => {
            try {
              await api.registerNotify({ residentId, note });
              notify(`本人通知制度に登録しました: ${residentId}`);
            } catch (e) {
              setNotice({ kind: "err", message: `本人通知登録に失敗しました: ${String(e)}` });
            }
          }}
          onUnregister={async (registrationId) => {
            try {
              await api.deleteNotifyRegistration(registrationId);
              notify(`本人通知登録を廃止しました: ${registrationId}`);
            } catch (e) {
              setNotice({ kind: "err", message: `廃止に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "alias" && (
        <AliasView
          resident={selected}
          loadAlias={(rid) => api.listAlias(rid)}
          onAdd={async (rid, body) => {
            try {
              await api.addAlias(rid, body);
              notify(`${body.kind === "ALIAS" ? "通称" : "旧氏"}を登録しました。`);
            } catch (e) {
              setNotice({ kind: "err", message: `通称・旧氏の登録に失敗しました: ${String(e)}` });
            }
          }}
          onRemove={async (rid, aliasId) => {
            try {
              await api.removeAlias(rid, aliasId);
              notify("通称・旧氏を廃止しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `廃止に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "special" && (
        <SpecialPermanentView
          resident={selected}
          loadCert={(rid) => api.getSpecialPermanent(rid)}
          loadExpiring={() => api.listSpecialPermanentExpiring(90).then((r) => r.data)}
          onRegister={async (rid, body) => {
            try {
              const cert = await api.putSpecialPermanent(rid, body);
              notify(`特別永住者証明書を登録しました。満了日: ${cert.expiryDate}`);
            } catch (e) {
              setNotice({ kind: "err", message: `特別永住者証明書の登録に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "conveni" && (
        <ConvenienceView
          resident={selected}
          loadStatus={() => api.conveniStatus()}
          loadHistory={() => api.listConveni()}
          onRequest={async (residentId, storeCode) => {
            try {
              const r = await api.requestConveni({ residentId, storeCode });
              notify(
                r.status === "ISSUED"
                  ? `コンビニ交付しました: ${r.conveniId}`
                  : `コンビニ交付できません（${r.status}）: ${r.reason ?? ""}`,
              );
            } catch (e) {
              setNotice({ kind: "err", message: `コンビニ交付要求に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "batch" && (
        <BatchView
          load={() => api.listBatchJobs()}
          onRun={async (type) => {
            try {
              const job = await api.runBatch(type);
              notify(`バッチ「${job.name}」を実行しました（処理件数: ${job.processed}）。`);
            } catch (e) {
              setNotice({ kind: "err", message: `バッチ実行に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "eucdesign" && (
        <EucDesignView
          loadTemplates={() => api.listEucTemplates()}
          onCreate={async (body) => {
            try {
              const t = await api.createEucTemplate(body);
              notify(`EUCテンプレート「${t.name}」を保存しました${t.requiresSecondApproval ? "（実行時は二人承認）" : ""}。`);
            } catch (e) {
              setNotice({ kind: "err", message: `EUCテンプレートの保存に失敗しました: ${String(e)}` });
            }
          }}
          onDelete={async (id) => {
            try {
              await api.deleteEucTemplate(id);
              notify("EUCテンプレートを削除しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `削除に失敗しました: ${String(e)}` });
            }
          }}
          onRun={async (id) => {
            try {
              const job = await api.runEucTemplate(id);
              notify(
                job.requiresSecondApproval
                  ? `EUC実行を保留しました。二人承認が必要です: ${job.jobId}（対象${job.estimatedRows}件）`
                  : `EUC抽出を実行しました: ${job.resultUrl}（対象${job.estimatedRows}件）`,
              );
            } catch (e) {
              setNotice({ kind: "err", message: `EUC実行に失敗しました: ${String(e)}` });
            }
          }}
        />
      )}
      {view === "alerts" && (
        <AlertSettingsView
          loadRules={() => api.getAlertRules()}
          loadAlerts={() => api.getAlerts()}
          onSave={async (rules) => {
            try {
              await api.putAlertRules(rules);
              notify("アラート検知ルールを保存しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `保存に失敗しました: ${String(e)}` });
            }
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
          onExportAudit={async () => {
            try {
              await api.exportAuditCsv();
              notify("監査ログをCSV出力しました。");
            } catch (e) {
              setNotice({ kind: "err", message: `監査ログCSV出力に失敗しました: ${String(e)}` });
            }
          }}
          onExportAll={async () => {
            try {
              await api.exportAllData();
              notify("全業務データをエクスポートしました（契約終了時データ提供）。");
            } catch (e) {
              setNotice({ kind: "err", message: `全データエクスポートに失敗しました: ${String(e)}` });
            }
          }}
          onEucListQueued={async () => {
            try {
              return await api.eucList("QUEUED");
            } catch {
              return [];
            }
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
        />
      )}
    </Shell>
  );
}
