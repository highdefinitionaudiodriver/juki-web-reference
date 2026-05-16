package jp.go.local.resident;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 住民記録システム API（Spring Boot 3 / Java 21）
 * Codex 移行先。Node 版 apps/api と挙動互換にする。
 */
@SpringBootApplication
public class ResidentRecordApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(ResidentRecordApiApplication.class, args);
    }
}
