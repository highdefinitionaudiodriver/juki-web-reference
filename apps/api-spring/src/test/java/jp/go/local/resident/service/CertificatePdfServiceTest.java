package jp.go.local.resident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * CertificatePdfService の単体テスト。
 * OpenHTMLtoPDF で実バイト列を生成するため、検証は「PDF マジックバイトで始まる／EOF を含む／
 * 一定サイズ以上」の 3 点に絞る。文字埋め込みの検証は ResidentApiIT（Testcontainers）側で行う。
 */
class CertificatePdfServiceTest {

    @Test
    void rendersPdfFromIssuedCertificate() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        // certificate_issue
        lenient().when(jdbc.queryForMap(anyString(), org.mockito.ArgumentMatchers.eq(10L))).thenReturn(Map.of(
            "issue_id", 10L,
            "resident_id", "R001",
            "form_id", "0010001",
            "copies", 1,
            "fee", 300,
            "verify_token", "VTESTTOKEN",
            "issued_at", Timestamp.from(Instant.parse("2026-05-16T09:00:00Z")),
            "channel", "WINDOW",
            "usage_text", "テスト発行"
        ));

        // resident (residentId 引数で呼ばれる)
        lenient().when(jdbc.queryForMap(anyString(), org.mockito.ArgumentMatchers.eq("R001"))).thenReturn(Map.of(
            "family_name_kanji", "住民",
            "given_name_kanji", "太郎",
            "family_name_kana", "ジュウミン",
            "given_name_kana", "タロウ",
            "birth_date", Date.valueOf(LocalDate.of(1985, 4, 1)),
            "sex", "M",
            "address_text", "東京都サンプル市1-2-3",
            "relation_to_head", "本人",
            "moved_in_date", Date.valueOf(LocalDate.of(2018, 6, 1)),
            "household_id", "H001"
        ));

        // household head (household_id 引数). データなし扱いにする。
        lenient().when(jdbc.queryForMap(anyString(), org.mockito.ArgumentMatchers.eq("H001")))
            .thenThrow(new EmptyResultDataAccessException(1));

        byte[] pdf = new CertificatePdfService(jdbc).render(10L);

        assertThat(pdf.length).isGreaterThan(1000);
        String header = new String(pdf, 0, 8, java.nio.charset.StandardCharsets.US_ASCII);
        assertThat(header).startsWith("%PDF-");
        String tail = new String(pdf, pdf.length - 6, 6, java.nio.charset.StandardCharsets.US_ASCII);
        assertThat(tail).contains("EOF");
    }
}
