package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * EucController の Testcontainers IT。
 * EUC 依頼が report_request に保存され、個人番号含有時は二段階承認待ちになることを検証する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class EucIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void queryWithoutMyNumber_persistsDoneRequest() throws Exception {
        String userId = "euc-user-done-" + System.currentTimeMillis();
        seedUser(userId);

        MvcResult res = mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId","name","addressText"]}
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(202);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        long requestId = requestId(body);
        assertThat(body.get("status").asText()).isEqualTo("DONE");
        assertThat(body.get("requiresSecondApproval").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject(
            "select status from report_request where request_id = ?", String.class, requestId))
            .isEqualTo("DONE");
        assertThat(jdbc.queryForObject(
            "select result_url from report_request where request_id = ?", String.class, requestId))
            .isEqualTo("/api/v1/euc/EUC-" + requestId + "/result.zip");
        assertThat(jdbc.queryForObject(
            "select params -> 'outputFields' ->> 0 from report_request where request_id = ?",
            String.class, requestId)).isEqualTo("residentId");
    }

    @Test
    void queryWithMyNumber_persistsQueuedRequestForSecondApproval() throws Exception {
        String userId = "euc-user-queued-" + System.currentTimeMillis();
        seedUser(userId);

        MvcResult res = mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId","myNumber"],"includeMyNumber":true}
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(202);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        long requestId = requestId(body);
        assertThat(body.get("status").asText()).isEqualTo("QUEUED");
        assertThat(body.get("requiresSecondApproval").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject(
            "select status from report_request where request_id = ?", String.class, requestId))
            .isEqualTo("QUEUED");
        assertThat(jdbc.queryForObject(
            "select result_url from report_request where request_id = ?", String.class, requestId))
            .isNull();
        assertThat(jdbc.queryForObject(
            "select params ->> 'includeMyNumber' from report_request where request_id = ?",
            String.class, requestId)).isEqualTo("true");
    }

    @Test
    void downloadDoneRequest_returnsZipCsvFromResidentRows() throws Exception {
        String userId = "euc-user-download-" + System.currentTimeMillis();
        String residentId = "R-EUC-" + System.currentTimeMillis();
        seedUser(userId);
        seedResident(residentId);

        MvcResult res = mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId","name","addressText"]}
                    """))
            .andReturn();
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());

        MvcResult zipRes = mvc.perform(get("/api/v1/euc/{jobId}/result.zip", body.get("jobId").asText())
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andReturn();

        assertThat(zipRes.getResponse().getStatus()).isEqualTo(200);
        assertThat(zipRes.getResponse().getContentType()).isEqualTo("application/zip");
        try (ZipInputStream zip = new ZipInputStream(
                new java.io.ByteArrayInputStream(zipRes.getResponse().getContentAsByteArray()), StandardCharsets.UTF_8)) {
            assertThat(zip.getNextEntry().getName()).endsWith("-result.csv");
            String csv = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(csv).contains("residentId,name,addressText");
            assertThat(csv).contains(residentId);
            assertThat(csv).contains("EUC 検証");
        }
    }

    private long requestId(JsonNode body) {
        return Long.parseLong(body.get("jobId").asText().replace("EUC-", ""));
    }

    private void seedUser(String userId) {
        jdbc.update("""
            insert into user_account (user_id, employee_no, department, full_name)
            values (?, 'EUC-001', '情報政策課', 'EUC 検証')
            """, userId);
    }

    private void seedResident(String residentId) {
        String householdId = "H-" + residentId;
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, '東京都サンプル市EUC1-1', '2020-01-01')
            """, householdId);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
            values (?, ?, 'EUC', '検証', 'イーユーシー', 'ケンショウ',
                    '1990-01-01', 'U', '東京都サンプル市EUC1-1', '2020-01-01', false, ?)
            """, residentId, householdId, OffsetDateTime.now());
        jdbc.update("update household set head_resident_id = ? where household_id = ?", residentId, householdId);
    }
}
