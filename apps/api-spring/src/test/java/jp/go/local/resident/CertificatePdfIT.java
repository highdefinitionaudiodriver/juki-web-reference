package jp.go.local.resident;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 証明発行から PDF 取得までを実 PostgreSQL で検証する。
 * CertificatePdfService が resident と household_member を実スキーマどおりに参照できることを固定する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(SpringExtension.class)
class CertificatePdfIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void issueCertificateAndDownloadPdf_fromRealSchema() throws Exception {
        // household_id / resident_id は varchar(20)。下 6 桁を使い、長さを抑える
        // ("H-CERT-XXXXXX" / "R-CERT-XXXXXX" で 13 文字)。
        String suffix = String.valueOf(System.currentTimeMillis() % 1_000_000L);
        String userId = "cert-user-" + suffix;
        String residentId = "R-CERT-" + suffix;
        seedUser(userId);
        seedResident(residentId);

        MvcResult issueRes = mvc.perform(post("/api/v1/certificates/jumin")
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"residentId":"%s","formId":"0010001","copies":1,"usageText":"IT PDF"}
                    """.formatted(residentId)))
            .andReturn();
        assertThat(issueRes.getResponse().getStatus()).isEqualTo(200);
        JsonNode issue = objectMapper.readTree(issueRes.getResponse().getContentAsString());
        long issueId = Long.parseLong(issue.get("issueId").asText());

        MvcResult pdfRes = mvc.perform(get("/api/v1/certificates/{issueId}/pdf", issueId)
                .with(jwt().jwt(j -> j.subject(userId)).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andReturn();
        assertThat(pdfRes.getResponse().getStatus()).isEqualTo(200);
        // Spring が charset を付ける環境 (application/pdf;charset=UTF-8) もあるため、
        // 主タイプ application/pdf を含むことを確認
        assertThat(pdfRes.getResponse().getContentType()).startsWith("application/pdf");
        byte[] pdf = pdfRes.getResponse().getContentAsByteArray();
        assertThat(pdf.length).isGreaterThan(1000);
        assertThat(new String(pdf, 0, 8, java.nio.charset.StandardCharsets.US_ASCII)).startsWith("%PDF-");
        assertThat(new String(pdf, pdf.length - 6, 6, java.nio.charset.StandardCharsets.US_ASCII)).contains("EOF");
    }

    private void seedUser(String userId) {
        jdbc.update("""
            insert into user_account (user_id, employee_no, department, full_name)
            values (?, 'CERT-001', '住民課', '証明 検証')
            """, userId);
    }

    private void seedResident(String residentId) {
        String householdId = "H-" + residentId;
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, '東京都サンプル市証明1-1', '2020-01-01')
            """, householdId);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
            values (?, ?, '証明', '太郎', 'ショウメイ', 'タロウ',
                    '1985-04-01', 'M', '東京都サンプル市証明1-1', '2020-01-01', false, ?)
            """, residentId, householdId, OffsetDateTime.now());
        jdbc.update("""
            insert into household_member (household_id, resident_id, relation_to_head, joined_date)
            values (?, ?, '本人', '2020-01-01')
            """, householdId, residentId);
        jdbc.update("update household set head_resident_id = ? where household_id = ?", residentId, householdId);
    }
}
