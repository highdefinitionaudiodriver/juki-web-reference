package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * AdminController の Testcontainers IT。
 * 実 PostgreSQL に対し user_account / role / permission への永続化を検証する。
 *
 * Docker 不在環境では skip（@Testcontainers(disabledWithoutDocker = true)）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class AdminIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void createUser_persistsAndListIncludesIt() throws Exception {
        String userId = "u-it-" + System.currentTimeMillis();
        mvc.perform(post("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":"%s","employeeNo":"E99","department":"テスト課","fullName":"IT 太郎"}
                    """.formatted(userId)))
            .andExpect(result -> assertThat(result.getResponse().getStatus()).isEqualTo(200));

        // 永続化確認
        Integer cnt = jdbc.queryForObject(
            "select count(*) from user_account where user_id = ?", Integer.class, userId);
        assertThat(cnt).isEqualTo(1);
        String fullName = jdbc.queryForObject(
            "select full_name from user_account where user_id = ?", String.class, userId);
        assertThat(fullName).isEqualTo("IT 太郎");

        // 一覧 GET にも含まれる
        MvcResult res = mvc.perform(get("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andReturn();
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        boolean found = false;
        for (JsonNode row : body) {
            if (userId.equals(row.get("user_id").asText())) {
                found = true;
                break;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void createUser_upsertsOnConflict() throws Exception {
        String userId = "u-upsert-" + System.currentTimeMillis();
        // 1 回目
        mvc.perform(post("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":"%s","employeeNo":"A","department":"X","fullName":"First"}
                    """.formatted(userId)));
        // 2 回目で上書き
        mvc.perform(post("/api/v1/admin/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":"%s","employeeNo":"B","department":"Y","fullName":"Second"}
                    """.formatted(userId)));
        String fullName = jdbc.queryForObject(
            "select full_name from user_account where user_id = ?", String.class, userId);
        assertThat(fullName).isEqualTo("Second");
    }

    @Test
    void createRole_persistsAndListIncludesIt() throws Exception {
        String roleId = "ROLE_IT_" + System.currentTimeMillis();
        mvc.perform(post("/api/v1/admin/roles")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"roleId":"%s","name":"IT ロール","description":"テスト用"}
                    """.formatted(roleId)));
        Integer cnt = jdbc.queryForObject(
            "select count(*) from role where role_id = ?", Integer.class, roleId);
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void updatePermission_persistsAndUpserts() throws Exception {
        String roleId = "ROLE_PERM_" + System.currentTimeMillis();
        // role を先に作っておく（FK 制約があれば）
        jdbc.update("""
            insert into role (role_id, name, description) values (?, 'perm-test', 'perm-test')
            on conflict (role_id) do nothing
            """, roleId);

        // 1 回目
        mvc.perform(post("/api/v1/admin/permissions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"roleId":"%s","resource":"RESIDENT","action":"view","mask":"myNumber"}
                    """.formatted(roleId)));
        String mask = jdbc.queryForObject(
            "select mask from permission where role_id = ? and resource = ? and action = ?",
            String.class, roleId, "RESIDENT", "view");
        assertThat(mask).isEqualTo("myNumber");

        // 上書き
        mvc.perform(post("/api/v1/admin/permissions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"roleId":"%s","resource":"RESIDENT","action":"view","mask":"juminCode"}
                    """.formatted(roleId)));
        String updated = jdbc.queryForObject(
            "select mask from permission where role_id = ? and resource = ? and action = ?",
            String.class, roleId, "RESIDENT", "view");
        assertThat(updated).isEqualTo("juminCode");
    }
}
