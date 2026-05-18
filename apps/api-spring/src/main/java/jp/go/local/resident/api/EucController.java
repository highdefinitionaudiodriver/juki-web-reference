package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    @PostMapping("/query")
    public ResponseEntity<Map<String, Object>> query(@RequestBody Map<String, Object> body,
                                                     Authentication authentication) {
        Map<String, Object> requestBody = body == null ? Map.of() : body;
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
                select status, params
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
