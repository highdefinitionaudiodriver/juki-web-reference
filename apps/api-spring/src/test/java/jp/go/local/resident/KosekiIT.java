package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
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
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * /transactions/koseki の完全網羅 Testcontainers IT。
 *
 * シナリオ:
 *  - 婚姻改氏 (MARRIAGE + newFamilyNameKanji)
 *  - 離婚復氏 (DIVORCE + newFamilyNameKanji)
 *  - 養子縁組 (ADOPTION)
 *  - 除票済み住民への戸籍連動 → 409 ALREADY_REMOVED
 *  - kind 不正 → 400 VALIDATION_ERROR
 *
 * Docker 不在環境では skip。CI (Linux runner) で実行される。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class KosekiIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void marriage_updatesFamilyName_andEmitsKosekiMarriageReason() throws Exception {
        seedResident("R-K1", "鈴木", "太郎", "スズキ", "タロウ", "H-K1", false);

        MvcResult res = mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "residentId":"R-K1",
                      "kind":"MARRIAGE",
                      "eventDate":"2026-04-01",
                      "newFamilyNameKanji":"山田",
                      "newFamilyNameKana":"ヤマダ",
                      "kosekiNoticeId":"KSN-001"
                    }
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("typeCode").asText()).isEqualTo("KOSEKI");
        assertThat(body.get("reasonCode").asText()).isEqualTo("KOSEKI_MARRIAGE");
        assertThat(body.get("familyNameChanged").asBoolean()).isTrue();
        assertThat(body.get("oldFamilyNameKanji").asText()).isEqualTo("鈴木");
        assertThat(body.get("newFamilyNameKanji").asText()).isEqualTo("山田");
        assertThat(body.get("kosekiNoticeId").asText()).isEqualTo("KSN-001");

        // 永続化された氏が山田に更新されている
        assertThat(jdbc.queryForObject(
            "select family_name_kanji from resident where resident_id = 'R-K1'", String.class))
            .isEqualTo("山田");
        assertThat(jdbc.queryForObject(
            "select family_name_kana from resident where resident_id = 'R-K1'", String.class))
            .isEqualTo("ヤマダ");
    }

    @Test
    void divorce_restoresFormerFamilyName() throws Exception {
        seedResident("R-K2", "山田", "花子", "ヤマダ", "ハナコ", "H-K2", false);

        MvcResult res = mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "residentId":"R-K2",
                      "kind":"DIVORCE",
                      "eventDate":"2026-04-15",
                      "newFamilyNameKanji":"佐藤",
                      "newFamilyNameKana":"サトウ"
                    }
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("reasonCode").asText()).isEqualTo("KOSEKI_DIVORCE");
        assertThat(jdbc.queryForObject(
            "select family_name_kanji from resident where resident_id = 'R-K2'", String.class))
            .isEqualTo("佐藤");
    }

    @Test
    void adoption_recordsTransactionWithoutNameChange() throws Exception {
        seedResident("R-K3", "中村", "三郎", "ナカムラ", "サブロウ", "H-K3", false);

        MvcResult res = mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "residentId":"R-K3",
                      "kind":"ADOPTION",
                      "eventDate":"2026-05-01"
                    }
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("reasonCode").asText()).isEqualTo("KOSEKI_ADOPTION");
        // newFamilyNameKanji 指定なしなので変更フラグは無い
        assertThat(body.has("familyNameChanged")).isFalse();
        assertThat(jdbc.queryForObject(
            "select family_name_kanji from resident where resident_id = 'R-K3'", String.class))
            .isEqualTo("中村");

        // transaction レコードが永続化されている
        Integer txCount = jdbc.queryForObject(
            "select count(*) from transaction where resident_id = 'R-K3' and type_code = 'KOSEKI' and reason_code = 'KOSEKI_ADOPTION'",
            Integer.class);
        assertThat(txCount).isEqualTo(1);
    }

    @Test
    void koseki_alreadyRemoved_returns409() throws Exception {
        // 除票済み住民
        seedResident("R-K4", "退場", "者", "タイジョウ", "シャ", "H-K4", true);

        MvcResult res = mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R-K4","kind":"MARRIAGE","eventDate":"2026-04-01"}
                    """))
            .andReturn();
        assertThat(res.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("code").asText()).isEqualTo("ALREADY_REMOVED");
    }

    @Test
    void koseki_invalidKind_returns400() throws Exception {
        seedResident("R-K5", "鈴木", "五郎", "スズキ", "ゴロウ", "H-K5", false);

        MvcResult res = mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R-K5","kind":"BADKIND"}
                    """))
            .andReturn();
        assertThat(res.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    }

    private void seedResident(String residentId, String familyKanji, String givenKanji,
                               String familyKana, String givenKana, String householdId, boolean removed) {
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, '東京都サンプル市1-1', '2020-01-01')
            on conflict (household_id) do nothing
            """, householdId);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji,
               family_name_kana, given_name_kana, birth_date, sex,
               address_text, moved_in_date, moved_out_date, restricted_flag, valid_from)
            values (?, ?, ?, ?, ?, ?, '1990-01-01', 'U',
                    '東京都サンプル市1-1', '2020-01-01', ?, false, ?)
            """, residentId, householdId, familyKanji, givenKanji, familyKana, givenKana,
            removed ? java.sql.Date.valueOf("2024-12-31") : null,
            OffsetDateTime.now());
    }
}
