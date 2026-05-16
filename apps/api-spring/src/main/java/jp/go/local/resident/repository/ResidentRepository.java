package jp.go.local.resident.repository;

import java.util.List;
import jp.go.local.resident.domain.Resident;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

public interface ResidentRepository extends CrudRepository<Resident, String> {

    @Query("""
        SELECT * FROM resident
        WHERE (:name IS NULL OR family_name_kanji || given_name_kanji LIKE '%' || :name || '%')
          AND (:includeRemoved = true OR moved_out_date IS NULL)
          AND (:allowRestricted = true OR restricted_flag = false)
        ORDER BY family_name_kana, given_name_kana
        LIMIT :limit OFFSET :offset
        """)
    List<Resident> search(
        @Param("name") String name,
        @Param("includeRemoved") boolean includeRemoved,
        @Param("allowRestricted") boolean allowRestricted,
        @Param("limit") int limit,
        @Param("offset") int offset
    );
}
