package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
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
 * LinkController の業務分岐 (CS/NUMBER/TAX/INSURANCE/ELECTION) の MockMvc テスト。
 */
@WebMvcTest(controllers = {LinkController.class, TransactionController.class})
@org.springframework.context.annotation.Import(LinkControllerTest.MockBeans.class)
class LinkControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private static final String AUTH = "ADMIN";

    @BeforeEach
    void setup() {
        org.mockito.Mockito.reset(jdbc);
        // 共通: link_event insert は常に event_id=1 を返す
        lenient().when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("insert into link_event"),
                any(Object[].class))).thenAnswer(invocation ->
                    new java.util.HashMap<>(java.util.Map.of("event_id", 1L)));
    }

    @Test
    void cs_inbound_match_returns_200_MATCH() throws Exception {
        var row = new HashMap<String, Object>();
        row.put("resident_id", "R001");
        row.put("family_name_kanji", "山田");
        row.put("given_name_kanji", "太郎");
        row.put("family_name_kana", "ヤマダ");
        row.put("given_name_kana", "タロウ");
        row.put("birth_date", "1985-04-01");
        row.put("sex", "M");
        row.put("address_text", "東京都サンプル市1-1");
        row.put("household_id", "H001");
        row.put("moved_out_date", null);
        when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("from resident"), eq("R001"))).thenReturn(row);

        mvc.perform(post("/api/v1/link/cs/inbound")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001",
                     "fourInfo":{"name":"山田 太郎","birthDate":"1985-04-01","sex":"M","addressText":"東京都サンプル市1-1"}}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("MATCH"))
            .andExpect(jsonPath("$.matched").value(true));
    }

    @Test
    void cs_inbound_residentNotFound_404() throws Exception {
        when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("from resident"), eq("NO")))
            .thenThrow(new EmptyResultDataAccessException(1));
        mvc.perform(post("/api/v1/link/cs/inbound")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"NO\",\"fourInfo\":{\"name\":\"X\"}}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.status").value("NOT_FOUND"));
    }

    @Test
    void number_inbound_issueLink_returns_symbol() throws Exception {
        mvc.perform(post("/api/v1/link/number/inbound")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"operation\":\"ISSUE_LINK\",\"residentId\":\"R001\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPLIED"))
            .andExpect(jsonPath("$.symbol").exists());
    }

    @Test
    void internal_tax_provides_filtered_four_info() throws Exception {
        var row = new HashMap<String, Object>();
        row.put("resident_id", "R001");
        row.put("family_name_kanji", "山田");
        row.put("given_name_kanji", "太郎");
        row.put("birth_date", "1985-04-01");
        row.put("sex", "M");
        row.put("address_text", "東京都サンプル市1-1");
        row.put("household_id", "H001");
        when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("from resident"), eq("R001"))).thenReturn(row);

        mvc.perform(post("/api/v1/link/internal/tax")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentIds\":[\"R001\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.partnerId").value("TAX"))
            .andExpect(jsonPath("$.status").value("APPLIED"))
            .andExpect(jsonPath("$.count").value(1))
            .andExpect(jsonPath("$.residents[0].residentId").value("R001"));
    }

    @Test
    void internal_tax_missing_residentIds_400() throws Exception {
        mvc.perform(post("/api/v1/link/internal/tax")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void internal_cvs_accept_202() throws Exception {
        mvc.perform(post("/api/v1/link/internal/cvs")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"anything\":\"ok\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.partnerId").value("CVS"))
            .andExpect(jsonPath("$.status").value("ACCEPTED"));
    }

    @Test
    void internal_koseki_noticeType_required_400() throws Exception {
        mvc.perform(post("/api/v1/link/internal/koseki")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
        @Bean CertificateIssueService certificateIssueService() { return mock(CertificateIssueService.class); }
        @Bean org.springframework.context.ApplicationEventPublisher eventPublisher() {
            return mock(org.springframework.context.ApplicationEventPublisher.class);
        }
    }
}
