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

export type ViewId = "search" | "resident" | "move" | "official" | "certificate" | "restriction" | "reports" | "admin" | "notify";

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
