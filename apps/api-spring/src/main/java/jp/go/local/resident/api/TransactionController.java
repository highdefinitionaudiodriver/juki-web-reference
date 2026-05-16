package jp.go.local.resident.api;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jp.go.local.resident.domain.ResidentChangedEvent;
import jp.go.local.resident.service.CertificateIssueService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final CertificateIssueService certificateIssueService;

    public TransactionController(JdbcTemplate jdbc, ApplicationEventPublisher events, CertificateIssueService certificateIssueService) {
        this.jdbc = jdbc;
        this.events = events;
        this.certificateIssueService = certificateIssueService;
    }

    @PostMapping("/in")
    @Transactional
    public ResponseEntity<Map<String, Object>> moveIn(@RequestBody Map<String, Object> body) {
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        Map<String, Object> member = firstMember(body);
        String residentId = "9" + System.currentTimeMillis();
        String householdId = "H-" + System.currentTimeMillis();
        String addressText = string(body.get("addressText"), "東京都サンプル市新町1-1");
        jdbc.update("""
            insert into household (household_id, address_text, established_date)
            values (?, ?, ?)
            """, householdId, addressText, eventDate);
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_code, address_text, moved_in_date, restricted_flag, valid_from)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)
            """, residentId, householdId, string(member.get("familyNameKanji"), "新規"),
            string(member.get("givenNameKanji"), "住民"), string(member.get("familyNameKana"), "シンキ"),
            string(member.get("givenNameKana"), "ジュウミン"),
            LocalDate.parse(string(member.get("birthDate"), "2000-01-01")), string(member.get("sex"), "U"),
            string(body.get("addressCode"), ""), addressText, eventDate, OffsetDateTime.now());
        jdbc.update("update household set head_resident_id = ? where household_id = ?", residentId, householdId);
        jdbc.update("""
            insert into household_member (household_id, resident_id, relation_to_head, joined_date)
            values (?, ?, ?, ?)
            """, householdId, residentId, string(member.get("relationToHead"), "本人"), eventDate);
        Map<String, Object> tx = insertTransaction("IN", residentId, householdId, "MOVE_IN", eventDate, null);
        events.publishEvent(new ResidentChangedEvent(residentId, (String) tx.get("transactionId"), "MOVE_IN"));
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/out")
    @Transactional
    public ResponseEntity<Map<String, Object>> moveOut(@RequestBody Map<String, Object> body, Authentication authentication) {
        String residentId = firstString(body.get("members"));
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        Map<String, Object> resident;
        try {
            resident = jdbc.queryForMap("select household_id, moved_out_date from resident where resident_id = ?", residentId);
        } catch (EmptyResultDataAccessException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "転出対象が見つかりません。"));
        }
        if (resident.get("moved_out_date") != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("ALREADY_MOVED_OUT", "既に転出済みです。"));
        }
        jdbc.update("update resident set moved_out_date = ?, valid_to = ? where resident_id = ?", eventDate, OffsetDateTime.now(), residentId);
        Map<String, Object> tx = insertTransaction("OUT", residentId, String.valueOf(resident.get("household_id")), "MOVE_OUT", eventDate, null);
        events.publishEvent(new ResidentChangedEvent(residentId, (String) tx.get("transactionId"), "MOVE_OUT"));
        Map<String, Object> certificateRequest = new LinkedHashMap<>();
        certificateRequest.put("residentId", residentId);
        certificateRequest.put("transactionId", tx.get("transactionId"));
        certificateRequest.put("formId", "0010007");
        certificateRequest.put("copies", 1);
        certificateRequest.put("usageText", "転出証明");
        tx.put("certificate", certificateIssueService.issue(certificateRequest, authentication, "0010007"));
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/move")
    @Transactional
    public ResponseEntity<Map<String, Object>> move(@RequestBody Map<String, Object> body) {
        String householdId = string(body.get("householdId"), "");
        if (householdId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "householdId は必須です。"));
        }
        // 世帯の存在チェック
        Integer householdRows = jdbc.queryForObject(
            "select count(*) from household where household_id = ? and closed_date is null", Integer.class, householdId);
        if (householdRows == null || householdRows == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("HOUSEHOLD_NOT_FOUND", "対象世帯が見つかりません。"));
        }
        Integer aliveMembers = jdbc.queryForObject(
            "select count(*) from resident where household_id = ? and moved_out_date is null", Integer.class, householdId);
        if (aliveMembers == null || aliveMembers == 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("HOUSEHOLD_EMPTY", "在籍中の世帯員がいない世帯は転居できません。"));
        }
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        String newAddress = string(body.get("newAddress"), "");
        if (newAddress.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "newAddress は必須です。"));
        }
        jdbc.update("update household set address_text = ?, address_code = ? where household_id = ?",
            newAddress, string(body.get("newAddressCode"), ""), householdId);
        jdbc.update("update resident set address_text = ?, address_code = ? where household_id = ? and moved_out_date is null",
            newAddress, string(body.get("newAddressCode"), ""), householdId);
        Map<String, Object> tx = insertTransaction("MOVE", null, householdId, "MOVE_INTERNAL", eventDate, null);
        publishHouseholdResidents(householdId, (String) tx.get("transactionId"), "MOVE_INTERNAL");
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/household")
    @Transactional
    public ResponseEntity<Map<String, Object>> household(@RequestBody Map<String, Object> body) {
        String householdId = string(body.get("householdId"), "");
        String operation = string(body.get("operation"), "HOUSEHOLD_CHANGE");
        String newHead = string(body.get("newHeadResidentId"), null);
        if (householdId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "householdId は必須です。"));
        }
        // 世帯主変更: 新世帯主が同世帯の在籍員であることをチェック
        if ("HEAD_CHANGE".equals(operation)) {
            if (newHead == null || newHead.isBlank()) {
                return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "HEAD_CHANGE では newHeadResidentId が必須です。"));
            }
            Integer hits = jdbc.queryForObject("""
                select count(*) from resident
                 where resident_id = ? and household_id = ? and moved_out_date is null
                """, Integer.class, newHead, householdId);
            if (hits == null || hits == 0) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(error("HEAD_NOT_IN_HOUSEHOLD", "指定された新世帯主は同一世帯の在籍員ではありません。"));
            }
            jdbc.update("update household set head_resident_id = ? where household_id = ?", newHead, householdId);
            jdbc.update("update household_member set relation_to_head = '本人' where household_id = ? and resident_id = ?", householdId, newHead);
        }
        Map<String, Object> tx = insertTransaction("HOUSEHOLD", newHead, householdId, operation,
            LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString())), null);
        publishHouseholdResidents(householdId, (String) tx.get("transactionId"), "HOUSEHOLD_CHANGE");
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/official")
    @Transactional
    public ResponseEntity<Map<String, Object>> official(@RequestBody Map<String, Object> body) {
        String residentId = string(body.get("residentId"), null);
        if (residentId == null || residentId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "residentId は必須です。"));
        }
        Integer hits = jdbc.queryForObject("select count(*) from resident where resident_id = ?", Integer.class, residentId);
        if (hits == null || hits == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "対象住民が見つかりません。"));
        }
        // 職権異動は DRAFT 起票（承認後に APPLIED 化）
        String txId = "TX-" + System.currentTimeMillis();
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        String reasonCode = string(body.get("reasonCode"), "OFFICIAL_WRITE");
        jdbc.update("""
            insert into transaction
              (transaction_id, resident_id, household_id, type_code, reason_code, event_date, processed_date, receiver_office, status, parent_transaction_id)
            values (?, ?, null, 'OFFICIAL', ?, ?, current_date, '住民課', 'DRAFT', null)
            """, txId, residentId, reasonCode, eventDate);
        Map<String, Object> tx = new LinkedHashMap<>();
        tx.put("transactionId", txId);
        tx.put("residentId", residentId);
        tx.put("typeCode", "OFFICIAL");
        tx.put("reasonCode", reasonCode);
        tx.put("eventDate", eventDate.toString());
        tx.put("status", "DRAFT");
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/{txId}/approve")
    @Transactional
    public ResponseEntity<Map<String, Object>> approve(@PathVariable String txId, @RequestBody Map<String, Object> body,
                                                        Authentication authentication) {
        Map<String, Object> existing;
        try {
            existing = jdbc.queryForMap("select transaction_id, type_code, status, resident_id from transaction where transaction_id = ?", txId);
        } catch (EmptyResultDataAccessException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "対象異動が見つかりません。"));
        }
        if (!"OFFICIAL".equals(existing.get("type_code"))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("NOT_APPROVABLE", "決裁可能なのは職権異動のみです。"));
        }
        String currentStatus = String.valueOf(existing.get("status"));
        if ("APPLIED".equals(currentStatus) || "CANCELLED".equals(currentStatus)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("ALREADY_FINALIZED", "確定済み異動は決裁できません。"));
        }
        String action = string(body.get("action"), "APPROVE");
        String status = switch (action) {
            case "REMAND" -> "DRAFT";
            case "REJECT" -> "CANCELLED";
            case "CONDITIONAL", "APPROVE" -> "APPLIED";
            default -> "APPLIED";
        };
        String approverUser = authentication != null ? authentication.getName() : "system";
        jdbc.update("update transaction set status = ? where transaction_id = ?", status, txId);
        // 決裁ステップを transaction_approval に記録
        Integer nextStep = jdbc.queryForObject(
            "select coalesce(max(step), 0) + 1 from transaction_approval where transaction_id = ?", Integer.class, txId);
        jdbc.update("""
            insert into transaction_approval (transaction_id, step, role, approver_user_id, status, comment, acted_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """, txId, nextStep == null ? 1 : nextStep, "APPROVER", approverUser, action, string(body.get("comment"), null), OffsetDateTime.now());
        if ("APPLIED".equals(status)) {
            publishIfPresent(String.valueOf(existing.get("resident_id")), txId, "OFFICIAL_APPROVED");
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("transactionId", txId);
        response.put("status", status);
        response.put("step", nextStep == null ? 1 : nextStep);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/cancel")
    @Transactional
    public ResponseEntity<Map<String, Object>> cancel(@RequestBody Map<String, Object> body) {
        String parentId = string(body.get("transactionId"), "");
        Map<String, Object> parent;
        try {
            parent = jdbc.queryForMap("select resident_id, household_id, type_code, event_date from transaction where transaction_id = ?", parentId);
        } catch (EmptyResultDataAccessException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "取消元の異動が見つかりません。"));
        }
        if ("CANCEL".equals(parent.get("type_code"))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("INVALID_CANCEL_TARGET", "取消異動は取消元に指定できません。"));
        }
        // 既に取消済みなら 409
        Integer alreadyCancelled = jdbc.queryForObject(
            "select count(*) from transaction where parent_transaction_id = ? and type_code = 'CANCEL'", Integer.class, parentId);
        if (alreadyCancelled != null && alreadyCancelled > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("ALREADY_CANCELLED", "既に取消済みの異動です。"));
        }
        Map<String, Object> tx = insertTransaction("CANCEL", string(parent.get("resident_id"), null),
            string(parent.get("household_id"), null), "CANCEL", LocalDate.now(), parentId);
        publishIfPresent(string(parent.get("resident_id"), null), (String) tx.get("transactionId"), "CANCEL");
        return ResponseEntity.status(201).body(tx);
    }

    @PostMapping("/birth")
    public ResponseEntity<Map<String, Object>> birth(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.status(201).body(stub("BIRTH"));
    }

    @PostMapping("/death")
    public ResponseEntity<Map<String, Object>> death(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.status(201).body(stub("DEATH"));
    }

    @PostMapping("/koseki")
    public ResponseEntity<Map<String, Object>> koseki(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.status(201).body(stub("KOSEKI"));
    }

    private Map<String, Object> insertTransaction(String typeCode, String residentId, String householdId, String reasonCode, LocalDate eventDate, String parentId) {
        String txId = "TX-" + System.currentTimeMillis();
        jdbc.update("""
            insert into transaction
              (transaction_id, resident_id, household_id, type_code, reason_code, event_date, processed_date, receiver_office, status, parent_transaction_id)
            values (?, ?, ?, ?, ?, ?, current_date, ?, ?, ?)
            """, txId, residentId, householdId, typeCode, reasonCode, eventDate, "住民課", "APPLIED", parentId);
        Map<String, Object> tx = new LinkedHashMap<>();
        tx.put("transactionId", txId);
        tx.put("residentId", residentId);
        tx.put("householdId", householdId);
        tx.put("typeCode", typeCode);
        tx.put("reasonCode", reasonCode);
        tx.put("eventDate", eventDate.toString());
        tx.put("processedDate", LocalDate.now().toString());
        tx.put("receiverOffice", "住民課");
        tx.put("status", "APPLIED");
        tx.put("parentTransactionId", parentId);
        tx.put("items", List.of());
        return tx;
    }

    private Map<String, Object> stub(String typeCode) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("transactionId", "TX-" + System.currentTimeMillis());
        response.put("typeCode", typeCode);
        response.put("status", "ACCEPTED");
        return response;
    }

    private Map<String, Object> error(String code, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("code", code);
        response.put("message", message);
        return response;
    }

    private void publishHouseholdResidents(String householdId, String transactionId, String reasonCode) {
        jdbc.queryForList("""
            select resident_id from resident where household_id = ? and moved_out_date is null
            """, householdId).forEach(row -> publishIfPresent(String.valueOf(row.get("resident_id")), transactionId, reasonCode));
    }

    private void publishIfPresent(String residentId, String transactionId, String reasonCode) {
        if (residentId != null && !residentId.isBlank()) {
            events.publishEvent(new ResidentChangedEvent(residentId, transactionId, reasonCode));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstMember(Map<String, Object> body) {
        Object members = body.get("members");
        if (members instanceof List<?> list && !list.isEmpty() && list.getFirst() instanceof Map<?, ?> member) {
            return (Map<String, Object>) member;
        }
        return Map.of();
    }

    private String firstString(Object value) {
        if (value instanceof List<?> list && !list.isEmpty()) {
            return String.valueOf(list.getFirst());
        }
        return String.valueOf(value);
    }

    private String string(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
