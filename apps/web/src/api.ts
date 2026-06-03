import type {
  AsyncJob,
  ApprovalReq,
  AuditLog,
  CancelReq,
  CodeIssueResult,
  CertificateIssue,
  CertificateReq,
  EucAsyncJob,
  EucQueryReq,
  ForeignerExpiryJob,
  ForeignerExpiryReportReq,
  ForeignerInfo,
  ForeignerUpdateResult,
  Me,
  MoveInReq,
  MoveOutReq,
  JuminCodeReq,
  MyNumberReq,
  OfficialTxReq,
  PagedResidents,
  ReportReq,
  Resident,
  ResidentSearchReq,
  Transaction,
  NotifyRegistration,
  HonninNotification,
  ConveniRequest,
  ConveniStatus,
  AliasRecord,
  SpecialPermanentCert,
  AlertRules,
  AlertItem,
  EucTemplate,
  BatchType,
  BatchJob,
} from "./types";
import { fallbackAuditLogs, fallbackMe, fallbackResidents, fallbackTransactions } from "./data";
import { getToken } from "./auth";

const base = "/api/v1";
const enableFallbackData = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FALLBACK_DATA === "true";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body !== "string") {
    headers.set("content-type", "application/json");
    init = { ...init, body: JSON.stringify(init.body) };
  }
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.status === 204 ? (null as T) : ((await response.json()) as T);
}

export const api = {
  async me(): Promise<Me> {
    try { return await request<Me>("/me"); } catch (e) {
      if (!enableFallbackData) throw e;
      return fallbackMe;
    }
  },
  async searchResidents(criteria: Partial<ResidentSearchReq>): Promise<PagedResidents> {
    try {
      return await request<PagedResidents>("/residents/search", { method: "POST", body: criteria as unknown as BodyInit });
    } catch (e) {
      if (!enableFallbackData) throw e;
      const items = fallbackResidents.filter((r) =>
        (!criteria.name || `${r.familyNameKanji ?? ""}${r.givenNameKanji ?? ""}`.includes(criteria.name)) &&
        (!criteria.address || (r.addressText ?? "").includes(criteria.address)) &&
        (!criteria.foreignerOnly || Boolean(r.foreigner))
      );
      return { total: items.length, page: 1, size: 50, items };
    }
  },
  async resident(id: string, unmask = false): Promise<Resident> {
    const qs = unmask ? "?unmask=my_number&unmask=jumin_code" : "";
    try { return await request<Resident>(`/residents/${id}${qs}`); }
    catch (e) {
      if (!enableFallbackData) throw e;
      const fallback = fallbackResidents.find((r) => r.residentId === id);
      if (!fallback) throw new Error("not found");
      return fallback;
    }
  },
  updateResident: (id: string, patch: { addressText?: string; reasonCode?: string; eventDate?: string }) =>
    request<Resident>(`/residents/${id}`, { method: "PUT", body: patch as unknown as BodyInit }),
  async history(id: string): Promise<Transaction[]> {
    try { return await request<Transaction[]>(`/residents/${id}/history`); }
    catch (e) {
      if (!enableFallbackData) throw e;
      return fallbackTransactions.filter((tx) => tx.residentId === id);
    }
  },
  moveIn: (body: MoveInReq) => request<Transaction>("/transactions/in", { method: "POST", body: body as unknown as BodyInit }),
  moveOut: (body: MoveOutReq) => request<Transaction & { certificate: CertificateIssue }>("/transactions/out", { method: "POST", body: body as unknown as BodyInit }),
  officialTransaction: (body: OfficialTxReq) => request<Transaction>("/transactions/official", { method: "POST", body: body as unknown as BodyInit }),
  approveTransaction: (txId: string, body: ApprovalReq) =>
    request<Transaction>(`/transactions/${txId}/approve`, { method: "POST", body: body as unknown as BodyInit }),
  cancelTransaction: (body: CancelReq) => request<Transaction>("/transactions/cancel", { method: "POST", body: body as unknown as BodyInit }),
  issueJuminCode: (body: JuminCodeReq) => request<CodeIssueResult>("/codes/jumin", { method: "POST", body: body as unknown as BodyInit }),
  issueMyNumber: (body: MyNumberReq) => request<CodeIssueResult>("/codes/mynumber", { method: "POST", body: body as unknown as BodyInit }),
  issueCertificate: (body: CertificateReq) => request<CertificateIssue>("/certificates/jumin", { method: "POST", body: body as unknown as BodyInit }),
  updateForeigner: (residentId: string, body: ForeignerInfo) =>
    request<ForeignerUpdateResult>(`/residents/${residentId}/foreigner`, { method: "PUT", body: body as unknown as BodyInit }),
  annualReport: (body: ReportReq) => request<AsyncJob>("/reports/annual", { method: "POST", body: body as unknown as BodyInit }),
  foreignerExpiryReport: (body: ForeignerExpiryReportReq) =>
    request<ForeignerExpiryJob>("/reports/foreigner-expiring", { method: "POST", body: body as unknown as BodyInit }),
  eucQuery: (body: EucQueryReq) => request<EucAsyncJob>("/euc/query", { method: "POST", body: body as unknown as BodyInit }),
  eucList: (status?: "QUEUED" | "DONE" | "FAILED") =>
    request<Array<{
      jobId: string;
      status: string;
      requesterUserId?: string | null;
      requestedAt?: string | null;
      outputFields?: string[];
      includeMyNumber?: boolean;
      resultUrl?: string | null;
      requiredApprovals?: number;
      approvedCount?: number;
    }>>(`/euc${status ? `?status=${status}` : ""}`),
  eucApprove: (
    jobId: string,
    body: { action?: "APPROVE" | "REJECT"; comment?: string | null },
  ) => request<EucAsyncJob>(`/euc/${jobId}/approve`, { method: "POST", body: body as unknown as BodyInit }),
  async audit(): Promise<AuditLog[]> {
    try { return await request<AuditLog[]>("/audit"); } catch (e) {
      if (!enableFallbackData) throw e;
      return fallbackAuditLogs;
    }
  },
  createRestriction: (body: {
    residentId: string;
    category: string;
    startDate: string;
    endDate?: string | null;
    scope: string;
    note?: string;
  }) => request<{ id: string }>("/restrictions", { method: "POST", body: body as unknown as BodyInit }),
  deleteRestriction: (id: string) => request<null>(`/restrictions/${id}`, { method: "DELETE" }),
  birth: (body: {
    parentResidentId: string;
    eventDate?: string;
    familyNameKanji: string;
    givenNameKanji: string;
    familyNameKana?: string;
    givenNameKana?: string;
    sex?: "M" | "F" | "U";
    relationToHead?: string;
  }) => request<Transaction & { parentResidentId: string }>("/transactions/birth", { method: "POST", body: body as unknown as BodyInit }),
  death: (body: { residentId: string; eventDate?: string }) =>
    request<Transaction>("/transactions/death", { method: "POST", body: body as unknown as BodyInit }),
  // 本人通知制度（SCR-801 / 8.1）
  registerNotify: (body: { residentId: string; years?: number; note?: string }) =>
    request<NotifyRegistration>("/notify/registrations", { method: "POST", body: body as unknown as BodyInit }),
  listNotifyRegistrations: () => request<NotifyRegistration[]>("/notify/registrations"),
  deleteNotifyRegistration: (id: string) =>
    request<null>(`/notify/registrations/${id}`, { method: "DELETE" }),
  listNotifications: () => request<HonninNotification[]>("/notify"),
  // 通称・旧氏管理（SCR-103）
  listAlias: (residentId: string) => request<AliasRecord[]>(`/residents/${residentId}/alias`),
  addAlias: (residentId: string, body: { kind: "ALIAS" | "FORMER_FAMILY"; valueKanji: string; valueKana?: string }) =>
    request<AliasRecord>(`/residents/${residentId}/alias`, { method: "POST", body: body as unknown as BodyInit }),
  removeAlias: (residentId: string, aliasId: string) =>
    request<AliasRecord>(`/residents/${residentId}/alias/${aliasId}`, { method: "DELETE" }),
  // 特別永住者管理（SCR-802）
  getSpecialPermanent: (residentId: string) =>
    request<SpecialPermanentCert | null>(`/residents/${residentId}/special-permanent`),
  putSpecialPermanent: (residentId: string, body: { certNumber: string; issuedDate?: string; note?: string }) =>
    request<SpecialPermanentCert & { residentId: string; expiresWithin90Days: boolean }>(
      `/residents/${residentId}/special-permanent`, { method: "PUT", body: body as unknown as BodyInit }),
  listSpecialPermanentExpiring: (days = 90) =>
    request<{ days: number; total: number; data: Array<SpecialPermanentCert & { residentId: string; name: string }> }>(
      `/special-permanent/expiring?days=${days}`),
  // エラー・アラート設定 / アクセスログ分析（SCR-A04）
  getAlertRules: () => request<AlertRules>("/alert-rules"),
  putAlertRules: (body: Partial<AlertRules>) =>
    request<AlertRules>("/alert-rules", { method: "PUT", body: body as unknown as BodyInit }),
  getAlerts: () => request<{ rules: AlertRules; total: number; alerts: AlertItem[] }>("/alerts"),
  // EUC設計（SCR-A01）
  listEucTemplates: () => request<EucTemplate[]>("/euc-templates"),
  createEucTemplate: (body: { name: string; domain?: string; outputFields: string[]; includeMyNumber?: boolean }) =>
    request<EucTemplate>("/euc-templates", { method: "POST", body: body as unknown as BodyInit }),
  deleteEucTemplate: (id: string) => request<null>(`/euc-templates/${id}`, { method: "DELETE" }),
  // バッチ管理（標準仕様書 9）
  listBatchJobs: () => request<{ types: BatchType[]; history: BatchJob[] }>("/batch-jobs"),
  runBatch: (type: string) => request<BatchJob>(`/batch-jobs/${type}/run`, { method: "POST" }),
  // コンビニ交付（SCR-507）
  conveniStatus: () => request<ConveniStatus>("/certificates/conveni/status"),
  listConveni: () => request<ConveniRequest[]>("/certificates/conveni"),
  requestConveni: (body: { residentId: string; formId?: string; storeCode?: string }) =>
    request<ConveniRequest>("/certificates/conveni", { method: "POST", body: body as unknown as BodyInit }),
};
