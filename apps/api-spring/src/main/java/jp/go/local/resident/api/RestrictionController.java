package jp.go.local.resident.api;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/restrictions")
public class RestrictionController {

    private final JdbcTemplate jdbc;

    public RestrictionController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping
    @PreAuthorize("hasRole('RESTRICTION_RELEASE') or hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String residentId = string(body.get("residentId"), "");
        Map<String, Object> row = jdbc.queryForMap("""
            insert into restriction
              (resident_id, category, start_date, end_date, scope, release_role, note)
            values (?, ?, ?, ?, ?, ?, ?)
            returning restriction_id
            """, residentId, string(body.get("category"), "OTHER"),
            LocalDate.parse(string(body.get("startDate"), LocalDate.now().toString())),
            nullableDate(body.get("endDate")), string(body.get("scope"), "SELF"),
            string(body.get("releaseRole"), "RESTRICTION_RELEASE"), string(body.get("note"), ""));
        jdbc.update("update resident set restricted_flag = true where resident_id = ?", residentId);

        Map<String, Object> response = new LinkedHashMap<>(body);
        response.put("id", String.valueOf(row.get("restriction_id")));
        return ResponseEntity.status(201).body(response);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('RESTRICTION_RELEASE') or hasRole('ADMIN')")
    public ResponseEntity<Void> release(@PathVariable long id) {
        var rows = jdbc.queryForList("select resident_id from restriction where restriction_id = ?", id);
        if (rows.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String residentId = String.valueOf(rows.getFirst().get("resident_id"));
        jdbc.update("update restriction set end_date = current_date where restriction_id = ?", id);
        Integer active = jdbc.queryForObject("""
            select count(*) from restriction
            where resident_id = ? and (end_date is null or end_date >= current_date)
            """, Integer.class, residentId);
        if (active == null || active == 0) {
            jdbc.update("update resident set restricted_flag = false where resident_id = ?", residentId);
        }
        return ResponseEntity.noContent().build();
    }

    private LocalDate nullableDate(Object value) {
        return value == null || value.toString().isBlank() ? null : LocalDate.parse(value.toString());
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
