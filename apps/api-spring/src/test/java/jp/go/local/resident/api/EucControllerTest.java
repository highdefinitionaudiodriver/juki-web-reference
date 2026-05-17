package jp.go.local.resident.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * EucController の MockMvc テスト。
 *
 * 標準仕様書 10.1 EUC:
 *  - 個人番号が出力対象に含まれる場合、二段階承認が必要
 *  - includeMyNumber または outputFields に "myNumber" が含まれると QUEUED 状態
 *  - それ以外は DONE 状態
 */
@WebMvcTest(controllers = EucController.class)
@org.springframework.context.annotation.Import(EucControllerTest.MockBeans.class)
class EucControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(jdbc);
        lenient().when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("insert into report_request"),
                any(Object[].class))).thenReturn(Map.of("request_id", 42L));
    }

    @Test
    void query_withoutMyNumber_returnsDoneStatus() throws Exception {
        mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN"))))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId","name","addressText"]}
                    """))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.jobId").value("EUC-42"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.progress").value(100))
            .andExpect(jsonPath("$.resultUrl").value("/api/v1/euc/EUC-42/result.zip"))
            .andExpect(jsonPath("$.requiresSecondApproval").value(false));
    }

    @Test
    void query_withIncludeMyNumberFlag_returnsQueuedAndRequiresApproval() throws Exception {
        mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN"))))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId"],"includeMyNumber":true}
                    """))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("QUEUED"))
            .andExpect(jsonPath("$.progress").value(10))
            .andExpect(jsonPath("$.resultUrl").doesNotExist())
            .andExpect(jsonPath("$.requiresSecondApproval").value(true));
    }

    @Test
    void query_withMyNumberInOutputFields_alsoRequiresApproval() throws Exception {
        mvc.perform(post("/api/v1/euc/query")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN"))))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"outputFields":["residentId","myNumber"]}
                    """))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("QUEUED"))
            .andExpect(jsonPath("$.requiresSecondApproval").value(true));
    }

    @Test
    void download_doneJob_returnsZipWithCsv() throws Exception {
        when(jdbc.queryForMap(org.mockito.ArgumentMatchers.contains("from report_request"), eq(42L)))
            .thenReturn(Map.of(
                "status", "DONE",
                "params", "{\"outputFields\":[\"residentId\",\"name\",\"addressText\"]}"
            ));
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("from resident"))).thenReturn(List.of(
            Map.of("residentId", "R001", "name", "住民 太郎", "addressText", "東京都サンプル市1-1")
        ));

        byte[] body = mvc.perform(get("/api/v1/euc/EUC-42/result.zip")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsByteArray();

        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(body), StandardCharsets.UTF_8)) {
            org.assertj.core.api.Assertions.assertThat(zip.getNextEntry().getName()).isEqualTo("EUC-42-result.csv");
            String csv = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
            org.assertj.core.api.Assertions.assertThat(csv).contains("residentId,name,addressText");
            org.assertj.core.api.Assertions.assertThat(csv).contains("\"R001\",\"住民 太郎\",\"東京都サンプル市1-1\"");
        }
    }

    @Test
    void download_queuedJob_returns409() throws Exception {
        when(jdbc.queryForMap(anyString(), eq(43L))).thenReturn(Map.of(
            "status", "QUEUED",
            "params", "{\"outputFields\":[\"residentId\",\"myNumber\"],\"includeMyNumber\":true}"
        ));

        mvc.perform(get("/api/v1/euc/EUC-43/result.zip")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isConflict());
    }

    @TestConfiguration
    static class MockBeans {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
    }
}
