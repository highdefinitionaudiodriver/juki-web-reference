package jp.go.local.resident.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * CI プロファイル（{@code spring.profiles.active=ci}）でのみ有効になる
 * 「認可無し」セキュリティ設定。
 *
 * 主に OpenAPI diff など、`/v3/api-docs` を取得するためだけに Spring を
 * 起動するワークフロー向け。本プロファイルでは:
 *  - すべてのリクエストを permitAll
 *  - JWT リソースサーバを構成しないため JWKS 取得は行わない
 *  - CSRF は無効
 *
 * 本番では絶対に有効化しないこと。プロダクション設定は `SecurityConfig` 側。
 */
@Configuration
@Profile("ci")
public class CiSecurityConfig {

    @Bean
    SecurityFilterChain ciSecurityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
