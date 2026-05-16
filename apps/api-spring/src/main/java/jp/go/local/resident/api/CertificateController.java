package jp.go.local.resident.api;

import java.util.LinkedHashMap;
import java.util.Map;
import jp.go.local.resident.service.CertificatePdfService;
import jp.go.local.resident.service.CertificateIssueService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CertificateController {

    private final JdbcTemplate jdbc;
    private final CertificateIssueService certificateIssueService;
    private final CertificatePdfService certificatePdfService;

    public CertificateController(
        JdbcTemplate jdbc,
        CertificateIssueService certificateIssueService,
        CertificatePdfService certificatePdfService
    ) {
        this.jdbc = jdbc;
        this.certificateIssueService = certificateIssueService;
        this.certificatePdfService = certificatePdfService;
    }

    @PostMapping("/certificates/jumin")
    public Map<String, Object> issueJumin(@RequestBody Map<String, Object> body, Authentication authentication) {
        return issue(body, authentication, string(body.get("formId"), "0010001"));
    }

    @PostMapping("/certificates/items")
    public Map<String, Object> issueItems(@RequestBody(required = false) Map<String, Object> body, Authentication authentication) {
        return issue(body == null ? Map.of() : body, authentication, "0010002");
    }

    @PostMapping("/certificates/removed")
    public Map<String, Object> issueRemoved(@RequestBody(required = false) Map<String, Object> body, Authentication authentication) {
        return issue(body == null ? Map.of() : body, authentication, "0010004");
    }

    @PostMapping("/certificates/inspection")
    public Map<String, Object> issueInspection(@RequestBody(required = false) Map<String, Object> body, Authentication authentication) {
        return issue(body == null ? Map.of() : body, authentication, "0010005");
    }

    @PostMapping("/certificates/out")
    public Map<String, Object> issueOut(@RequestBody(required = false) Map<String, Object> body, Authentication authentication) {
        return issue(body == null ? Map.of() : body, authentication, "0010007");
    }

    private Map<String, Object> issue(Map<String, Object> body, Authentication authentication, String defaultFormId) {
        return certificateIssueService.issue(body, authentication, defaultFormId);
    }

    @GetMapping("/verify/{token}")
    public Map<String, Object> verify(@PathVariable String token) {
        var rows = jdbc.queryForList("""
            select form_id, issued_at from certificate_issue where verify_token = ?
            """, token);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("valid", !rows.isEmpty());
        response.put("formId", rows.isEmpty() ? null : rows.getFirst().get("form_id"));
        response.put("issuedAt", rows.isEmpty() ? null : rows.getFirst().get("issued_at"));
        response.put("issuerOffice", rows.isEmpty() ? null : "サンプル市 住民課");
        return response;
    }

    @GetMapping("/certificates/{issueId}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable long issueId) {
        byte[] pdf = certificatePdfService.render(issueId);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.inline().filename("certificate-" + issueId + ".pdf").build().toString())
            .body(pdf);
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
