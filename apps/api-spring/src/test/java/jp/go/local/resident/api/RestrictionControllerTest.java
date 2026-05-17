package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * RestrictionController の MockMvc テスト。
 *
 * 検証観点:
 *   - 抑止登録 (POST /restrictions) は RESTRICTION_RELEASE / ADMIN ロールのみ
 *   - WINDOW ロールから抑止登録すると 403
 *   - 抑止解除 (DELETE /restrictions/{id}) 不在は 404
 */
@WebMvcTest(controllers = RestrictionController.class)
@org.springframework.context.annotation.Import({RestrictionControllerTest.MockBeans.class, RestrictionControllerTest.MethodSecurityConfig.class})
class RestrictionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc);
        // 共通: insert ... returning は restriction_id=1 を返す
        lenient().when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("insert into restriction"),
                any(Object[].class))).thenReturn(new HashMap<>(Map.of("restriction_id", 1L)));
    }

    @Test
    void create_with_RESTRICTION_RELEASE_returns_201() throws Exception {
        mvc.perform(post("/api/v1/restrictions")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_RESTRICTION_RELEASE")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","category":"DV","startDate":"2026-05-01","scope":"SELF"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value("1"));
    }

    @Test
    void create_with_WINDOW_returns_403() throws Exception {
        mvc.perform(post("/api/v1/restrictions")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_WINDOW")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","category":"DV","startDate":"2026-05-01","scope":"SELF"}
                    """))
            .andExpect(status().isForbidden());
    }

    @Test
    void create_with_ADMIN_returns_201() throws Exception {
        mvc.perform(post("/api/v1/restrictions")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","category":"STALKER","startDate":"2026-05-01","scope":"HOUSEHOLD"}
                    """))
            .andExpect(status().isCreated());
    }

    @Test
    void release_unknownId_returns_404() throws Exception {
        when(jdbc.queryForList(anyString(), eq(999L))).thenReturn(List.of());
        mvc.perform(delete("/api/v1/restrictions/999")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_RESTRICTION_RELEASE"))))
            .andExpect(status().isNotFound());
    }

    @Test
    void release_with_WINDOW_returns_403() throws Exception {
        mvc.perform(delete("/api/v1/restrictions/1")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_WINDOW"))))
            .andExpect(status().isForbidden());
    }

    @Test
    void release_existingId_returns_204() throws Exception {
        when(jdbc.queryForList(anyString(), eq(1L)))
            .thenReturn(List.of(Map.of("resident_id", "R001")));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("R001"))).thenReturn(0);
        mvc.perform(delete("/api/v1/restrictions/1")
                .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andExpect(status().isNoContent());
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
    }

    /** WebMvcTest はメソッド級認可を読み込まないので、ここで明示的に有効化する。 */
    @TestConfiguration
    @org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
    static class MethodSecurityConfig {
    }
}
