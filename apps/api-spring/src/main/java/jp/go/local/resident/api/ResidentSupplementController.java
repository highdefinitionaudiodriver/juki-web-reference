package jp.go.local.resident.api;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import jp.go.local.resident.service.CertificateIssueService;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ResidentSupplementController {

    private final JdbcTemplate jdbc;
    private final CertificateIssueService certificateIssueService;

    public ResidentSupplementController(JdbcTemplate jdbc, CertificateIssueService certificateIssueService) {
        this.jdbc = jdbc;
        this.certificateIssueService = certificateIssueService;
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
    @Transactional
    public ResponseEntity<Map<String, Object>> foreigner(@PathVariable String residentId, @RequestBody Map<String, Object> body) {
        ResponseEntity<Map<String, Object>> residentError = ensureResidentExists(residentId);
        if (residentError != null) return residentError;
        LocalDate periodEnd = nullableDate(body.get("residencePeriodEnd"));
        if (periodEnd == null) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "residencePeriodEnd は必須です。"));
        }
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
            """, residentId, string(body.get("residenceStatus"), ""), periodEnd,
            string(body.get("passportNo"), ""), string(body.get("nationalityFull"), ""),
            string(body.get("aliasKanji"), ""), Boolean.TRUE.equals(body.get("specialPermanentResident")));
        jdbc.update("update resident set nationality = ? where resident_id = ?",
            string(body.get("nationalityFull"), ""), residentId);
        Map<String, Object> response = new LinkedHashMap<>(body);
        response.put("residentId", residentId);
        response.put("residencePeriodEnd", periodEnd.toString());
        response.put("expiresWithin30Days", !periodEnd.isAfter(LocalDate.now().plusDays(30)));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/codes/jumin")
    @Transactional
    public ResponseEntity<Map<String, Object>> juminCode(@RequestBody Map<String, Object> body, Authentication authentication) {
        String residentId = string(body.get("residentId"), "");
        String operation = operation(body.get("operation"));
        if (residentId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "residentId は必須です。"));
        }
        if (operation == null) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "operation は ISSUE / CHANGE / FIX のいずれかです。"));
        }
        ResponseEntity<Map<String, Object>> residentError = ensureResidentExists(residentId);
        if (residentError != null) return residentError;
        Map<String, Object> current = currentCode("jumin_code", residentId);
        ResponseEntity<Map<String, Object>> stateError = ensureOperationState(operation, current);
        if (stateError != null) return stateError;
        String code = digitsOrGenerated(body.get("code"), 11, "9");
        if (!code.matches("\\d{11}")) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "code は 11 桁の数字で指定してください。"));
        }
        if (current != null) {
            jdbc.update("update jumin_code set valid_to = ? where id = ?", LocalDate.now(), current.get("id"));
        }
        jdbc.update("""
            insert into jumin_code (resident_id, code, valid_from, event)
            values (?, ?, ?, ?)
            """, residentId, code, LocalDate.now(), operation);
        return ResponseEntity.status(201).body(codeResponse("juminCode", residentId, operation, code, authentication));
    }

    @PostMapping("/codes/mynumber")
    @Transactional
    public ResponseEntity<Map<String, Object>> myNumber(@RequestBody Map<String, Object> body, Authentication authentication) {
        String residentId = string(body.get("residentId"), "");
        String operation = operation(body.get("operation"));
        if (residentId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "residentId は必須です。"));
        }
        if (operation == null) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "operation は ISSUE / CHANGE / FIX のいずれかです。"));
        }
        ResponseEntity<Map<String, Object>> residentError = ensureResidentExists(residentId);
        if (residentError != null) return residentError;
        Map<String, Object> current = currentCode("my_number", residentId);
        ResponseEntity<Map<String, Object>> stateError = ensureOperationState(operation, current);
        if (stateError != null) return stateError;
        String number = digitsOrGenerated(body.get("number"), 12, "8");
        if (!number.matches("\\d{12}")) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "number は 12 桁の数字で指定してください。"));
        }
        if (current != null) {
            jdbc.update("update my_number set valid_to = ? where id = ?", LocalDate.now(), current.get("id"));
        }
        jdbc.update("""
            insert into my_number (resident_id, number_ciphertext, valid_from, event)
            values (?, ?, ?, ?)
            """, residentId, number, LocalDate.now(), operation);
        return ResponseEntity.status(201).body(codeResponse("myNumber", residentId, operation, number, authentication));
    }

    private ResponseEntity<Map<String, Object>> ensureResidentExists(String residentId) {
        Integer hits = jdbc.queryForObject("select count(*) from resident where resident_id = ?", Integer.class, residentId);
        if (hits == null || hits == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "対象住民が見つかりません。"));
        }
        return null;
    }

    private Map<String, Object> currentCode(String table, String residentId) {
        try {
            return jdbc.queryForMap("select id from " + table + " where resident_id = ? and valid_to is null limit 1", residentId);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    private ResponseEntity<Map<String, Object>> ensureOperationState(String operation, Map<String, Object> current) {
        if ("ISSUE".equals(operation) && current != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("CURRENT_CODE_EXISTS", "現行コードが既に存在します。"));
        }
        if (!"ISSUE".equals(operation) && current == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("CURRENT_CODE_NOT_FOUND", "変更・修正対象の現行コードがありません。"));
        }
        return null;
    }

    private Map<String, Object> codeResponse(String field, String residentId, String operation, String value, Authentication authentication) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("residentId", residentId);
        request.put("formId", formIdFor(field, operation));
        request.put("copies", 1);
        request.put("usageText", labelFor(field, operation));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("residentId", residentId);
        response.put("operation", operation);
        response.put(field, value);
        response.put("certificate", certificateIssueService.issue(request, authentication, String.valueOf(request.get("formId"))));
        return response;
    }

    private String operation(Object value) {
        String op = string(value, "ISSUE");
        return java.util.Set.of("ISSUE", "CHANGE", "FIX").contains(op) ? op : null;
    }

    private String formIdFor(String field, String operation) {
        if ("juminCode".equals(field) && "ISSUE".equals(operation)) return "0010009";
        if ("myNumber".equals(field) && "ISSUE".equals(operation)) return "0010010";
        return "0010011";
    }

    private String labelFor(String field, String operation) {
        String target = "juminCode".equals(field) ? "住民票コード" : "個人番号";
        String op = switch (operation) {
            case "ISSUE" -> "付番";
            case "CHANGE" -> "変更";
            case "FIX" -> "修正";
            default -> operation;
        };
        return target + op + "通知";
    }

    private String digitsOrGenerated(Object value, int length, String prefix) {
        String s = string(value, "");
        if (!s.isBlank()) return s;
        String seed = prefix + String.valueOf(System.currentTimeMillis());
        return seed.substring(0, Math.min(seed.length(), length)).repeat(2).substring(0, length);
    }

    private Map<String, Object> error(String code, String message) {
        return Map.of("code", code, "message", message);
    }

    private LocalDate nullableDate(Object value) {
        return value == null || value.toString().isBlank() ? null : LocalDate.parse(value.toString());
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
