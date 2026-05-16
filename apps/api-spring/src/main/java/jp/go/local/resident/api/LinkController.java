package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/link")
public class LinkController {

    private final JdbcTemplate jdbc;
    private final TransactionController transactionController;
    private final ObjectMapper objectMapper;

    public LinkController(JdbcTemplate jdbc, TransactionController transactionController, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.transactionController = transactionController;
        this.objectMapper = objectMapper;
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
    @Transactional
    public ResponseEntity<Map<String, Object>> internal(@PathVariable String partner, @RequestBody(required = false) Map<String, Object> body) {
        String partnerId = partner.toUpperCase();
        if ("KOSEKI".equals(partnerId)) {
            return acceptKoseki(body == null ? Map.of() : body);
        }
        return accept(partnerId, body);
    }

    private ResponseEntity<Map<String, Object>> accept(String partnerId, Map<String, Object> body) {
        Map<String, Object> row = insertLinkEvent(partnerId, "ACCEPTED", body, null);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("eventId", String.valueOf(row.get("event_id")));
        response.put("partnerId", partnerId);
        response.put("status", "ACCEPTED");
        response.put("receivedAt", OffsetDateTime.now().toString());
        return ResponseEntity.status(202).body(response);
    }

    private ResponseEntity<Map<String, Object>> acceptKoseki(Map<String, Object> body) {
        String noticeType = string(body.get("noticeType"), string(body.get("kind"), ""));
        if (noticeType.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "noticeType は必須です。"));
        }
        ResponseEntity<Map<String, Object>> txResponse = switch (noticeType) {
            case "BIRTH" -> transactionController.birth(body);
            case "DEATH" -> transactionController.death(body);
            case "MARRIAGE", "DIVORCE", "ADOPTION" -> {
                Map<String, Object> kosekiBody = new LinkedHashMap<>(body);
                kosekiBody.put("kind", noticeType);
                yield transactionController.koseki(kosekiBody);
            }
            default -> ResponseEntity.badRequest().body(error("VALIDATION_ERROR",
                "noticeType は BIRTH / DEATH / MARRIAGE / DIVORCE / ADOPTION のいずれかです。"));
        };
        if (!txResponse.getStatusCode().is2xxSuccessful()) {
            return txResponse;
        }
        Map<String, Object> tx = txResponse.getBody() == null ? Map.of() : txResponse.getBody();
        String transactionId = string(tx.get("transactionId"), null);
        Map<String, Object> row = insertLinkEvent("KOSEKI", "APPLIED", body, transactionId);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("eventId", String.valueOf(row.get("event_id")));
        response.put("partnerId", "KOSEKI");
        response.put("status", "APPLIED");
        response.put("transactionId", transactionId);
        response.put("transaction", tx);
        response.put("receivedAt", OffsetDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    private Map<String, Object> insertLinkEvent(String partnerId, String status, Map<String, Object> payload, String transactionId) {
        return jdbc.queryForMap("""
            insert into link_event (partner_id, transaction_id, direction, status, payload, occurred_at)
            values (?, ?, ?, ?, ?::jsonb, ?)
            returning event_id
            """, partnerId, transactionId, "INBOUND", status, toJson(payload), OffsetDateTime.now());
    }

    private String toJson(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body == null ? Map.of() : body);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }

    private Map<String, Object> error(String code, String message) {
        return Map.of("code", code, "message", message);
    }
}
