package jp.go.local.resident.api;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/link")
public class LinkController {

    private final JdbcTemplate jdbc;

    public LinkController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/cs/inbound")
    public ResponseEntity<Map<String, Object>> cs(@RequestBody(required = false) Map<String, Object> body) {
        return accept("CS", body);
    }

    @PostMapping("/number/inbound")
    public ResponseEntity<Map<String, Object>> number(@RequestBody(required = false) Map<String, Object> body) {
        return accept("NUMBER", body);
    }

    @PostMapping("/application/inbound")
    public ResponseEntity<Map<String, Object>> application(@RequestBody(required = false) Map<String, Object> body) {
        return accept("APPLICATION", body);
    }

    @PostMapping("/internal/{partner}")
    public ResponseEntity<Map<String, Object>> internal(@PathVariable String partner, @RequestBody(required = false) Map<String, Object> body) {
        return accept(partner.toUpperCase(), body);
    }

    private ResponseEntity<Map<String, Object>> accept(String partnerId, Map<String, Object> body) {
        jdbc.update("""
            insert into link_event (partner_id, direction, status, payload, occurred_at)
            values (?, ?, ?, '{}'::jsonb, ?)
            """, partnerId, "INBOUND", "ACCEPTED", OffsetDateTime.now());
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("partnerId", partnerId);
        response.put("status", "ACCEPTED");
        response.put("receivedAt", OffsetDateTime.now().toString());
        return ResponseEntity.status(202).body(response);
    }
}
