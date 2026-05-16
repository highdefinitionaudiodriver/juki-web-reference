package jp.go.local.resident.domain;

import java.time.LocalDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 個人番号テーブル。
 * DDL では番号本体は {@code number_ciphertext} に AES 等で暗号化して保存する想定。
 * このレコードはアプリ層では暗号文を保持し、復号は KMS 経由で行う（未実装）。
 */
@Table("my_number")
public record MyNumber(
    @Id Long id,
    @Column("resident_id") String residentId,
    @Column("number_ciphertext") String numberCiphertext,
    @Column("valid_from") LocalDate validFrom,
    @Column("valid_to") LocalDate validTo,
    String event
) {}
