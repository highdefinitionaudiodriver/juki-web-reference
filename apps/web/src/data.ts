import type { AuditLog, Me, Resident, Transaction } from "./types";

export const fallbackMe: Me = {
  userId: "u-window-001",
  fullName: "山田 太郎",
  department: "住民課 窓口係",
  roles: ["RESIDENT_READ", "CERTIFICATE_ISSUE", "RESTRICTION_VIEW"],
};

export const fallbackResidents: Resident[] = [
  {
    residentId: "0000123456",
    householdId: "H-00045",
    familyNameKanji: "住民",
    givenNameKanji: "太郎",
    familyNameKana: "ジュウミン",
    givenNameKana: "タロウ",
    birthDate: "1985-04-01",
    sex: "M",
    addressCode: "132010001001",
    addressText: "東京都サンプル市中央町1-2-3",
    relationToHead: "本人",
    movedInDate: "2018-06-01",
    movedOutDate: null,
    juminCode: "**** **** ***",
    myNumber: "**** **** ****",
    nationality: null,
    alias: [],
    restrictions: [],
    validFrom: "2018-06-01T00:00:00+09:00",
    validTo: null,
  },
  {
    residentId: "0000124000",
    householdId: "H-00990",
    familyNameKanji: "王",
    givenNameKanji: "明",
    familyNameKana: "ワン",
    givenNameKana: "ミン",
    birthDate: "1990-01-15",
    sex: "M",
    addressCode: "132010044006",
    addressText: "東京都サンプル市港町5-6",
    relationToHead: "本人",
    movedInDate: "2023-10-20",
    movedOutDate: null,
    juminCode: "**** **** ***",
    myNumber: "**** **** ****",
    nationality: "中国",
    foreigner: {
      residenceStatus: "技術・人文知識・国際業務",
      residencePeriodEnd: "2027-10-19",
      passportNo: "P12345678",
      nationalityFull: "中華人民共和国",
      aliasKanji: "王 明",
      specialPermanentResident: false,
    },
    alias: [],
    restrictions: [],
    validFrom: "2023-10-20T00:00:00+09:00",
    validTo: null,
  },
];

export const fallbackTransactions: Transaction[] = [
  {
    transactionId: "TX-20260516-0001",
    residentId: "0000123456",
    householdId: "H-00045",
    typeCode: "MOVE",
    reasonCode: "ADDRESS_FIX",
    eventDate: "2026-05-01",
    processedDate: "2026-05-16",
    receiverOffice: "住民課",
    status: "APPLIED",
    parentTransactionId: null,
    items: [{ field: "addressText", valueBefore: "1-2-2", valueAfter: "1-2-3" }],
  },
];

export const fallbackAuditLogs: AuditLog[] = [
  {
    logId: 1,
    userId: "u-window-001",
    ip: "127.0.0.1",
    action: "BOOTSTRAP",
    resourceType: "SYSTEM",
    resourceId: "resident-record-web",
    occurredAt: "2026-05-16T17:30:00+09:00",
    details: { source: "seed" },
  },
];
