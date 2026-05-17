package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

/**
 * AdminController の MockMvc テスト。
 *
 * - クラスレベルの @PreAuthorize("hasRole('ADMIN')") を検証
 *   → @WebMvcTest 内では @EnableMethodSecurity を明示し、
 *     jwt().authorities("ROLE_*") で直接ロールを与える
 * - WINDOW ロールは 403
 * - ADMIN ロールでは users / roles の一覧と作成・権限設定が動く
 */
@WebMvcTest(controllers = AdminController.class)
@org.springframework.context.annotation.Import({AdminControllerTest.MockBeans.class, AdminControllerTest.MethodSecurityConfig.class})
class AdminControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc);
        lenient().when(jdbc.queryForList(anyString())).thenReturn(List.of(
            Map.of("user_id", "u1", "employee_no", "001", "department", "住民課", "full_name", "山田 太郎", "active", true)
        ));
    }

    @Test
    void users_get_withADMIN_returnsList() throws Exception {
        mvc.perform(get("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].user_id").value("u1"));
    }

    @Test
    void users_get_withWINDOW_returns403() throws Exception {
        mvc.perform(get("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_WINDOW"))))
            .andExpect(status().isForbidden());
    }

    @Test
    void roles_get_withADMIN_returnsList() throws Exception {
        when(jdbc.queryForList(anyString())).thenReturn(List.of(
            Map.of("role_id", "ADMIN", "name", "管理者", "description", "全権")
        ));
        mvc.perform(get("/api/v1/admin/roles")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].role_id").value("ADMIN"));
    }

    @Test
    void createUser_withADMIN_upserts() throws Exception {
        mvc.perform(post("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":"u-99","employeeNo":"99","department":"窓口","fullName":"テスト 太郎"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("u-99"));
        verify(jdbc).update(anyString(), any(), any(), any(), any());
    }

    @Test
    void createRole_withADMIN_upserts() throws Exception {
        mvc.perform(post("/api/v1/admin/roles")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"roleId":"REVIEW","name":"異動審査","description":"届出審査・職権起票"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.roleId").value("REVIEW"));
    }

    @Test
    void updatePermission_withADMIN_upserts() throws Exception {
        mvc.perform(post("/api/v1/admin/permissions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"roleId":"WINDOW","resource":"RESIDENT","action":"view","mask":"myNumber"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.roleId").value("WINDOW"))
            .andExpect(jsonPath("$.mask").value("myNumber"));
    }

    @Test
    void createUser_withWINDOW_returns403() throws Exception {
        mvc.perform(post("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_WINDOW")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":"x","employeeNo":"y","department":"z","fullName":"w"}
                    """))
            .andExpect(status().isForbidden());
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
    }

    @TestConfiguration
    @org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
    static class MethodSecurityConfig {
    }
}
