import type {
  AsyncJob,
  AuditLog,
  CancelReq,
  CertificateIssue,
  CertificateReq,
  EucAsyncJob,
  EucQueryReq,
  Me,
  MoveInReq,
  MoveOutReq,
  PagedResidents,
  ReportReq,
  Resident,
  ResidentSearchReq,
  Transaction,
} from "./types";
import { fallbackAuditLogs, fallbackMe, fallbackResidents, fallbackTransactions } from "./data";
import { getToken } from "./auth";

const base = "/api/v1";

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
    try { return await request<Me>("/me"); } catch { return fallbackMe; }
  },
  async searchResidents(criteria: Partial<ResidentSearchReq>): Promise<PagedResidents> {
    try {
      return await request<PagedResidents>("/residents/search", { method: "POST", body: criteria as unknown as BodyInit });
    } catch {
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
    catch {
      const fallback = fallbackResidents.find((r) => r.residentId === id);
      if (!fallback) throw new Error("not found");
      return fallback;
    }
  },
  updateResident: (id: string, patch: { addressText?: string; reasonCode?: string; eventDate?: string }) =>
    request<Resident>(`/residents/${id}`, { method: "PUT", body: patch as unknown as BodyInit }),
  async history(id: string): Promise<Transaction[]> {
    try { return await request<Transaction[]>(`/residents/${id}/history`); }
    catch { return fallbackTransactions.filter((tx) => tx.residentId === id); }
  },
  moveIn: (body: MoveInReq) => request<Transaction>("/transactions/in", { method: "POST", body: body as unknown as BodyInit }),
  moveOut: (body: MoveOutReq) => request<Transaction & { certificate: CertificateIssue }>("/transactions/out", { method: "POST", body: body as unknown as BodyInit }),
  cancelTransaction: (body: CancelReq) => request<Transaction>("/transactions/cancel", { method: "POST", body: body as unknown as BodyInit }),
  issueCertificate: (body: CertificateReq) => request<CertificateIssue>("/certificates/jumin", { method: "POST", body: body as unknown as BodyInit }),
  annualReport: (body: ReportReq) => request<AsyncJob>("/reports/annual", { method: "POST", body: body as unknown as BodyInit }),
  eucQuery: (body: EucQueryReq) => request<EucAsyncJob>("/euc/query", { method: "POST", body: body as unknown as BodyInit }),
  async audit(): Promise<AuditLog[]> {
    try { return await request<AuditLog[]>("/audit"); } catch { return fallbackAuditLogs; }
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
};
