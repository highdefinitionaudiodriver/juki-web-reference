export type Sex = "M" | "F" | "U";
export type TransactionStatus = "DRAFT" | "REVIEW" | "APPROVED" | "APPLIED" | "CANCELLED";
export interface Me { userId: string; fullName: string; department: string; roles: string[] }
export interface Restriction { id: string; residentId?: string; category: "DV" | "STALKER" | "CHILD_ABUSE" | "OTHER"; startDate: string; endDate?: string | null; scope: "SELF" | "HOUSEHOLD"; releaseRole: string; note?: string }
export interface ForeignerInfo { residenceStatus?: string; residencePeriodEnd?: string; passportNo?: string; nationalityFull?: string; aliasKanji?: string; specialPermanentResident?: boolean }
export interface AliasName { kind: "ALIAS" | "FORMER_FAMILY"; valueKanji: string; valueKana?: string; validFrom: string; validTo?: string | null }
export interface Resident { residentId: string; householdId: string; familyNameKanji: string; givenNameKanji: string; familyNameKana: string; givenNameKana: string; birthDate: string; sex: Sex; addressCode: string; addressText: string; relationToHead: string; movedInDate: string; movedOutDate?: string | null; juminCode: string; myNumber: string; nationality?: string | null; foreigner?: ForeignerInfo | null; alias: AliasName[]; restrictions: Restriction[]; validFrom: string; validTo?: string | null }
export interface ResidentSearchReq { name?: string; kana?: string; birthDate?: string; sex?: "M" | "F"; residentId?: string; address?: string; householdHeadOnly?: boolean; foreignerOnly?: boolean; includeRemoved?: boolean; page?: number; size?: number }
export interface PagedResidents { total: number; page: number; size: number; items: Resident[] }
export interface TransactionItem { field: string; valueBefore?: string | null; valueAfter?: string | null }
export interface Transaction { transactionId: string; residentId: string; householdId: string; typeCode: string; reasonCode: string; eventDate: string; processedDate: string; receiverOffice: string; status: TransactionStatus; parentTransactionId?: string | null; items: TransactionItem[] }
export interface CertificateIssue { issueId: string; residentId: string; formId: string; copies: number; fee: number; verifyToken: string; pdfUrl: string; issuedAt: string; channel: "WINDOW" | "CVS" | "ONLINE" }
