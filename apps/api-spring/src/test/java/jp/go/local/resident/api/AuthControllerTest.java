package jp.go.local.resident.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * AuthController の MockMvc 単体テスト。
 *
 * Spring 版は OIDC リソースサーバとして動くため、login は IdP 側へ委譲する。
 * ここでは OpenAPI 互換 endpoint の返却形だけを固定する。
 */
@WebMvcTest(controllers = AuthController.class)
class AuthControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void me_returnsJwtClaims() throws Exception {
        mvc.perform(get("/api/v1/me")
                .with(jwt().jwt(j -> j
                    .subject("user-1")
                    .claim("name", "山田 太郎")
                    .claim("department", "住民課")
                    .claim("roles", List.of("ADMIN", "REVIEW")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("user-1"))
            .andExpect(jsonPath("$.fullName").value("山田 太郎"))
            .andExpect(jsonPath("$.department").value("住民課"))
            .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
            .andExpect(jsonPath("$.roles[1]").value("REVIEW"));
    }

    @Test
    void login_returns501BecauseSpringDelegatesToIdp() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                .with(csrf())
                .with(jwt())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"u\",\"password\":\"p\"}"))
            .andExpect(status().isNotImplemented())
            .andExpect(jsonPath("$.code").value("NOT_IMPLEMENTED"));
    }

    @Test
    void logout_returns204() throws Exception {
        mvc.perform(post("/api/v1/auth/logout")
                .with(csrf())
                .with(jwt()))
            .andExpect(status().isNoContent());
    }
}
