package jp.go.local.resident.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class SecurityConfigTest {

    @Test
    void jwtAuthenticationConverter_mapsKeycloakRolesClaimToRoleAuthorities() {
        Jwt jwt = new Jwt(
            "token",
            Instant.parse("2026-05-17T00:00:00Z"),
            Instant.parse("2026-05-17T01:00:00Z"),
            Map.of("alg", "none"),
            Map.of(
                "sub", "admin-user",
                "roles", List.of("ADMIN", "RESTRICTION_RELEASE", "ROLE_REVIEW")
            )
        );

        JwtAuthenticationToken token =
            (JwtAuthenticationToken) new SecurityConfig().jwtAuthenticationConverter().convert(jwt);

        assertThat(token.getAuthorities())
            .extracting(Object::toString)
            .containsExactlyInAnyOrder("ROLE_ADMIN", "ROLE_RESTRICTION_RELEASE", "ROLE_REVIEW");
    }
}
