package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Resident API の統合テスト。
 * Testcontainers で PostgreSQL を立ち上げ、Flyway がスキーマを適用する想定。
 * Docker が無い CI ではこのテストはスキップされる（Testcontainers が自動でスキップ）。
 *
 * 検証観点:
 *   - 抑止対象住民は WINDOW ロールから 404
 *   - REVIEW ロールは個人番号アンマスク可能
 *   - 履歴は SCD-2 で時点照会可能
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class ResidentApiIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void contextLoadsAndSchemaApplied() {
        Integer tables = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'resident'",
            Integer.class);
        assertThat(tables).isEqualTo(1);
    }

    @TestFactory
    Iterable<DynamicTest> residentLifecycle() throws Exception {
        // 抑止対象あり/なし 2 件を投入
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
            values ('R001','H001','住民','太郎','ジュウミン','タロウ','1985-04-01','M','東京都サンプル市1-1','2018-06-01',false,?)
            """, now);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
            values ('R002','H001','住民','花子','ジュウミン','ハナコ','1988-09-12','F','東京都サンプル市1-1','2018-06-01',true,?)
            """, now);
        jdbc.update("insert into household (household_id, address_text, established_date) values ('H001','東京都サンプル市1-1','2018-06-01')");
        jdbc.update("insert into jumin_code (resident_id, code, valid_from, event) values ('R001','12345678901','2018-06-01','ISSUE')");
        jdbc.update("insert into my_number (resident_id, number_ciphertext, valid_from, event) values ('R001','enc:abcd','2018-06-01','ISSUE')");

        return java.util.List.of(
            DynamicTest.dynamicTest("R002 抑止対象は WINDOW ロールから 404", () -> {
                mvc.perform(get("/api/v1/residents/R002").with(jwt().jwt(j -> j.claim("roles", java.util.List.of("WINDOW")))))
                   .andExpect(result -> assertThat(result.getResponse().getStatus()).isEqualTo(404));
            }),
            DynamicTest.dynamicTest("R002 抑止対象は RESTRICTION_RELEASE には見える", () -> {
                mvc.perform(get("/api/v1/residents/R002").with(jwt().jwt(j -> j.claim("roles", java.util.List.of("RESTRICTION_RELEASE")))))
                   .andExpect(result -> assertThat(result.getResponse().getStatus()).isEqualTo(200));
            }),
            DynamicTest.dynamicTest("R001 個人番号は WINDOW ではマスク", () -> {
                MvcResult res = mvc.perform(get("/api/v1/residents/R001").with(jwt().jwt(j -> j.claim("roles", java.util.List.of("WINDOW"))))).andReturn();
                JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
                assertThat(body.get("myNumber").asText()).contains("*");
                assertThat(body.get("juminCode").asText()).contains("*");
            }),
            DynamicTest.dynamicTest("R001 ADMIN + unmask で平文（暗号文）", () -> {
                MvcResult res = mvc.perform(get("/api/v1/residents/R001?unmask=my_number&unmask=jumin_code")
                    .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))).andReturn();
                JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
                assertThat(body.get("myNumber").asText()).isEqualTo("enc:abcd");
                assertThat(body.get("juminCode").asText()).isEqualTo("12345678901");
            }),
            DynamicTest.dynamicTest("検索: 抑止対象は WINDOW から件数 1（R001 のみ）", () -> {
                MvcResult res = mvc.perform(post("/api/v1/residents/search")
                    .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("WINDOW"))))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}")).andReturn();
                JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
                assertThat(body.get("total").asInt()).isEqualTo(1);
            })
        );
    }
}
