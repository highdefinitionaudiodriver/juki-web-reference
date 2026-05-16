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

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class HouseholdSplitMergeIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void split_movesSelectedMembersToNewHouseholdAndKeepsSourceOpen() throws Exception {
        seedHousehold("H-SPLIT", "R-S1", "東京都サンプル市分離前1-1",
            new String[][] {
                {"R-S1", "分離", "一郎", "本人"},
                {"R-S2", "分離", "二郎", "子"},
                {"R-S3", "分離", "三郎", "子"}
            });

        MvcResult res = mvc.perform(post("/api/v1/transactions/household")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "householdId":"H-SPLIT",
                      "operation":"SPLIT",
                      "newHeadResidentId":"R-S2",
                      "targetResidentIds":["R-S2"],
                      "newAddress":"東京都サンプル市分離後2-2",
                      "newAddressCode":"132010099001",
                      "eventDate":"2026-05-17"
                    }
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        String newHouseholdId = body.get("newHouseholdId").asText();
        assertThat(newHouseholdId).isNotBlank();

        assertThat(jdbc.queryForObject("select household_id from resident where resident_id = 'R-S2'", String.class))
            .isEqualTo(newHouseholdId);
        assertThat(jdbc.queryForObject("select household_id from resident where resident_id = 'R-S1'", String.class))
            .isEqualTo("H-SPLIT");
        assertThat(jdbc.queryForObject("select closed_date from household where household_id = 'H-SPLIT'", java.sql.Date.class))
            .isNull();
        assertThat(jdbc.queryForObject("""
            select count(*) from household_member
             where household_id = 'H-SPLIT' and resident_id = 'R-S2' and left_date = '2026-05-17'
            """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
            select count(*) from household_member
             where household_id = ? and resident_id = 'R-S2' and relation_to_head = '本人'
            """, Integer.class, newHouseholdId)).isEqualTo(1);
    }

    @Test
    void merge_movesAllSourceMembersAndClosesSourceHousehold() throws Exception {
        seedHousehold("H-MSRC", "R-M1", "東京都サンプル市合併元1-1",
            new String[][] {
                {"R-M1", "合併", "元一", "本人"},
                {"R-M2", "合併", "元二", "子"}
            });
        seedHousehold("H-MDST", "R-MH", "東京都サンプル市合併先9-9",
            new String[][] {
                {"R-MH", "合併", "先一", "本人"}
            });

        MvcResult res = mvc.perform(post("/api/v1/transactions/household")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "householdId":"H-MSRC",
                      "operation":"MERGE",
                      "absorbingHouseholdId":"H-MDST",
                      "eventDate":"2026-05-17"
                    }
                    """))
            .andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select closed_date from household where household_id = 'H-MSRC'", java.sql.Date.class))
            .isEqualTo(java.sql.Date.valueOf("2026-05-17"));
        assertThat(jdbc.queryForObject("select household_id from resident where resident_id = 'R-M1'", String.class))
            .isEqualTo("H-MDST");
        assertThat(jdbc.queryForObject("select household_id from resident where resident_id = 'R-M2'", String.class))
            .isEqualTo("H-MDST");
        assertThat(jdbc.queryForObject("""
            select count(*) from household_member
             where household_id = 'H-MSRC' and resident_id in ('R-M1','R-M2') and left_date = '2026-05-17'
            """, Integer.class)).isEqualTo(2);
    }

    private void seedHousehold(String householdId, String headResidentId, String address, String[][] members) {
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, ?, '2020-01-01')
            """, householdId, address);
        for (String[] member : members) {
            jdbc.update("""
                insert into resident
                  (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
                   birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
                values (?, ?, ?, ?, 'テスト', 'テスト', '1990-01-01', 'U', ?, '2020-01-01', false, ?)
                """, member[0], householdId, member[1], member[2], address, OffsetDateTime.now());
            jdbc.update("""
                insert into household_member (household_id, resident_id, relation_to_head, joined_date)
                values (?, ?, ?, '2020-01-01')
                """, householdId, member[0], member[3]);
        }
        jdbc.update("update household set head_resident_id = ? where household_id = ?", headResidentId, householdId);
    }
}
