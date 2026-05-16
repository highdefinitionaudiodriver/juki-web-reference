package jp.go.local.resident.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 住民エンティティ。
 * カラム定義は packages/openapi/generated/api.d.ts → Resident スキーマと
 * apps/api/db/V001__initial_schema.sql に対応。
 */
@Table("resident")
public record Resident(
    @Id @Column("resident_id") String residentId,
    @Column("household_id") String householdId,
    @Column("family_name_kanji") String familyNameKanji,
    @Column("given_name_kanji") String givenNameKanji,
    @Column("family_name_kana") String familyNameKana,
    @Column("given_name_kana") String givenNameKana,
    @Column("birth_date") LocalDate birthDate,
    @Column("sex") String sex,
    @Column("nationality") String nationality,
    @Column("address_code") String addressCode,
    @Column("address_text") String addressText,
    @Column("moved_in_date") LocalDate movedInDate,
    @Column("moved_out_date") LocalDate movedOutDate,
    @Column("restricted_flag") boolean restrictedFlag,
    @Column("valid_from") OffsetDateTime validFrom,
    @Column("valid_to") OffsetDateTime validTo
) {}
