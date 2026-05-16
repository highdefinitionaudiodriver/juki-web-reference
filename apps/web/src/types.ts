import type { components } from "../../../packages/openapi/generated/api";

export type Schemas = components["schemas"];
export type Resident = Schemas["Resident"];
export type ResidentSearchReq = Schemas["ResidentSearchReq"];
export type PagedResidents = Schemas["PagedResidents"];
export type Transaction = Schemas["Transaction"];
export type MoveInReq = Schemas["MoveInReq"];
export type MoveOutReq = Schemas["MoveOutReq"];
export type CancelReq = Schemas["CancelReq"];
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
export type AliasName = Schemas["AliasName"];

export type ViewId = "search" | "resident" | "move" | "certificate" | "restriction" | "reports" | "admin";

export type SearchCriteria = {
  name: string;
  address: string;
  foreignerOnly: boolean;
  includeRemoved: boolean;
};

export type EucAsyncJob = AsyncJob & { requiresSecondApproval?: boolean };
