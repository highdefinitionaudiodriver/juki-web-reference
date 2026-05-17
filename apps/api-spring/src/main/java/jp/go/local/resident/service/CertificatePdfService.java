package jp.go.local.resident.service;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.ByteArrayOutputStream;
import java.io.File;
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

    /** 和文フォント (TTF/OTF) の絶対パス。設定があれば PDF に埋め込む。未設定なら OS フォント任せ。 */
    @Value("${certificate.font.serif-jp:}")
    private String serifJpFontPath;

    /** PDF/A-2b 準拠で出力するか。true の場合は和文フォントの埋め込みが必須。 */
    @Value("${certificate.pdfa:false}")
    private boolean pdfA;

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
                select r.family_name_kanji, r.given_name_kanji, r.family_name_kana, r.given_name_kana,
                       r.birth_date, r.sex, r.address_text, hm.relation_to_head, r.moved_in_date, r.household_id
                  from resident r
             left join household_member hm
                    on hm.resident_id = r.resident_id
                   and hm.household_id = r.household_id
                   and hm.left_date is null
                 where r.resident_id = ?
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

        String formId = String.valueOf(issue.get("form_id"));
        String html = renderForFormId(formId, issue, resident, head);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            // 和文フォント埋め込み: certificate.font.serif-jp で TTF/OTF パスを指定された場合のみ。
            // 設定がない場合は OS にインストール済みのフォントへフォールバック（本番では fonts-noto-cjk を必ず入れる）。
            if (serifJpFontPath != null && !serifJpFontPath.isBlank()) {
                File fontFile = new File(serifJpFontPath);
                if (fontFile.exists()) {
                    builder.useFont(fontFile, "NotoSerifJP", 400, BaseRendererBuilder.FontStyle.NORMAL, true);
                }
            }
            // PDF/A-2b conformance: 設定が true かつ和文フォント埋め込みが有効な場合のみ。
            // フォント埋め込み無しで PDF/A を要求すると OpenHTMLtoPDF がエラーを投げる。
            if (pdfA && serifJpFontPath != null && !serifJpFontPath.isBlank()
                && new File(serifJpFontPath).exists()) {
                builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.PDFA_2_B);
            }
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
            case "0010008" -> "転出証明書に準ずる証明書";
            case "0010009" -> "住民票コード通知票";
            case "0010010" -> "個人番号通知票";
            case "0010011" -> "住民票コード・個人番号変更通知票";
            case "0010012" -> "在留期間満了事前通知票";
            case "0010013" -> "通称名変更通知書";
            case "0010014" -> "通称名変更依頼通知書";
            case "0010015" -> "住所異動届受理通知";
            case "0010016" -> "職権処理通知書";
            case "0010017" -> "成年後見人異動通知";
            case "0010018" -> "住居表示実施通知書";
            case "0010019" -> "町名整理に伴う住所変更通知";
            default -> "証明書";
        };
    }

    /**
     * form_id 別に最適なテンプレートと変数セットを選び HTML を返す。
     *
     * | form_id | テンプレート | 用途 |
     * |---|---|---|
     * | 0010001 / 0010002 / 0010003 / 0010004 / 0010005 / 0010007 / 0010008 | certificate-template.html | 住民票/転出証明等の本体帳票 |
     * | 0010009 / 0010010 / 0010011 / 0010013 / 0010014 / 0010015 / 0010016 / 0010017 / 0010018 / 0010019 | notice-template.html | 各種通知票 |
     * | 0010012 | foreigner-expiry-template.html | 在留期間満了事前通知（30日前） |
     */
    private String renderForFormId(String formId, Map<String, Object> issue,
                                    Map<String, Object> resident, Map<String, Object> head) {
        return switch (formId) {
            case "0010009", "0010010", "0010011" -> renderCodeNotice(formId, issue, resident);
            case "0010012" -> renderForeignerExpiry(formId, issue, resident);
            case "0010013", "0010014", "0010015", "0010016", "0010017", "0010018", "0010019" ->
                renderGenericNotice(formId, issue, resident);
            default -> renderCertificate(formId, issue, resident, head);
        };
    }

    /** 住民票・除票・転出証明・閲覧用 一部の写し等の本体帳票 */
    private String renderCertificate(String formId, Map<String, Object> issue,
                                      Map<String, Object> resident, Map<String, Object> head) {
        return renderTemplate(loadTemplate("certificate-template.html"), Map.ofEntries(
            entry("title", titleFor(formId)),
            entry("issueId", String.valueOf(issue.get("issue_id"))),
            entry("formId", formId),
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
    }

    /** 0010009/0010010/0010011 コード関連通知票 */
    private String renderCodeNotice(String formId, Map<String, Object> issue, Map<String, Object> resident) {
        String codeLabel = switch (formId) {
            case "0010009" -> "住民票コード";
            case "0010010" -> "個人番号";
            case "0010011" -> "住民票コード／個人番号";
            default -> "コード";
        };
        String reasonLabel = switch (formId) {
            case "0010009", "0010010" -> "付番（新規）";
            case "0010011" -> "変更／修正";
            default -> "";
        };
        // コード本体は通知票では取り扱いに注意。マスク済を提示する設計。
        // 実運用では送付経路と封緘方針に従い、必要時のみ平文を入れる切替を行う。
        return renderTemplate(loadTemplate("notice-template.html"), Map.ofEntries(
            entry("title", titleFor(formId)),
            entry("formId", formId),
            entry("noticeNumber", "通知番号: " + str(issue.get("issue_id"))),
            entry("addresseeLabel", "住所地"),
            entry("name", joinName(resident.get("family_name_kanji"), resident.get("given_name_kanji"))),
            entry("leadingText", "下記のとおり、" + codeLabel + "を発行／変更しましたのでお知らせします。"),
            entry("codeLabel", codeLabel),
            entry("codeValue", "**** **** ****"),
            entry("eventDate", warekiOrIso(issue.get("issued_at"))),
            entry("reasonLabel", reasonLabel),
            entry("issueDate", warekiOrIso(issue.get("issued_at"))),
            entry("municipality", municipality),
            entry("mayorName", mayorName),
            entry("verifyToken", String.valueOf(issue.get("verify_token")))
        ));
    }

    /** 0010012 在留期間満了事前通知 */
    private String renderForeignerExpiry(String formId, Map<String, Object> issue, Map<String, Object> resident) {
        // 在留情報を resident_foreigner から取得
        Map<String, Object> fg = Map.of();
        Object residentId = resident.get("resident_id") != null ? resident.get("resident_id") : issue.get("resident_id");
        if (residentId != null) {
            try {
                fg = jdbc.queryForMap("""
                    select residence_status, residence_period_end, nationality_full
                      from resident_foreigner where resident_id = ?
                    """, residentId);
            } catch (EmptyResultDataAccessException ignore) {
                // 外国人レコードなし
            }
        }
        String residencePeriodEnd = warekiOrIso(fg.get("residence_period_end"));
        // 残日数の計算（issued_at と residence_period_end の差）
        String daysUntil = "—";
        try {
            LocalDate end = (fg.get("residence_period_end") instanceof java.sql.Date d)
                ? d.toLocalDate() : null;
            LocalDate issuedAt = (issue.get("issued_at") instanceof java.sql.Timestamp ts)
                ? ts.toLocalDateTime().toLocalDate() : LocalDate.now();
            if (end != null) {
                long days = java.time.temporal.ChronoUnit.DAYS.between(issuedAt, end);
                daysUntil = String.valueOf(Math.max(0, days));
            }
        } catch (Exception ignore) {
            // フォールバック
        }
        return renderTemplate(loadTemplate("foreigner-expiry-template.html"), Map.ofEntries(
            entry("title", titleFor(formId)),
            entry("formId", formId),
            entry("noticeNumber", "通知番号: " + str(issue.get("issue_id"))),
            entry("name", joinName(resident.get("family_name_kanji"), resident.get("given_name_kanji"))),
            entry("nameKana", joinName(resident.get("family_name_kana"), resident.get("given_name_kana"))),
            entry("addressText", str(resident.get("address_text"))),
            entry("nationality", str(fg.get("nationality_full"))),
            entry("residenceStatus", str(fg.get("residence_status"))),
            entry("residencePeriodEnd", residencePeriodEnd),
            entry("daysUntilExpiry", daysUntil),
            entry("issueDate", warekiOrIso(issue.get("issued_at"))),
            entry("municipality", municipality),
            entry("mayorName", mayorName),
            entry("verifyToken", String.valueOf(issue.get("verify_token")))
        ));
    }

    /** 0010013-0010019 その他の通知票（暫定） */
    private String renderGenericNotice(String formId, Map<String, Object> issue, Map<String, Object> resident) {
        return renderTemplate(loadTemplate("notice-template.html"), Map.ofEntries(
            entry("title", titleFor(formId)),
            entry("formId", formId),
            entry("noticeNumber", "通知番号: " + str(issue.get("issue_id"))),
            entry("addresseeLabel", "宛先"),
            entry("name", joinName(resident.get("family_name_kanji"), resident.get("given_name_kanji"))),
            entry("leadingText", "下記の事務処理が行われましたのでお知らせします。"),
            entry("codeLabel", "区分"),
            entry("codeValue", titleFor(formId)),
            entry("eventDate", warekiOrIso(issue.get("issued_at"))),
            entry("reasonLabel", str(issue.get("usage_text"))),
            entry("issueDate", warekiOrIso(issue.get("issued_at"))),
            entry("municipality", municipality),
            entry("mayorName", mayorName),
            entry("verifyToken", String.valueOf(issue.get("verify_token")))
        ));
    }

    private String loadTemplate(String classpathResource) {
        try {
            return StreamUtils.copyToString(new ClassPathResource(classpathResource).getInputStream(),
                StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("template not found: " + classpathResource, e);
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
