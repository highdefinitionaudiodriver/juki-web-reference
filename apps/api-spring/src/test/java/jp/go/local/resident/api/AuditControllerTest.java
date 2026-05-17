package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * AuditController の MockMvc テスト。
 * /audit はメソッドレベルの @PreAuthorize なしだが、本番 SecurityConfig で
 * 認証必須。@WebMvcTest 内では permitAll で動くので、jwt() を付けて呼ぶ。
 */
@WebMvcTest(controllers = AuditController.class)
@org.springframework.context.annotation.Import(AuditControllerTest.MockBeans.class)
class AuditControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void list_returnsAuditLogs() throws Exception {
        when(jdbc.queryForList(anyString())).thenReturn(List.of(
            Map.of(
                "log_id", 1,
                "user_id", "u-test",
                "ip", "127.0.0.1",
                "action", "VIEW",
                "resource_type", "RESIDENT",
                "resource_id", "R-001",
                "occurred_at", "2026-05-17T00:00:00Z",
                "details", "{}"
            )
        ));
        mvc.perform(get("/api/v1/audit")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].log_id").value(1))
            .andExpect(jsonPath("$[0].action").value("VIEW"))
            .andExpect(jsonPath("$[0].resource_id").value("R-001"));
    }

    @Test
    void list_emptyResult_returns200WithEmptyArray() throws Exception {
        when(jdbc.queryForList(anyString())).thenReturn(List.of());
        mvc.perform(get("/api/v1/audit")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
    }
}
