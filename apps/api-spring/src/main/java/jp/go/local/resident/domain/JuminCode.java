package jp.go.local.resident.domain;

import java.time.LocalDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

@Table("jumin_code")
public record JuminCode(
    @Id Long id,
    @Column("resident_id") String residentId,
    String code,
    @Column("valid_from") LocalDate validFrom,
    @Column("valid_to") LocalDate validTo,
    String event
) {}
