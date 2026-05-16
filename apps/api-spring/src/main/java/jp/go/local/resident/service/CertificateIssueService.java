package jp.go.local.resident.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/**
 * 証明発行の共通サービス。
 * Controller からの発行と、転出届など異動に伴う発行を同じ certificate_issue に記録する。
 */
@Service
public class CertificateIssueService {

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public CertificateIssueService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> issue(Map<String, Object> request, Authentication authentication, String defaultFormId) {
        String residentId = string(request.get("residentId"), "");
        String formId = string(request.get("formId"), defaultFormId);
        int copies = number(request.get("copies"), 1);
        String token = verifyToken();
        OffsetDateTime issuedAt = OffsetDateTime.now();
        String issuer = authentication == null ? "system" : authentication.getName();

        Map<String, Object> row = jdbc.queryForMap("""
            insert into certificate_issue
              (resident_id, transaction_id, form_id, copies, usage_text, fee, verify_token, issued_at, issuer_user_id, channel)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            returning issue_id
            """, residentId, string(request.get("transactionId"), null), formId, copies,
            string(request.get("usageText"), ""), 300 * copies, token, issuedAt, issuer, "WINDOW");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("issueId", String.valueOf(row.get("issue_id")));
        response.put("residentId", residentId);
        response.put("formId", formId);
        response.put("copies", copies);
        response.put("fee", 300 * copies);
        response.put("verifyToken", token);
        response.put("pdfUrl", "/api/v1/certificates/" + row.get("issue_id") + "/pdf");
        response.put("issuedAt", issuedAt.toString());
        response.put("channel", "WINDOW");
        return response;
    }

    private String verifyToken() {
        byte[] bytes = new byte[8];
        random.nextBytes(bytes);
        return "V" + HexFormat.of().formatHex(bytes).toUpperCase();
    }

    private int number(Object value, int defaultValue) {
        return value instanceof Number number ? number.intValue() : defaultValue;
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
