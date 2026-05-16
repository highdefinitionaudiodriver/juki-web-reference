package jp.go.local.resident.api;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final JdbcTemplate jdbc;

    public ReportController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/annual")
    public ResponseEntity<Map<String, Object>> annual(@RequestBody Map<String, Object> body, Authentication authentication) {
        String templateId = string(body.get("templateId"), "annual-20-6");
        Map<String, Object> row = jdbc.queryForMap("""
            insert into report_request
              (template_id, requester_user_id, status, params, requested_at, result_url)
            values (?, ?, ?, '{}'::jsonb, ?, ?)
            returning request_id
            """, templateId, authentication.getName(), "DONE", OffsetDateTime.now(),
            "/reports/" + templateId + ".xlsx");
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", "REPORT-" + row.get("request_id"));
        response.put("status", "DONE");
        response.put("progress", 100);
        response.put("resultUrl", "/reports/" + templateId + ".xlsx");
        response.put("error", null);
        return ResponseEntity.status(202).body(response);
    }

    @PostMapping("/population")
    public ResponseEntity<Map<String, Object>> population(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", "POP-" + System.currentTimeMillis());
        response.put("status", "QUEUED");
        response.put("progress", 0);
        response.put("resultUrl", null);
        response.put("error", null);
        return ResponseEntity.status(202).body(response);
    }

    @GetMapping("/{jobId}")
    public Map<String, Object> show(@PathVariable String jobId) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", jobId);
        response.put("status", "DONE");
        response.put("progress", 100);
        response.put("resultUrl", "/reports/" + jobId + ".xlsx");
        response.put("error", null);
        return response;
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
