package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
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

@WebMvcTest(controllers = ResidentSupplementController.class)
@org.springframework.context.annotation.Import(ResidentSupplementControllerTest.MockBeans.class)
class ResidentSupplementControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CertificateIssueService certificateIssueService;

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc, certificateIssueService);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(1);
        when(certificateIssueService.issue(any(), any(), anyString())).thenReturn(Map.of(
            "issueId", "10",
            "formId", "0010009",
            "verifyToken", "VTEST",
            "pdfUrl", "/api/v1/certificates/10/pdf"
        ));
    }

    @Test
    void jumin_issue_createsNotificationCertificate() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("R001"))).thenThrow(new EmptyResultDataAccessException(1));

        mvc.perform(post("/api/v1/codes/jumin")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","operation":"ISSUE","code":"12345678901"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.residentId").value("R001"))
            .andExpect(jsonPath("$.operation").value("ISSUE"))
            .andExpect(jsonPath("$.juminCode").value("12345678901"))
            .andExpect(jsonPath("$.certificate.issueId").value("10"));
    }

    @Test
    void myNumber_change_requiresCurrentCode() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("R001"))).thenThrow(new EmptyResultDataAccessException(1));

        mvc.perform(post("/api/v1/codes/mynumber")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","operation":"CHANGE","number":"123456789018"}
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CURRENT_CODE_NOT_FOUND"));
    }

    @Test
    void jumin_invalidCodeLength_400() throws Exception {
        when(jdbc.queryForMap(anyString(), eq("R001"))).thenThrow(new EmptyResultDataAccessException(1));

        mvc.perform(post("/api/v1/codes/jumin")
                .with(jwt().jwt(j -> j.claim("roles", java.util.List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"R001","operation":"ISSUE","code":"123"}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean CertificateIssueService certificateIssueService() { return mock(CertificateIssueService.class); }
    }
}
