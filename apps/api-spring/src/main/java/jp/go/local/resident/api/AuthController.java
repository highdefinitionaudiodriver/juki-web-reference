package jp.go.local.resident.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * 認証エンドポイント。
 *
 * Spring 側はリソースサーバ構成のため、本来の認証は IdP (Keycloak など) 側で処理する。
 * このコントローラは OpenAPI 仕様 (`c_openapi.yaml`) との互換性および
 * dev 環境で Web/Node 経路と同じ形のレスポンスを返すための薄いスタブ。
 *
 * - POST /auth/login: dev のみ。本番では IdP 側で発行されるため 501 を返す
 * - POST /auth/logout: 204 を返す（クライアント側でトークン破棄）
 * - GET  /me: 認証済 JWT クレームから自身の情報を返す
 */
@RestController
@RequestMapping("/api/v1")
public class AuthController {

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody(required = false) Map<String, Object> body) {
        // 本番では IdP 経由でアクセストークンを取得すべき。Spring 側はそれを検証するだけ。
        // dev 用に互換レスポンスを返したい場合は Node 側 (apps/api) を使うこと。
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("code", "NOT_IMPLEMENTED");
        response.put("message", "Spring 版ではログインは IdP（Keycloak 等）で発行してください。");
        return ResponseEntity.status(501).body(response);
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout() {
        // ステートレス JWT のため、サーバ側で破棄するものは無い。クライアントがトークンを忘却するだけ。
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        Map<String, Object> response = new LinkedHashMap<>();
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            response.put("userId", jwt.getSubject());
            response.put("fullName", jwt.getClaimAsString("name"));
            response.put("department", jwt.getClaimAsString("department"));
            List<String> roles = jwt.getClaimAsStringList("roles");
            response.put("roles", roles == null ? List.of() : roles);
        } else {
            response.put("userId", null);
            response.put("fullName", null);
            response.put("department", null);
            response.put("roles", List.of());
        }
        return response;
    }
}
