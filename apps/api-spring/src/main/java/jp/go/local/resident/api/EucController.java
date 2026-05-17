package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
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
        "addressText", "address_text",
        "birthDate", "birth_date::text",
        "sex", "sex",
        "householdId", "household_id"
    );

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
        byte[] zip = zipCsv(jobId, fields);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(jobId + "-result.zip").build().toString())
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

    private byte[] zipCsv(String jobId, List<String> fields) {
        String select = fields.stream()
            .map(field -> FIELD_EXPRESSIONS.get(field) + " as \"" + field + "\"")
            .reduce((left, right) -> left + ", " + right)
            .orElse("resident_id as \"residentId\"");
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select %s
              from resident
             where moved_out_date is null
               and restricted_flag = false
             order by resident_id
             limit 1000
            """.formatted(select));

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            zip.setComment("password-protected-delivery-required");
            zip.putNextEntry(new ZipEntry(jobId + "-result.csv"));
            zip.write(csv(fields, rows).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        } catch (IOException e) {
            throw new UncheckedIOException("EUC ZIP generation failed", e);
        }
        return bytes.toByteArray();
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
}
