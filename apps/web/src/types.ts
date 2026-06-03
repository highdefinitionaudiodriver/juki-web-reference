import type { components } from "../../../packages/openapi/generated/api";

export type Schemas = components["schemas"];
export type Resident = Schemas["Resident"];
export type ResidentSearchReq = Schemas["ResidentSearchReq"];
export type PagedResidents = Schemas["PagedResidents"];
export type Transaction = Schemas["Transaction"];
export type MoveInReq = Schemas["MoveInReq"];
export type MoveOutReq = Schemas["MoveOutReq"];
export type OfficialTxReq = Schemas["OfficialTxReq"];
export type ApprovalReq = Schemas["ApprovalReq"];
export type CancelReq = Schemas["CancelReq"];
export type JuminCodeReq = Schemas["JuminCodeReq"];
export type MyNumberReq = Schemas["MyNumberReq"];
export type CodeIssueResult = Schemas["CodeIssueResult"];
export type CertificateReq = Schemas["CertificateReq"];
export type CertificateIssue = Schemas["CertificateIssue"];
export type VerifyResult = Schemas["VerifyResult"];
export type ReportReq = Schemas["ReportReq"];
export type EucQueryReq = Schemas["EucQueryReq"];
export type AsyncJob = Schemas["AsyncJob"];
export type AuditLog = Schemas["AuditLog"];
export type Me = Schemas["Me"];
export type Restriction = Schemas["Restriction"];
export type ForeignerInfo = Schemas["ForeignerInfo"];
export type ForeignerUpdateResult = Schemas["ForeignerUpdateResult"];
export type ForeignerExpiryReportReq = Schemas["ForeignerExpiryReportReq"];
export type ForeignerExpiryJob = Schemas["ForeignerExpiryJob"];
export type AliasName = Schemas["AliasName"];

export type ViewId = "search" | "resident" | "move" | "official" | "certificate" | "restriction" | "reports" | "admin" | "notify" | "conveni" | "alias" | "special" | "alerts" | "eucdesign";

// EUC設計（SCR-A01）
export type EucTemplate = {
  id: string;
  name: string;
  domain: string;
  outputFields: string[];
  includeMyNumber: boolean;
  requiresSecondApproval: boolean;
  createdBy?: string;
  createdAt?: string;
};

// エラー・アラート設定 / アクセスログ分析（SCR-A04）
export type AlertRules = {
  nightAccessEnabled: boolean;
  nightStartHour: number;
  nightEndHour: number;
  bulkSearchEnabled: boolean;
  bulkSearchThreshold: number;
};
export type AlertItem = {
  type: "NIGHT_ACCESS" | "BULK_SEARCH";
  severity: string;
  userId: string;
  message: string;
  occurredAt?: string;
  count?: number;
};

// 特別永住者証明書（SCR-802）
export type SpecialPermanentCert = {
  certNumber: string;
  issuedDate: string;
  expiryDate: string;
  note?: string;
};

// 通称・旧氏管理（SCR-103）
export type AliasRecord = {
  aliasId: string;
  kind: "ALIAS" | "FORMER_FAMILY";
  valueKanji: string;
  valueKana?: string;
  validFrom: string;
  validTo: string | null;
};

export type SearchCriteria = {
  name: string;
  address: string;
  foreignerOnly: boolean;
  includeRemoved: boolean;
};

export type EucAsyncJob = AsyncJob & { requiresSecondApproval?: boolean };

// 本人通知制度（標準仕様書 8.1 / SCR-801）
export type NotifyRegistration = {
  registrationId: string;
  residentId: string;
  registeredAt: string;
  expiresAt: string;
  status: "ACTIVE" | "INACTIVE";
  endedAt?: string;
  note?: string;
};

export type HonninNotification = {
  notificationId: string;
  residentId: string;
  issueId: string;
  formId: string;
  requesterType: string;
  certifiedAt: string;
  notifiedAt: string;
  channel: string;
  status: string;
};

// コンビニ交付（標準仕様書 第5章 / SCR-507）
export type ConveniRequest = {
  conveniId: string;
  residentId: string;
  formId: string;
  storeCode: string;
  cardSerial?: string;
  requestedAt: string;
  status: "ISSUED" | "REFUSED" | "NOT_FOUND" | "PENDING";
  issueId: string | null;
  reason: string | null;
};

export type ConveniStatus = {
  partner: string;
  linkState: string;
  serviceHours: string;
  checkedAt: string;
  totals: { total: number; issued: number; refused: number; pending: number };
};
