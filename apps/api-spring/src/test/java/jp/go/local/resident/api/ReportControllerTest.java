package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import jp.go.local.resident.service.CertificateIssueService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;

/**
 * ReportController の MockMvc 単体テスト。
 *
 * DB コンテナなしで、年報受付・人口集計受付・在留期限満了通知・ジョブ照会の
 * API 形状を固定する。
 */
@WebMvcTest(controllers = ReportController.class)
@org.springframework.context.annotation.Import(ReportControllerTest.MockBeans.class)
class ReportControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CertificateIssueService certificateIssueService;

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc, certificateIssueService);
        lenient().when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("insert into report_request"),
                any(Object[].class))).thenReturn(Map.of("request_id", 42L));
        lenient().when(jdbc.queryForList(anyString(), any(LocalDate.class), any(LocalDate.class))).thenReturn(List.of());
        lenient().when(certificateIssueService.issue(any(), any(Authentication.class), anyString())).thenReturn(Map.of(
            "issueId", "CI-1",
            "formId", "0010012"
        ));
    }

    @Test
    void annual_returnsDoneJobWithTemplateResultUrl() throws Exception {
        mvc.perform(post("/api/v1/reports/annual")
                .with(jwt().jwt(j -> j.subject("user-1").claim("roles", List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"templateId\":\"annual-20-6\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.jobId").value("REPORT-42"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.progress").value(100))
            .andExpect(jsonPath("$.resultUrl").value("/reports/annual-20-6.xlsx"));
    }

    @Test
    void population_returnsQueuedJob() throws Exception {
        mvc.perform(post("/api/v1/reports/population")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"baseDate\":\"2026-05-17\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.jobId").value(org.hamcrest.Matchers.startsWith("POP-")))
            .andExpect(jsonPath("$.status").value("QUEUED"))
            .andExpect(jsonPath("$.progress").value(0))
            .andExpect(jsonPath("$.resultUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void foreignerExpiring_issues0010012ForEachTarget() throws Exception {
        when(jdbc.queryForList(anyString(), any(LocalDate.class), any(LocalDate.class))).thenReturn(List.of(
            Map.of("resident_id", "R001", "residence_period_end", LocalDate.parse("2026-06-01")),
            Map.of("resident_id", "R002", "residence_period_end", LocalDate.parse("2026-06-10"))
        ));

        mvc.perform(post("/api/v1/reports/foreigner-expiring")
                .with(jwt().jwt(j -> j.subject("user-1").claim("roles", List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"baseDate\":\"2026-05-17\",\"days\":30}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.targetCount").value(2))
            .andExpect(jsonPath("$.issuedCount").value(2))
            .andExpect(jsonPath("$.formId").value("0010012"));

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(certificateIssueService, org.mockito.Mockito.times(2))
            .issue(captor.capture(), any(Authentication.class), org.mockito.ArgumentMatchers.eq("0010012"));
        org.assertj.core.api.Assertions.assertThat(captor.getAllValues())
            .extracting(v -> v.get("residentId"))
            .containsExactly("R001", "R002");
    }

    @Test
    void show_returnsDoneJobById() throws Exception {
        mvc.perform(get("/api/v1/reports/JOB-1")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.jobId").value("JOB-1"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.resultUrl").value("/reports/JOB-1.xlsx"));
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean CertificateIssueService certificateIssueService() { return mock(CertificateIssueService.class); }
    }
}
