package jp.go.local.resident.repository;

import java.util.Optional;
import jp.go.local.resident.domain.MyNumber;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

public interface MyNumberRepository extends CrudRepository<MyNumber, Long> {

    @Query("SELECT * FROM my_number WHERE resident_id = :residentId AND valid_to IS NULL LIMIT 1")
    Optional<MyNumber> findCurrentByResidentId(@Param("residentId") String residentId);
}
