// 役割・項目別権限の最小実装。
// 設計の `permission` テーブル相当をコードで定義する。
// 各ロールは:
//   visibleFields:   resource 単位で field を可視化するセット（"*" は全て）
//   allowRestricted: 抑止対象住民の存在を見せ、住所をアンマスクできる
//   actions:         実行可能な action
//
// 標準仕様書 10.3 / 10.4 と整合: 個人番号・住民票コードは要権限。
// DV 等の抑止対象は権限なしロールに対しては「存在自体を隠蔽」（404 相当）。

export const ROLES = {
  WINDOW: {
    id: "WINDOW",
    label: "窓口担当",
    visibleFields: {
      RESIDENT: new Set([
        "residentId", "familyNameKanji", "givenNameKanji", "familyNameKana", "givenNameKana",
        "birthDate", "sex", "addressCode", "addressText", "householdId", "relationToHead",
        "movedInDate", "movedOutDate", "nationality", "foreigner", "alias", "validFrom", "validTo",
      ]),
    },
    allowRestricted: false,
    actions: new Set(["SEARCH", "VIEW", "ISSUE_CERTIFICATE", "MOVE_IN_RECEIVE", "MOVE_OUT_RECEIVE"]),
  },
  REVIEW: {
    id: "REVIEW",
    label: "異動審査",
    visibleFields: {
      RESIDENT: new Set([
        "residentId", "familyNameKanji", "givenNameKanji", "familyNameKana", "givenNameKana",
        "birthDate", "sex", "addressCode", "addressText", "householdId", "relationToHead",
        "movedInDate", "movedOutDate", "nationality", "foreigner", "alias", "validFrom", "validTo",
        "juminCode",
      ]),
    },
    allowRestricted: false,
    actions: new Set(["SEARCH", "VIEW", "TRANSACTION", "MOVE_IN_APPLY", "MOVE_OUT_APPLY", "CANCEL"]),
  },
  RESTRICTION_RELEASE: {
    id: "RESTRICTION_RELEASE",
    label: "抑止解除権限",
    visibleFields: { RESIDENT: new Set(["*"]) },
    allowRestricted: true,
    actions: new Set(["SEARCH", "VIEW", "RESTRICTION_MANAGE"]),
  },
  ADMIN: {
    id: "ADMIN",
    label: "システム管理者",
    visibleFields: { RESIDENT: new Set(["*"]) },
    allowRestricted: true,
    actions: new Set(["*"]),
  },
};

export function hasRole(user, roleId) {
  return Boolean(user?.roles?.includes(roleId));
}

export function canAction(user, action) {
  if (!user?.roles) return false;
  for (const id of user.roles) {
    const role = ROLES[id];
    if (!role) continue;
    if (role.actions.has("*") || role.actions.has(action)) return true;
  }
  return false;
}

export function canSeeRestricted(user) {
  return (user?.roles ?? []).some((id) => ROLES[id]?.allowRestricted);
}

function fieldVisibleByRole(role, resource, field) {
  const set = role.visibleFields?.[resource];
  if (!set) return false;
  return set.has("*") || set.has(field);
}

export function fieldVisible(user, resource, field) {
  return (user?.roles ?? []).some((id) => {
    const role = ROLES[id];
    return role && fieldVisibleByRole(role, resource, field);
  });
}

const SENSITIVE_FIELDS = ["juminCode", "myNumber"];
const UNMASK_ALIASES = {
  juminCode: ["juminCode", "jumin_code"],
  myNumber: ["myNumber", "my_number"],
};
function unmaskRequested(options, field) {
  const requested = options?.unmask ?? [];
  const aliases = UNMASK_ALIASES[field] ?? [field];
  return aliases.some((a) => requested.includes(a));
}

export function applyResidentMask(user, resident, options = {}) {
  if (!resident) return resident;
  // 抑止対象: 解除権限なしならそもそも null を返す（呼出側で 404 化）
  if (resident.restrictions?.length && !canSeeRestricted(user)) {
    return null;
  }
  const masked = { ...resident, restrictions: resident.restrictions ?? [] };
  for (const f of SENSITIVE_FIELDS) {
    const allowedByRole = fieldVisible(user, "RESIDENT", f);
    const requested = unmaskRequested(options, f);
    if (!allowedByRole || !requested) {
      if (f === "juminCode") masked.juminCode = "**** **** ***";
      if (f === "myNumber") masked.myNumber = "**** **** ****";
    }
  }
  // 抑止対象の住所は releaseRestriction 権限が必要
  if (resident.restrictions?.length && !canSeeRestricted(user)) {
    masked.addressText = "（支援措置により非表示）";
    masked.addressCode = "";
  }
  return masked;
}
