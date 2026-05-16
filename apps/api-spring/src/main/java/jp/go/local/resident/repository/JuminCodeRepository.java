package jp.go.local.resident.repository;

import java.util.Optional;
import jp.go.local.resident.domain.JuminCode;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

public interface JuminCodeRepository extends CrudRepository<JuminCode, Long> {

    /** 現行コード（valid_to が NULL）を取得。 */
    @Query("SELECT * FROM jumin_code WHERE resident_id = :residentId AND valid_to IS NULL LIMIT 1")
    Optional<JuminCode> findCurrentByResidentId(@Param("residentId") String residentId);
}
