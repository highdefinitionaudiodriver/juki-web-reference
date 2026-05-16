package jp.go.local.resident.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

/**
 * 証明書 PDF 生成サービス（HTML テンプレート + OpenHTMLtoPDF）。
 *
 * - HTML テンプレートは {@code apps/web/src/print/CertificateTemplate.tsx} と
 *   レイアウトを揃え、サーバ生成版は {@code certificate-template.html} を使う。
 * - フォントは Noto Serif CJK JP / Yu Mincho を想定。サーバに該当フォントが
 *   無い場合は Sans 系にフォールバックする。CI/本番では Docker イメージに
 *   {@code fonts-noto-cjk} を入れること。
 *
 * 将来:
 *  - PDF/A-2b は OpenHTMLtoPDF の usePdfAConformance + ICC プロファイルが必要
 *  - 大量発行時はテンプレートをキャッシュ
 */
@Service
public class CertificatePdfService {

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final JdbcTemplate jdbc;

    @Value("${certificate.municipality:サンプル市}")
    private String municipality;

    @Value("${certificate.mayor:山田 一郎}")
    private String mayorName;

    public CertificatePdfService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public byte[] render(long issueId) {
        Map<String, Object> issue;
        try {
            issue = jdbc.queryForMap("""
                select issue_id, resident_id, form_id, copies, fee, verify_token, issued_at, channel, usage_text
                  from certificate_issue
                 where issue_id = ?
                """, issueId);
        } catch (EmptyResultDataAccessException e) {
            throw new IllegalArgumentException("certificate_issue not found: " + issueId);
        }

        String residentId = String.valueOf(issue.get("resident_id"));
        Map<String, Object> resident;
        try {
            resident = jdbc.queryForMap("""
                select family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
                       birth_date, sex, address_text, relation_to_head, moved_in_date, household_id
                  from resident
                 where resident_id = ?
                """, residentId);
        } catch (EmptyResultDataAccessException e) {
            resident = Map.of();
        }

        Map<String, Object> head = Map.of();
        Object householdId = resident.get("household_id");
        if (householdId != null) {
            try {
                head = jdbc.queryForMap("""
                    select r.family_name_kanji, r.given_name_kanji
                      from resident r
                      join household h on h.head_resident_id = r.resident_id
                     where h.household_id = ?
                    """, householdId);
            } catch (EmptyResultDataAccessException ignore) {
                // 未設定
            }
        }

        String html = renderTemplate(loadTemplate(), Map.ofEntries(
            entry("title", titleFor(String.valueOf(issue.get("form_id")))),
            entry("issueId", String.valueOf(issue.get("issue_id"))),
            entry("formId", String.valueOf(issue.get("form_id"))),
            entry("addressText", str(resident.get("address_text"))),
            entry("householdHead", joinName(head.get("family_name_kanji"), head.get("given_name_kanji"))),
            entry("name", joinName(resident.get("family_name_kanji"), resident.get("given_name_kanji"))),
            entry("nameKana", joinName(resident.get("family_name_kana"), resident.get("given_name_kana"))),
            entry("birthDate", warekiOrIso(resident.get("birth_date"))),
            entry("sex", sexLabel(resident.get("sex"))),
            entry("relationToHead", str(resident.get("relation_to_head"))),
            entry("movedInDate", warekiOrIso(resident.get("moved_in_date"))),
            entry("myNumber", "****-****-****"),
            entry("juminCode", "****-****-***"),
            entry("issueDate", warekiOrIso(issue.get("issued_at"))),
            entry("municipality", municipality),
            entry("mayorName", mayorName),
            entry("usageText", str(issue.get("usage_text"))),
            entry("verifyToken", String.valueOf(issue.get("verify_token")))
        ));

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            // Noto Sans/Serif CJK が OS にインストールされている場合のみ埋め込み。
            // 無い場合は Helvetica などにフォールバックして全角は ?? になりがちなので、
            // 本番環境では fonts-noto-cjk を必ず入れること。
            builder.withHtmlContent(html, null);
            builder.toStream(out);
            builder.run();
        } catch (IOException e) {
            throw new UncheckedIOException("PDF generation failed", e);
        }
        return out.toByteArray();
    }

    private static String titleFor(String formId) {
        return switch (formId) {
            case "0010001" -> "住 民 票 の 写 し";
            case "0010002" -> "住民票記載事項証明書";
            case "0010003" -> "住民票の写し（世帯連記）";
            case "0010004" -> "住民票の除票の写し";
            case "0010005" -> "住民基本台帳の一部の写し";
            case "0010007" -> "転 出 証 明 書";
            default -> "証明書";
        };
    }

    private String loadTemplate() {
        try {
            return StreamUtils.copyToString(new ClassPathResource("certificate-template.html").getInputStream(),
                StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("template not found", e);
        }
    }

    private static String renderTemplate(String template, Map<String, String> vars) {
        String out = template;
        for (Map.Entry<String, String> e : vars.entrySet()) {
            out = out.replace("{{" + e.getKey() + "}}", htmlEscape(e.getValue()));
        }
        return out;
    }

    private static Map.Entry<String, String> entry(String k, String v) {
        return Map.entry(k, v == null ? "" : v);
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    private static String joinName(Object family, Object given) {
        String f = str(family);
        String g = str(given);
        return (f + " " + g).trim();
    }

    private static String sexLabel(Object v) {
        String s = str(v);
        return switch (s) {
            case "M" -> "男";
            case "F" -> "女";
            default -> "—";
        };
    }

    /**
     * ISO 日付 / OffsetDateTime / LocalDate を和暦表記に変換。失敗時は元の文字列を返す。
     */
    private static String warekiOrIso(Object v) {
        if (v == null) return "";
        LocalDate d;
        if (v instanceof LocalDate ld) d = ld;
        else if (v instanceof java.sql.Date sd) d = sd.toLocalDate();
        else if (v instanceof OffsetDateTime odt) d = odt.toLocalDate();
        else if (v instanceof java.sql.Timestamp ts) d = ts.toLocalDateTime().toLocalDate();
        else {
            String s = v.toString();
            try {
                d = LocalDate.parse(s.substring(0, Math.min(10, s.length())), ISO_DATE);
            } catch (Exception e) {
                return s;
            }
        }
        int y = d.getYear();
        int m = d.getMonthValue();
        int day = d.getDayOfMonth();
        if (y >= 2019) return "令和" + (y - 2018) + "年" + m + "月" + day + "日";
        if (y >= 1989) return "平成" + (y - 1988) + "年" + m + "月" + day + "日";
        if (y >= 1926) return "昭和" + (y - 1925) + "年" + m + "月" + day + "日";
        return d.toString();
    }

    private static String htmlEscape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
