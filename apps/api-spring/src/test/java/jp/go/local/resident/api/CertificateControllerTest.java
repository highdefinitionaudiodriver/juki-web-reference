package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jp.go.local.resident.service.CertificateIssueService;
import jp.go.local.resident.service.CertificatePdfService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;

/**
 * CertificateController の MockMvc 単体テスト。
 *
 * - 発行系: form_id ごとに CertificateIssueService が呼ばれることを確認
 * - /verify: 存在する/しないトークンで valid フラグの切替を確認
 * - /pdf: application/pdf レスポンスと Content-Disposition の確認
 */
@WebMvcTest(controllers = CertificateController.class)
@org.springframework.context.annotation.Import(CertificateControllerTest.MockBeans.class)
class CertificateControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CertificateIssueService certificateIssueService;
    @Autowired CertificatePdfService certificatePdfService;

    private static final String AUTH = "ADMIN";

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc, certificateIssueService, certificatePdfService);
        lenient().when(certificateIssueService.issue(any(), any(Authentication.class), anyString()))
            .thenAnswer(inv -> {
                Map<String, Object> body = inv.getArgument(0);
                String defaultFormId = inv.getArgument(2);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("issueId", "CI-1");
                result.put("formId", body.getOrDefault("formId", defaultFormId));
                result.put("verifyToken", "VTOKEN");
                result.put("fee", 300);
                return result;
            });
    }

    @Test
    void juminIssue_passes_formId_to_service() throws Exception {
        mvc.perform(post("/api/v1/certificates/jumin")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"R001\",\"formId\":\"0010003\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.issueId").value("CI-1"))
            .andExpect(jsonPath("$.formId").value("0010003"));
    }

    @Test
    void itemsIssue_uses_0010002_as_default() throws Exception {
        mvc.perform(post("/api/v1/certificates/items")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"R001\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.formId").value("0010002"));
    }

    @Test
    void removedIssue_uses_0010004() throws Exception {
        mvc.perform(post("/api/v1/certificates/removed")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.formId").value("0010004"));
    }

    @Test
    void inspectionIssue_uses_0010005() throws Exception {
        mvc.perform(post("/api/v1/certificates/inspection")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.formId").value("0010005"));
    }

    @Test
    void outIssue_uses_0010007() throws Exception {
        mvc.perform(post("/api/v1/certificates/out")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.formId").value("0010007"));
    }

    @Test
    void verify_existingToken_returns_valid_true() throws Exception {
        when(jdbc.queryForList(anyString(), org.mockito.ArgumentMatchers.eq("VTOKEN"))).thenReturn(
            List.of(Map.of("form_id", "0010001", "issued_at", "2026-05-17T00:00:00Z")));
        mvc.perform(get("/api/v1/verify/VTOKEN")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(true))
            .andExpect(jsonPath("$.formId").value("0010001"))
            .andExpect(jsonPath("$.issuerOffice").value("サンプル市 住民課"));
    }

    @Test
    void verify_unknownToken_returns_valid_false() throws Exception {
        when(jdbc.queryForList(anyString(), org.mockito.ArgumentMatchers.eq("UNKNOWN"))).thenReturn(List.of());
        mvc.perform(get("/api/v1/verify/UNKNOWN")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(false))
            .andExpect(jsonPath("$.formId").isEmpty());
    }

    @Test
    void pdf_returns_application_pdf_with_inline_disposition() throws Exception {
        byte[] fake = "%PDF-1.4\nfake\n%%EOF".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        when(certificatePdfService.render(anyLong())).thenReturn(fake);
        mvc.perform(get("/api/v1/certificates/42/pdf")
                .with(jwt().jwt(j -> j.claim("roles", List.of(AUTH)))))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PDF))
            .andExpect(header().string("Content-Disposition",
                org.hamcrest.Matchers.containsString("certificate-42.pdf")));
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean CertificateIssueService certificateIssueService() { return mock(CertificateIssueService.class); }
        @Bean CertificatePdfService certificatePdfService() { return mock(CertificatePdfService.class); }
    }
}
