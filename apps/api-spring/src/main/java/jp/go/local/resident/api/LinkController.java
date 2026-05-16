package jp.go.local.resident.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * 外部・庁内システム連携の受け口。
 *
 * 標準仕様書 第3章 7「連携」/ データ要件・連携要件標準仕様書 に対応:
 *  - 7.1 CS連携 (住基ネット) / 番号連携 (個人番号関連)
 *  - 7.2 庁内他業務連携 (戸籍/税/国保/年金/選挙)
 *  - 申請管理システム / コンビニ交付 / マイナポータル
 *
 * 全エンドポイントは link_event テーブルに監査ログを残す。
 * 業務反映が伴うものは status=APPLIED、受領のみは status=ACCEPTED。
 */
@RestController
@RequestMapping("/api/v1/link")
public class LinkController {

    private final JdbcTemplate jdbc;
    private final TransactionController transactionController;
    private final ObjectMapper objectMapper;

    public LinkController(JdbcTemplate jdbc, TransactionController transactionController, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.transactionController = transactionController;
        this.objectMapper = objectMapper;
    }

    /**
     * 住基ネット CS からの本人確認情報受領。
     * payload: { residentId, fourInfo: { name, birthDate, sex, address } }
     * 4 情報の照合結果を返す。差異があれば status=MISMATCH。
     */
    @PostMapping("/cs/inbound")
    public ResponseEntity<Map<String, Object>> cs(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null || body.get("residentId") == null) {
            return accept("CS", body);
        }
        String residentId = String.valueOf(body.get("residentId"));
        Map<String, Object> resident = lookupResident(residentId);
        if (resident == null) {
            Map<String, Object> row = insertLinkEvent("CS", "NOT_FOUND", body, null);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(linkResponse(row, "CS", "NOT_FOUND", null, null));
        }
        Map<?, ?> fourInfo = body.get("fourInfo") instanceof Map<?, ?> m ? m : Map.of();
        List<String> diffs = compareFourInfo(resident, fourInfo);
        String status = diffs.isEmpty() ? "MATCH" : "MISMATCH";
        Map<String, Object> row = insertLinkEvent("CS", status, body, null);
        Map<String, Object> response = linkResponse(row, "CS", status, null, null);
        response.put("matched", diffs.isEmpty());
        response.put("differences", diffs);
        return ResponseEntity.ok(response);
    }

    /**
     * 番号連携サーバからの受領。
     * payload: { operation: ISSUE_LINK | LOOKUP | PROVIDE, residentId, ... }
     */
    @PostMapping("/number/inbound")
    public ResponseEntity<Map<String, Object>> number(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null) return accept("NUMBER", null);
        String op = string(body.get("operation"), "ACCEPT").toUpperCase();
        return switch (op) {
            case "ISSUE_LINK" -> {
                // 符号取得: residentId に対する番号符号を返す（dev は固定）
                Map<String, Object> row = insertLinkEvent("NUMBER", "APPLIED", body, null);
                Map<String, Object> response = linkResponse(row, "NUMBER", "APPLIED", null, null);
                response.put("operation", op);
                response.put("symbol", "SYM-" + System.currentTimeMillis());
                yield ResponseEntity.ok(response);
            }
            case "LOOKUP" -> {
                // 情報照会: 4 情報相当を返す
                Map<String, Object> resident = lookupResident(string(body.get("residentId"), ""));
                if (resident == null) {
                    Map<String, Object> row = insertLinkEvent("NUMBER", "NOT_FOUND", body, null);
                    yield ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(linkResponse(row, "NUMBER", "NOT_FOUND", null, null));
                }
                Map<String, Object> row = insertLinkEvent("NUMBER", "APPLIED", body, null);
                Map<String, Object> response = linkResponse(row, "NUMBER", "APPLIED", null, null);
                response.put("operation", op);
                response.put("data", filteredFourInfo(resident));
                yield ResponseEntity.ok(response);
            }
            default -> accept("NUMBER", body);
        };
    }

    @PostMapping("/application/inbound")
    public ResponseEntity<Map<String, Object>> application(@RequestBody(required = false) Map<String, Object> body) {
        // オンライン申請: 受領のみ。後段で職員審査→/transactions/* に流す前提
        return accept("APPLICATION", body);
    }

    /**
     * 庁内他業務連携の受け口。
     *   - koseki: 戸籍連動（BIRTH/DEATH/KOSEKI を内部反映）
     *   - tax / insurance / election: 住民データ提供（4情報＋世帯）
     *   - cvs / mynaportal: 受領ログのみ
     */
    @PostMapping("/internal/{partner}")
    @Transactional
    public ResponseEntity<Map<String, Object>> internal(@PathVariable String partner, @RequestBody(required = false) Map<String, Object> body) {
        String partnerId = partner.toUpperCase();
        Map<String, Object> safeBody = body == null ? Map.of() : body;
        return switch (partnerId) {
            case "KOSEKI" -> acceptKoseki(safeBody);
            case "TAX", "INSURANCE", "ELECTION" -> provideResidentData(partnerId, safeBody);
            case "CVS", "MYNAPORTAL", "MAYUNAPORTAL" -> accept(partnerId, safeBody);
            default -> accept(partnerId, safeBody);
        };
    }

    /**
     * 税・国保・選挙 等の庁内他業務へ住民データを提供する。
     * 提供範囲は最小限の 4 情報 + 世帯。個人番号・住民票コードは含めない。
     * payload: { residentIds: ["..."] }
     */
    private ResponseEntity<Map<String, Object>> provideResidentData(String partnerId, Map<String, Object> body) {
        List<?> idsRaw = body.get("residentIds") instanceof List<?> l ? l : List.of();
        if (idsRaw.isEmpty()) {
            return ResponseEntity.badRequest()
                .body(error("VALIDATION_ERROR", "residentIds は必須です（空配列不可）。"));
        }
        List<Map<String, Object>> records = new java.util.ArrayList<>();
        for (Object o : idsRaw) {
            String rid = String.valueOf(o);
            Map<String, Object> r = lookupResident(rid);
            if (r != null) records.add(filteredFourInfo(r));
        }
        Map<String, Object> row = insertLinkEvent(partnerId, "APPLIED", body, null);
        Map<String, Object> response = linkResponse(row, partnerId, "APPLIED", null, null);
        response.put("count", records.size());
        response.put("residents", records);
        return ResponseEntity.ok(response);
    }

    private ResponseEntity<Map<String, Object>> accept(String partnerId, Map<String, Object> body) {
        Map<String, Object> row = insertLinkEvent(partnerId, "ACCEPTED", body, null);
        return ResponseEntity.status(202).body(linkResponse(row, partnerId, "ACCEPTED", null, null));
    }

    private ResponseEntity<Map<String, Object>> acceptKoseki(Map<String, Object> body) {
        String noticeType = string(body.get("noticeType"), string(body.get("kind"), ""));
        if (noticeType.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "noticeType は必須です。"));
        }
        ResponseEntity<Map<String, Object>> txResponse = switch (noticeType) {
            case "BIRTH" -> transactionController.birth(body);
            case "DEATH" -> transactionController.death(body);
            case "MARRIAGE", "DIVORCE", "ADOPTION" -> {
                Map<String, Object> kosekiBody = new LinkedHashMap<>(body);
                kosekiBody.put("kind", noticeType);
                yield transactionController.koseki(kosekiBody);
            }
            default -> ResponseEntity.badRequest().body(error("VALIDATION_ERROR",
                "noticeType は BIRTH / DEATH / MARRIAGE / DIVORCE / ADOPTION のいずれかです。"));
        };
        if (!txResponse.getStatusCode().is2xxSuccessful()) {
            return txResponse;
        }
        Map<String, Object> tx = txResponse.getBody() == null ? Map.of() : txResponse.getBody();
        String transactionId = string(tx.get("transactionId"), null);
        Map<String, Object> row = insertLinkEvent("KOSEKI", "APPLIED", body, transactionId);
        Map<String, Object> response = linkResponse(row, "KOSEKI", "APPLIED", transactionId, tx);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ===== 共通ヘルパ =====

    private Map<String, Object> lookupResident(String residentId) {
        if (residentId == null || residentId.isBlank()) return null;
        try {
            return jdbc.queryForMap("""
                select resident_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
                       birth_date, sex, address_text, household_id, moved_out_date
                  from resident where resident_id = ?
                """, residentId);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    private Map<String, Object> filteredFourInfo(Map<String, Object> resident) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("residentId", resident.get("resident_id"));
        out.put("name", String.format("%s %s",
            string(resident.get("family_name_kanji"), ""), string(resident.get("given_name_kanji"), "")));
        out.put("birthDate", resident.get("birth_date"));
        out.put("sex", resident.get("sex"));
        out.put("addressText", resident.get("address_text"));
        out.put("householdId", resident.get("household_id"));
        return out;
    }

    private List<String> compareFourInfo(Map<String, Object> resident, Map<?, ?> fourInfo) {
        List<String> diffs = new java.util.ArrayList<>();
        if (fourInfo.get("name") != null) {
            String here = String.format("%s %s",
                string(resident.get("family_name_kanji"), ""), string(resident.get("given_name_kanji"), ""));
            if (!here.equals(fourInfo.get("name").toString())) diffs.add("name");
        }
        if (fourInfo.get("birthDate") != null && !String.valueOf(resident.get("birth_date"))
                .startsWith(fourInfo.get("birthDate").toString())) {
            diffs.add("birthDate");
        }
        if (fourInfo.get("sex") != null && !String.valueOf(resident.get("sex"))
                .equals(fourInfo.get("sex").toString())) {
            diffs.add("sex");
        }
        if (fourInfo.get("addressText") != null && !String.valueOf(resident.get("address_text"))
                .equals(fourInfo.get("addressText").toString())) {
            diffs.add("addressText");
        }
        return diffs;
    }

    private Map<String, Object> linkResponse(Map<String, Object> row, String partnerId, String status,
                                              String transactionId, Map<String, Object> transaction) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("eventId", String.valueOf(row.get("event_id")));
        response.put("partnerId", partnerId);
        response.put("status", status);
        if (transactionId != null) response.put("transactionId", transactionId);
        if (transaction != null) response.put("transaction", transaction);
        response.put("receivedAt", OffsetDateTime.now().toString());
        return response;
    }

    private Map<String, Object> insertLinkEvent(String partnerId, String status, Map<String, Object> payload, String transactionId) {
        return jdbc.queryForMap("""
            insert into link_event (partner_id, transaction_id, direction, status, payload, occurred_at)
            values (?, ?, ?, ?, ?::jsonb, ?)
            returning event_id
            """, partnerId, transactionId, "INBOUND", status, toJson(payload), OffsetDateTime.now());
    }

    private String toJson(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body == null ? Map.of() : body);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }

    private Map<String, Object> error(String code, String message) {
        return Map.of("code", code, "message", message);
    }
}
