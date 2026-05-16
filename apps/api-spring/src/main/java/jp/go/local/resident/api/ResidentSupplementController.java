package jp.go.local.resident.api;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ResidentSupplementController {

    private final JdbcTemplate jdbc;

    public ResidentSupplementController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/residents/{residentId}/alias")
    public ResponseEntity<Map<String, Object>> alias(@PathVariable String residentId, @RequestBody Map<String, Object> body) {
        Map<String, Object> row = jdbc.queryForMap("""
            insert into alias_name (resident_id, kind, value_kanji, value_kana, valid_from, valid_to)
            values (?, ?, ?, ?, ?, ?)
            returning alias_id
            """, residentId, string(body.get("kind"), "ALIAS"), string(body.get("valueKanji"), ""),
            string(body.get("valueKana"), ""), LocalDate.parse(string(body.get("validFrom"), LocalDate.now().toString())),
            nullableDate(body.get("validTo")));
        Map<String, Object> response = new LinkedHashMap<>(body);
        response.put("id", String.valueOf(row.get("alias_id")));
        response.put("residentId", residentId);
        return ResponseEntity.status(201).body(response);
    }

    @PutMapping("/residents/{residentId}/foreigner")
    public Map<String, Object> foreigner(@PathVariable String residentId, @RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into resident_foreigner
              (resident_id, residence_status, residence_period_end, passport_no, nationality_full, alias_kanji, special_permanent_resident)
            values (?, ?, ?, ?, ?, ?, ?)
            on conflict (resident_id) do update set
              residence_status = excluded.residence_status,
              residence_period_end = excluded.residence_period_end,
              passport_no = excluded.passport_no,
              nationality_full = excluded.nationality_full,
              alias_kanji = excluded.alias_kanji,
              special_permanent_resident = excluded.special_permanent_resident
            """, residentId, string(body.get("residenceStatus"), ""), nullableDate(body.get("residencePeriodEnd")),
            string(body.get("passportNo"), ""), string(body.get("nationalityFull"), ""),
            string(body.get("aliasKanji"), ""), Boolean.TRUE.equals(body.get("specialPermanentResident")));
        Map<String, Object> response = new LinkedHashMap<>(body);
        response.put("residentId", residentId);
        return response;
    }

    @PostMapping("/codes/jumin")
    public ResponseEntity<Map<String, Object>> juminCode(@RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into jumin_code (resident_id, code, valid_from, event)
            values (?, ?, ?, ?)
            """, string(body.get("residentId"), ""), string(body.get("code"), "00000000000"),
            LocalDate.now(), string(body.get("operation"), "ISSUE"));
        return ResponseEntity.status(201).body(body);
    }

    @PostMapping("/codes/mynumber")
    public ResponseEntity<Map<String, Object>> myNumber(@RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into my_number (resident_id, number_ciphertext, valid_from, event)
            values (?, ?, ?, ?)
            """, string(body.get("residentId"), ""), string(body.get("number"), ""),
            LocalDate.now(), string(body.get("operation"), "ISSUE"));
        return ResponseEntity.status(201).body(body);
    }

    private LocalDate nullableDate(Object value) {
        return value == null || value.toString().isBlank() ? null : LocalDate.parse(value.toString());
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
