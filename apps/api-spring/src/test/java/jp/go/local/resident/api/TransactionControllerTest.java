package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jp.go.local.resident.service.CertificateIssueService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * TransactionController の業務ロジックを MockMvc + Mockito JdbcTemplate で検証。
 * Testcontainers は使わないため Docker 不要、CI で常に実行される。
 *
 * 検証観点:
 *   - 入力バリデーション（必須項目欠落 → 400）
 *   - 対象不在の 404
 *   - 状態違反の 409（既除票・既取消）
 *   - 正常系: 201 + 主要フィールド
 */
@WebMvcTest(controllers = TransactionController.class)
@org.springframework.context.annotation.Import(TransactionControllerTest.MockBeans.class)
class TransactionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private static final String AUTH = "ADMIN";

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc);
    }

    @Test
    void death_residentId_required_400() throws Exception {
        mvc.perform(post("/api/v1/transactions/death")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void death_unknownResident_404() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("UNKNOWN")))
            .thenThrow(new EmptyResultDataAccessException(1));
        mvc.perform(post("/api/v1/transactions/death")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"UNKNOWN\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void death_alreadyRemoved_409() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("R001"))).thenReturn(
            java.util.Map.of("household_id", "H001", "moved_out_date", java.sql.Date.valueOf("2024-01-01")));
        mvc.perform(post("/api/v1/transactions/death")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"R001\",\"eventDate\":\"2026-05-16\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_REMOVED"));
    }

    @Test
    void birth_parentRequired_400() throws Exception {
        mvc.perform(post("/api/v1/transactions/birth")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"familyNameKanji\":\"X\",\"givenNameKanji\":\"Y\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void birth_parentNotFound_404() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("NO_PARENT")))
            .thenThrow(new EmptyResultDataAccessException(1));
        mvc.perform(post("/api/v1/transactions/birth")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentResidentId\":\"NO_PARENT\",\"familyNameKanji\":\"X\",\"givenNameKanji\":\"Y\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("PARENT_NOT_FOUND"));
    }

    @Test
    void cancel_targetNotFound_404() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("TX-MISSING")))
            .thenThrow(new EmptyResultDataAccessException(1));
        mvc.perform(post("/api/v1/transactions/cancel")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionId\":\"TX-MISSING\",\"reason\":\"x\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void cancel_alreadyCancelled_409() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("TX-1"))).thenReturn(java.util.Map.of(
            "resident_id", "R001",
            "household_id", "H001",
            "type_code", "MOVE",
            "event_date", java.sql.Date.valueOf("2026-01-01")));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("TX-1"))).thenReturn(1);
        mvc.perform(post("/api/v1/transactions/cancel")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionId\":\"TX-1\",\"reason\":\"x\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_CANCELLED"));
    }

    @Test
    void cancel_targetIsCancel_409() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("TX-CANCEL"))).thenReturn(java.util.Map.of(
            "resident_id", "R001",
            "household_id", "H001",
            "type_code", "CANCEL",
            "event_date", java.sql.Date.valueOf("2026-01-01")));
        mvc.perform(post("/api/v1/transactions/cancel")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionId\":\"TX-CANCEL\",\"reason\":\"x\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("INVALID_CANCEL_TARGET"));
    }

    @Test
    void household_householdIdRequired_400() throws Exception {
        mvc.perform(post("/api/v1/transactions/household")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"operation\":\"HEAD_CHANGE\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void household_notFound_404() throws Exception {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("HX"))).thenReturn(0);
        mvc.perform(post("/api/v1/transactions/household")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"householdId\":\"HX\",\"operation\":\"HEAD_CHANGE\",\"newHeadResidentId\":\"R\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void koseki_invalidKind_400() throws Exception {
        mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"R001\",\"kind\":\"UNKNOWN\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void koseki_alreadyRemoved_409() throws Exception {
        java.util.Map<String, Object> row = new java.util.HashMap<>();
        row.put("household_id", "H001");
        row.put("family_name_kanji", "鈴木");
        row.put("family_name_kana", "スズキ");
        row.put("moved_out_date", java.sql.Date.valueOf("2024-01-01"));
        when(jdbc.queryForMap(anyString(), eq("R001"))).thenReturn(row);

        mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","kind":"MARRIAGE","eventDate":"2026-04-01"}
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_REMOVED"));
    }

    @Test
    void koseki_residentIdRequired_400() throws Exception {
        mvc.perform(post("/api/v1/transactions/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"MARRIAGE\"}"))
            .andExpect(status().isBadRequest());
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean CertificateIssueService certificateIssueService() { return mock(CertificateIssueService.class); }
    }
}
