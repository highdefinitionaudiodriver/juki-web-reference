package jp.go.local.resident.api;

import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import jp.go.local.resident.service.CertificateIssueService;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final JdbcTemplate jdbc;
    private final CertificateIssueService certificateIssueService;

    public ReportController(JdbcTemplate jdbc, CertificateIssueService certificateIssueService) {
        this.jdbc = jdbc;
        this.certificateIssueService = certificateIssueService;
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

    @PostMapping("/foreigner-expiring")
    public ResponseEntity<Map<String, Object>> foreignerExpiring(@RequestBody(required = false) Map<String, Object> body,
                                                                 Authentication authentication) {
        LocalDate baseDate = body == null ? LocalDate.now() : LocalDate.parse(string(body.get("baseDate"), LocalDate.now().toString()));
        int days = number(body == null ? null : body.get("days"), 30);
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select r.resident_id, f.residence_period_end
              from resident_foreigner f
              join resident r on r.resident_id = f.resident_id
             where r.moved_out_date is null
               and f.residence_period_end between ? and ?
             order by f.residence_period_end, r.resident_id
            """, baseDate, baseDate.plusDays(days));
        int issued = 0;
        for (Map<String, Object> row : rows) {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("residentId", String.valueOf(row.get("resident_id")));
            request.put("formId", "0010012");
            request.put("copies", 1);
            request.put("usageText", "在留期間満了事前通知");
            certificateIssueService.issue(request, authentication, "0010012");
            issued++;
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", "FOREIGNER-" + System.currentTimeMillis());
        response.put("status", "DONE");
        response.put("progress", 100);
        response.put("resultUrl", null);
        response.put("error", null);
        response.put("baseDate", baseDate.toString());
        response.put("days", days);
        response.put("targetCount", rows.size());
        response.put("issuedCount", issued);
        response.put("formId", "0010012");
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

    private int number(Object value, int defaultValue) {
        return value instanceof Number number ? number.intValue() : defaultValue;
    }
}
