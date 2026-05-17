package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
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
 * RestrictionController の Testcontainers IT。
 * 抑止登録/解除が restriction と resident.restricted_flag の双方へ反映されることを検証する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class RestrictionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void createRestriction_setsResidentRestrictedFlag() throws Exception {
        String residentId = "R-REST-CREATE-" + System.currentTimeMillis();
        seedResident(residentId);

        MvcResult res = mvc.perform(post("/api/v1/restrictions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_RESTRICTION_RELEASE")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"%s","category":"DV","startDate":"2026-05-17","scope":"SELF","note":"IT create"}
                    """.formatted(residentId)))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("id").asText()).isNotBlank();
        assertThat(jdbc.queryForObject(
            "select restricted_flag from resident where resident_id = ?", Boolean.class, residentId))
            .isTrue();
        assertThat(jdbc.queryForObject(
            "select count(*) from restriction where resident_id = ? and category = 'DV'",
            Integer.class, residentId)).isEqualTo(1);
    }

    @Test
    void releaseRestriction_clearsResidentRestrictedFlagWhenNoActiveRestrictionsRemain() throws Exception {
        String residentId = "R-REST-REL-" + System.currentTimeMillis();
        seedResident(residentId);

        MvcResult create = mvc.perform(post("/api/v1/restrictions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"%s","category":"DV","startDate":"2026-05-17","scope":"SELF","note":"IT release"}
                    """.formatted(residentId)))
            .andReturn();
        JsonNode createBody = objectMapper.readTree(create.getResponse().getContentAsString());
        String restrictionId = createBody.get("id").asText();

        mvc.perform(delete("/api/v1/restrictions/{id}", restrictionId)
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf()))
            .andExpect(result -> assertThat(result.getResponse().getStatus()).isEqualTo(204));

        assertThat(jdbc.queryForObject(
            "select restricted_flag from resident where resident_id = ?", Boolean.class, residentId))
            .isFalse();
        assertThat(jdbc.queryForObject(
            "select end_date is not null from restriction where restriction_id = ?",
            Boolean.class, Long.parseLong(restrictionId))).isTrue();
    }

    private void seedResident(String residentId) {
        String householdId = "H-" + residentId;
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, '東京都サンプル市抑止1-1', '2020-01-01')
            """, householdId);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
            values (?, ?, '抑止', '検証', 'ヨクシ', 'ケンショウ',
                    '1990-01-01', 'U', '東京都サンプル市抑止1-1', '2020-01-01', false, ?)
            """, residentId, householdId, OffsetDateTime.now());
        jdbc.update("update household set head_resident_id = ? where household_id = ?", residentId, householdId);
    }
}
