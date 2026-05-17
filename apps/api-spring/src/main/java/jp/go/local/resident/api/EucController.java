package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/euc")
public class EucController {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public EucController(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/query")
    public ResponseEntity<Map<String, Object>> query(@RequestBody Map<String, Object> body,
                                                     Authentication authentication) {
        Map<String, Object> requestBody = body == null ? Map.of() : body;
        boolean includeMyNumber = Boolean.TRUE.equals(requestBody.get("includeMyNumber")) || outputFields(requestBody).contains("myNumber");
        String status = includeMyNumber ? "QUEUED" : "DONE";
        Integer progress = includeMyNumber ? 10 : 100;
        String resultUrl = includeMyNumber ? null : "/euc/result.csv";
        Map<String, Object> row = jdbc.queryForMap("""
            insert into report_request
              (template_id, requester_user_id, status, params, requested_at, result_url)
            values (?, ?, ?, cast(? as jsonb), ?, ?)
            returning request_id
            """, "euc-query", requester(authentication), status, json(requestBody), OffsetDateTime.now(), resultUrl);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", "EUC-" + row.get("request_id"));
        response.put("status", status);
        response.put("progress", progress);
        response.put("resultUrl", resultUrl);
        response.put("error", null);
        response.put("requiresSecondApproval", includeMyNumber);
        return ResponseEntity.status(202).body(response);
    }

    @SuppressWarnings("unchecked")
    private List<String> outputFields(Map<String, Object> body) {
        Object fields = body.get("outputFields");
        return fields instanceof List<?> list ? (List<String>) list : List.of();
    }

    private String requester(Authentication authentication) {
        return authentication == null ? "system" : authentication.getName();
    }

    private String json(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid EUC request", e);
        }
    }
}
