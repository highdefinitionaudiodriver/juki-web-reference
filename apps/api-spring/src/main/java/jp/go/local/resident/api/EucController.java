package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.lingala.zip4j.io.outputstream.ZipOutputStream;
import net.lingala.zip4j.model.ZipParameters;
import net.lingala.zip4j.model.enums.AesKeyStrength;
import net.lingala.zip4j.model.enums.CompressionMethod;
import net.lingala.zip4j.model.enums.EncryptionMethod;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/euc")
public class EucController {

    private static final List<String> DEFAULT_FIELDS = List.of("residentId", "name", "addressText");
    private static final Map<String, String> FIELD_EXPRESSIONS = Map.of(
        "residentId", "resident_id",
        "name", "family_name_kanji || ' ' || given_name_kanji",
        "nameKana", "family_name_kana || ' ' || given_name_kana",
        "addressText", "address_text",
        "addressCode", "address_code",
        "birthDate", "birth_date::text",
        "sex", "sex",
        "nationality", "nationality",
        "movedInDate", "moved_in_date::text",
        "householdId", "household_id"
    );
    private static final Set<String> FILTER_KEYS = Set.of(
        "residentId",
        "residentIdPrefix",
        "householdId",
        "sex",
        "addressCode",
        "addressTextContains",
        "nameContains",
        "nationality",
        "birthDateFrom",
        "birthDateTo",
        "movedInDateFrom",
        "movedInDateTo"
    );
    private static final Set<String> SEX_VALUES = Set.of("M", "F", "U");
    private static final SecureRandom RANDOM = new SecureRandom();
    /** ZIP パスワード生成に使う文字集合（紛らわしい I/l/0/O は除外）。 */
    private static final char[] PASSWORD_ALPHABET =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    private static final int PASSWORD_LENGTH = 16;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public EucController(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /**
     * EUC 依頼の一覧。status クエリで絞り込み（QUEUED / DONE / FAILED）。
     * 承認 UI が `QUEUED` 一覧を取得して、approve/reject を完結できるようにする。
     *
     *   GET /api/v1/euc?status=QUEUED
     *   GET /api/v1/euc          ← status 未指定なら直近 100 件全件
     *
     * 返却項目:
     *   jobId / status / requesterUserId / requestedAt / outputFields (params から抽出) /
     *   includeMyNumber / resultUrl
     */
    @GetMapping
    public java.util.List<Map<String, Object>> list(
            @org.springframework.web.bind.annotation.RequestParam(name = "status", required = false) String status) {
        java.util.List<Map<String, Object>> rows;
        if (status == null || status.isBlank()) {
            rows = jdbc.queryForList("""
                select request_id, status, requester_user_id, requested_at, params::text as params_json, result_url
                  from report_request
                 where template_id = 'euc-query'
                 order by requested_at desc
                 limit 100
                """);
        } else {
            rows = jdbc.queryForList("""
                select request_id, status, requester_user_id, requested_at, params::text as params_json, result_url
                  from report_request
                 where template_id = 'euc-query' and status = ?
                 order by requested_at desc
                 limit 100
                """, status);
        }
        java.util.List<Map<String, Object>> result = new java.util.ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            Object requestId = row.get("request_id");
            item.put("jobId", "EUC-" + requestId);
            item.put("status", row.get("status"));
            item.put("requesterUserId", row.get("requester_user_id"));
            item.put("requestedAt", row.get("requested_at"));
            item.put("resultUrl", row.get("result_url"));
            // params から outputFields / includeMyNumber を抽出（UI 表示用）
            try {
                JsonNode params = objectMapper.readTree(String.valueOf(row.get("params_json")));
                item.put("includeMyNumber", params.path("includeMyNumber").asBoolean(false)
                    || params.path("outputFields").toString().contains("\"myNumber\""));
                java.util.List<String> fields = new java.util.ArrayList<>();
                params.path("outputFields").forEach(n -> fields.add(n.asText()));
                item.put("outputFields", fields);
            } catch (Exception e) {
                item.put("includeMyNumber", false);
                item.put("outputFields", java.util.List.of());
            }
            result.add(item);
        }
        return result;
    }

    @PostMapping("/query")
    public ResponseEntity<Map<String, Object>> query(@RequestBody Map<String, Object> body,
                                                     Authentication authentication) {
        Map<String, Object> requestBody = body == null ? Map.of() : body;
        validateFilters(filters(requestBody));
        boolean includeMyNumber = Boolean.TRUE.equals(requestBody.get("includeMyNumber")) || outputFields(requestBody).contains("myNumber");
        String status = includeMyNumber ? "QUEUED" : "DONE";
        Integer progress = includeMyNumber ? 10 : 100;
        String resultUrl = null;
        Map<String, Object> row = jdbc.queryForMap("""
            insert into report_request
              (template_id, requester_user_id, status, params, requested_at, result_url)
            values (?, ?, ?, cast(? as jsonb), ?, ?)
            returning request_id
            """, "euc-query", requester(authentication), status, json(requestBody), OffsetDateTime.now(), resultUrl);
        String jobId = "EUC-" + row.get("request_id");
        if (!includeMyNumber) {
            resultUrl = "/api/v1/euc/" + jobId + "/result.zip";
            jdbc.update("update report_request set result_url = ? where request_id = ?", resultUrl, row.get("request_id"));
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", jobId);
        response.put("status", status);
        response.put("progress", progress);
        response.put("resultUrl", resultUrl);
        response.put("error", null);
        response.put("requiresSecondApproval", includeMyNumber);
        return ResponseEntity.status(202).body(response);
    }

    /**
     * EUC 結果 ZIP のダウンロード。
     *
     * - 応答ヘッダ `X-Euc-Password`: 当該リクエストで生成された平文パスワード
     * - 応答ヘッダ `X-Euc-Password-Hash`: SHA-256 ハッシュ（hex 64 文字、監査用）
     * - パスワードハッシュは `report_request.result_url` の末尾に
     *   `?passwordHash=...` として記録される（平文は保存しない）
     *
     * ZIP は AES-256 で暗号化。CSV エントリ名は `{jobId}-result.csv`。
     */
    @GetMapping("/{jobId}/result.zip")
    public ResponseEntity<byte[]> download(@PathVariable String jobId) {
        long requestId = requestId(jobId);
        Map<String, Object> job;
        try {
            job = jdbc.queryForMap("""
                select status, params, requester_user_id
                  from report_request
                 where request_id = ? and template_id = 'euc-query'
                """, requestId);
        } catch (EmptyResultDataAccessException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EUC job not found", e);
        }
        String status = String.valueOf(job.get("status"));
        if (!"DONE".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EUC job is not ready");
        }

        Map<String, Object> params = params(job.get("params"));
        validateFilters(filters(params));
        List<String> fields = outputFields(params).stream()
            .filter(FIELD_EXPRESSIONS::containsKey)
            .toList();
        if (fields.isEmpty()) {
            fields = DEFAULT_FIELDS;
        }

        String password = generatePassword();
        byte[] zip = zipCsvEncrypted(jobId, fields, params, password);
        String passwordHash = sha256Hex(password);

        // 監査用にパスワードハッシュを result_url に追記（平文は保存しない）
        String baseUrl = "/api/v1/euc/" + jobId + "/result.zip";
        jdbc.update("update report_request set result_url = ? where request_id = ?",
            baseUrl + "?passwordHash=" + passwordHash, requestId);

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(jobId + "-result.zip").build().toString())
            .header("X-Euc-Password", password)
            .header("X-Euc-Password-Hash", passwordHash)
            .body(zip);
    }

    @PostMapping("/{jobId}/approve")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable String jobId,
                                                       @RequestBody(required = false) Map<String, Object> body,
                                                       Authentication authentication) {
        long requestId = requestId(jobId);
        Map<String, Object> approvalBody = body == null ? Map.of() : body;
        String action = string(approvalBody.get("action"), "APPROVE").toUpperCase();
        if (!Set.of("APPROVE", "REJECT").contains(action)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EUC approval action must be APPROVE or REJECT");
        }

        Map<String, Object> job;
        try {
            job = jdbc.queryForMap("""
                select status, params
                  from report_request
                 where request_id = ? and template_id = 'euc-query'
                """, requestId);
        } catch (EmptyResultDataAccessException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EUC job not found", e);
        }
        String status = String.valueOf(job.get("status"));
        if (!"QUEUED".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EUC job is not awaiting approval");
        }

        Map<String, Object> params = params(job.get("params"));
        validateFilters(filters(params));
        String approverUserId = requester(authentication);
        String requesterUserId = String.valueOf(job.get("requester_user_id"));
        if (approverUserId.equals(requesterUserId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EUC self approval is not allowed");
        }
        String resultUrl = "APPROVE".equals(action) ? "/api/v1/euc/" + jobId + "/result.zip" : null;
        String nextStatus = "APPROVE".equals(action) ? "DONE" : "FAILED";
        String error = "APPROVE".equals(action) ? null : "Rejected by approver";
        Map<String, Object> approval = new LinkedHashMap<>();
        approval.put("action", action);
        approval.put("approverUserId", approverUserId);
        approval.put("comment", string(approvalBody.get("comment"), null));
        approval.put("actedAt", OffsetDateTime.now().toString());

        jdbc.update("""
            update report_request
               set status = ?,
                   result_url = ?,
                   params = jsonb_set(params, '{approval}', cast(? as jsonb), true)
             where request_id = ?
            """, nextStatus, resultUrl, json(approval), requestId);
        Integer nextStep = jdbc.queryForObject(
            "select coalesce(max(step), 0) + 1 from report_approval where request_id = ?",
            Integer.class, requestId);
        jdbc.update("""
            insert into report_approval (request_id, step, role, approver_user_id, action, comment, acted_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """, requestId, nextStep == null ? 1 : nextStep, "REPORT_APPROVER", approverUserId, action,
            string(approvalBody.get("comment"), null), OffsetDateTime.now());
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("status", nextStatus);
        event.put("resultUrl", resultUrl);
        event.put("comment", string(approvalBody.get("comment"), null));
        jdbc.update("""
            insert into report_event (request_id, event_type, actor_user_id, details, occurred_at)
            values (?, ?, ?, cast(? as jsonb), ?)
            """, requestId, "EUC_" + action, approverUserId, json(event), OffsetDateTime.now());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", jobId);
        response.put("status", nextStatus);
        response.put("progress", 100);
        response.put("resultUrl", resultUrl);
        response.put("error", error);
        response.put("requiresSecondApproval", false);
        return ResponseEntity.ok(response);
    }

    @SuppressWarnings("unchecked")
    private List<String> outputFields(Map<String, Object> body) {
        Object fields = body.get("outputFields");
        return fields instanceof List<?> list ? (List<String>) list : List.of();
    }

    private String requester(Authentication authentication) {
        return authentication == null ? "system" : authentication.getName();
    }

    private String string(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? fallback : text;
    }

    private String json(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid EUC request", e);
        }
    }

    private Map<String, Object> params(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((key, item) -> out.put(String.valueOf(key), item));
            return out;
        }
        try {
            return objectMapper.readValue(String.valueOf(value), new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid EUC params", e);
        }
    }

    private long requestId(String jobId) {
        if (jobId == null || !jobId.startsWith("EUC-")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EUC job not found");
        }
        try {
            return Long.parseLong(jobId.substring("EUC-".length()));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EUC job not found", e);
        }
    }

    /** AES-256 パスワード付 ZIP を生成する。 */
    private byte[] zipCsvEncrypted(String jobId, List<String> fields, Map<String, Object> params, String password) {
        String select = fields.stream()
            .map(field -> FIELD_EXPRESSIONS.get(field) + " as \"" + field + "\"")
            .reduce((left, right) -> left + ", " + right)
            .orElse("resident_id as \"residentId\"");
        WhereClause where = whereClause(filters(params));
        String sql = """
            select %s
              from resident
             where moved_out_date is null
               and restricted_flag = false
               %s
             order by resident_id
             limit 1000
            """.formatted(select, where.sql());
        List<Map<String, Object>> rows = jdbc.queryForList(sql, where.args().toArray());

        byte[] csvBytes = csv(fields, rows).getBytes(StandardCharsets.UTF_8);

        ZipParameters zp = new ZipParameters();
        zp.setCompressionMethod(CompressionMethod.DEFLATE);
        zp.setEncryptFiles(true);
        zp.setEncryptionMethod(EncryptionMethod.AES);
        zp.setAesKeyStrength(AesKeyStrength.KEY_STRENGTH_256);
        zp.setFileNameInZip(jobId + "-result.csv");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, password.toCharArray());
             ByteArrayInputStream in = new ByteArrayInputStream(csvBytes)) {
            zip.putNextEntry(zp);
            byte[] buf = new byte[4096];
            int read;
            while ((read = in.read(buf)) != -1) {
                zip.write(buf, 0, read);
            }
            zip.closeEntry();
        } catch (IOException e) {
            throw new UncheckedIOException("EUC ZIP encryption failed", e);
        }
        return out.toByteArray();
    }

    private static String generatePassword() {
        StringBuilder sb = new StringBuilder(PASSWORD_LENGTH);
        for (int i = 0; i < PASSWORD_LENGTH; i++) {
            sb.append(PASSWORD_ALPHABET[RANDOM.nextInt(PASSWORD_ALPHABET.length)]);
        }
        return sb.toString();
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private String csv(List<String> fields, List<Map<String, Object>> rows) {
        List<String> lines = new ArrayList<>();
        lines.add(String.join(",", fields));
        for (Map<String, Object> row : rows) {
            lines.add(fields.stream()
                .map(field -> csvCell(row.get(field)))
                .reduce((left, right) -> left + "," + right)
                .orElse(""));
        }
        return "\uFEFF" + String.join("\r\n", lines) + "\r\n";
    }

    private String csvCell(Object value) {
        String text = value == null ? "" : String.valueOf(value);
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> filters(Map<String, Object> params) {
        Object filters = params.get("filters");
        if (filters == null) {
            return Map.of();
        }
        if (filters instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((key, value) -> out.put(String.valueOf(key), value));
            return out;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EUC filters must be an object");
    }

    private void validateFilters(Map<String, Object> filters) {
        if (filters.isEmpty()) {
            return;
        }
        for (String key : filters.keySet()) {
            if (!FILTER_KEYS.contains(key)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported EUC filter: " + key);
            }
        }
        String sex = stringFilter(filters, "sex");
        if (sex != null && !SEX_VALUES.contains(sex)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EUC filter sex must be M, F or U");
        }
        validateDateRange(filters, "birthDateFrom", "birthDateTo", "birthDate");
        validateDateRange(filters, "movedInDateFrom", "movedInDateTo", "movedInDate");
    }

    private void validateDateRange(Map<String, Object> filters, String fromKey, String toKey, String label) {
        LocalDate from = dateFilter(filters, fromKey);
        LocalDate to = dateFilter(filters, toKey);
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EUC filter " + label + " range is invalid");
        }
    }

    private LocalDate dateFilter(Map<String, Object> filters, String key) {
        String value = stringFilter(filters, key);
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EUC filter " + key + " must be yyyy-MM-dd", e);
        }
    }

    private WhereClause whereClause(Map<String, Object> filters) {
        List<String> clauses = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        addEquals(clauses, args, filters, "residentId", "resident_id");
        addEquals(clauses, args, filters, "householdId", "household_id");
        addEquals(clauses, args, filters, "sex", "sex");
        addEquals(clauses, args, filters, "addressCode", "address_code");
        addEquals(clauses, args, filters, "nationality", "nationality");
        addDateLower(clauses, args, filters, "birthDateFrom", "birth_date");
        addDateUpper(clauses, args, filters, "birthDateTo", "birth_date");
        addDateLower(clauses, args, filters, "movedInDateFrom", "moved_in_date");
        addDateUpper(clauses, args, filters, "movedInDateTo", "moved_in_date");
        addLike(clauses, args, filters, "residentIdPrefix", "resident_id", false);
        addLike(clauses, args, filters, "nameContains", "family_name_kanji || ' ' || given_name_kanji", true);
        addLike(clauses, args, filters, "addressTextContains", "address_text", true);
        return clauses.isEmpty()
            ? new WhereClause("", List.of())
            : new WhereClause("\n               and " + String.join("\n               and ", clauses), args);
    }

    private void addEquals(List<String> clauses, List<Object> args, Map<String, Object> filters, String key, String column) {
        String value = stringFilter(filters, key);
        if (value == null) {
            return;
        }
        clauses.add(column + " = ?");
        args.add(value);
    }

    private void addDateLower(List<String> clauses, List<Object> args, Map<String, Object> filters, String key, String column) {
        String value = stringFilter(filters, key);
        if (value == null) {
            return;
        }
        clauses.add(column + " >= cast(? as date)");
        args.add(value);
    }

    private void addDateUpper(List<String> clauses, List<Object> args, Map<String, Object> filters, String key, String column) {
        String value = stringFilter(filters, key);
        if (value == null) {
            return;
        }
        clauses.add(column + " <= cast(? as date)");
        args.add(value);
    }

    private void addLike(List<String> clauses, List<Object> args, Map<String, Object> filters,
                         String key, String expression, boolean contains) {
        String value = stringFilter(filters, key);
        if (value == null) {
            return;
        }
        clauses.add(expression + " like ? escape '\\'");
        String escaped = escapeLike(value);
        args.add(contains ? "%" + escaped + "%" : escaped + "%");
    }

    private String stringFilter(Map<String, Object> filters, String key) {
        Object value = filters.get(key);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String escapeLike(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_");
    }

    private record WhereClause(String sql, List<Object> args) {}
}
