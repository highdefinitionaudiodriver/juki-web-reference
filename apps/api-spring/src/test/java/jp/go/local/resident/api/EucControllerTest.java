package jp.go.local.resident.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
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
class EucControllerTest {

    @Autowired MockMvc mvc;

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
            .andExpect(jsonPath("$.jobId").exists())
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.progress").value(100))
            .andExpect(jsonPath("$.resultUrl").value("/euc/result.csv"))
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
}
