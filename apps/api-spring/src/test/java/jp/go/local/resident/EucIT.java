package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
            .isEqualTo("/euc/result.csv");
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

    private long requestId(JsonNode body) {
        return Long.parseLong(body.get("jobId").asText().replace("EUC-", ""));
    }

    private void seedUser(String userId) {
        jdbc.update("""
            insert into user_account (user_id, employee_no, department, full_name)
            values (?, 'EUC-001', '情報政策課', 'EUC 検証')
            """, userId);
    }
}
