package jp.go.local.resident.authz;

import java.util.Set;

/**
 * 役割定義（Node 版 apps/api/src/authz.js と整合）。
 * 実運用では権限管理画面 (SCR-A02) でメンテし、DB の role/permission テーブルに保存。
 */
public final class Roles {
    public static final String WINDOW = "WINDOW";
    public static final String REVIEW = "REVIEW";
    public static final String RESTRICTION_RELEASE = "RESTRICTION_RELEASE";
    public static final String ADMIN = "ADMIN";

    public static final Set<String> RESTRICTED_READERS = Set.of(RESTRICTION_RELEASE, ADMIN);
    public static final Set<String> SENSITIVE_FIELD_READERS = Set.of(REVIEW, ADMIN);

    private Roles() {}
}
