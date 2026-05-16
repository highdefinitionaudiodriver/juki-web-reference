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
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> household(@RequestBody Map<String, Object> body) {
        String householdId = string(body.get("householdId"), "");
        String operation = string(body.get("operation"), "HOUSEHOLD_CHANGE");
        String newHead = string(body.get("newHeadResidentId"), null);
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        if (householdId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "householdId は必須です。"));
        }
        Integer existingCount = jdbc.queryForObject(
            "select count(*) from household where household_id = ? and closed_date is null",
            Integer.class, householdId);
        if (existingCount == null || existingCount == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("HOUSEHOLD_NOT_FOUND", "対象世帯が見つかりません。"));
        }

        switch (operation) {
            case "HEAD_CHANGE" -> {
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
            case "SPLIT" -> {
                // 分離する住民 ID リストと、新世帯の世帯主、住所
                List<Object> raw = body.get("targetResidentIds") instanceof List<?> list
                    ? new java.util.ArrayList<>(list) : new java.util.ArrayList<>();
                if (raw.isEmpty()) {
                    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "SPLIT には targetResidentIds が必要です。"));
                }
                if (newHead == null || newHead.isBlank() || !raw.stream().map(String::valueOf).anyMatch(newHead::equals)) {
                    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "SPLIT には newHeadResidentId が必要で、targetResidentIds に含まれる必要があります。"));
                }
                String newAddress = string(body.get("newAddress"), null);
                if (newAddress == null || newAddress.isBlank()) {
                    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "SPLIT には newAddress が必要です。"));
                }
                // 対象住民全員が現世帯に属していることを確認
                List<String> targets = raw.stream().map(String::valueOf).toList();
                String placeholders = String.join(",", java.util.Collections.nCopies(targets.size(), "?"));
                Object[] checkParams = new Object[targets.size() + 1];
                for (int i = 0; i < targets.size(); i++) checkParams[i] = targets.get(i);
                checkParams[targets.size()] = householdId;
                Integer aligned = jdbc.queryForObject(
                    "select count(*) from resident where resident_id in (" + placeholders + ") and household_id = ? and moved_out_date is null",
                    Integer.class, checkParams);
                if (aligned == null || aligned != targets.size()) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(error("MEMBERS_NOT_IN_HOUSEHOLD", "対象住民の一部が現世帯に在籍していません。"));
                }
                // 元世帯の全員を分離すると親世帯が空になる
                Integer total = jdbc.queryForObject(
                    "select count(*) from resident where household_id = ? and moved_out_date is null",
                    Integer.class, householdId);
                if (total != null && total.equals(targets.size())) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(error("CANNOT_SPLIT_ALL", "世帯員全員を分離することはできません。HEAD_CHANGE か MERGE を検討してください。"));
                }
                String newHouseholdId = "H-" + System.currentTimeMillis();
                jdbc.update("""
                    insert into household (household_id, head_resident_id, address_code, address_text, established_date)
                    values (?, ?, ?, ?, ?)
                    """, newHouseholdId, newHead, string(body.get("newAddressCode"), ""), newAddress, eventDate);
                // 対象住民を新世帯へ移動
                for (String rid : targets) {
                    jdbc.update("update resident set household_id = ?, address_text = ?, address_code = ? where resident_id = ?",
                        newHouseholdId, newAddress, string(body.get("newAddressCode"), ""), rid);
                    jdbc.update("update household_member set left_date = ? where household_id = ? and resident_id = ? and left_date is null",
                        eventDate, householdId, rid);
                    jdbc.update("""
                        insert into household_member (household_id, resident_id, relation_to_head, joined_date)
                        values (?, ?, ?, ?)
                        """, newHouseholdId, rid, rid.equals(newHead) ? "本人" : "—", eventDate);
                }
                Map<String, Object> tx = insertTransaction("HOUSEHOLD", newHead, newHouseholdId, "SPLIT", eventDate, null);
                publishHouseholdResidents(newHouseholdId, (String) tx.get("transactionId"), "SPLIT");
                publishHouseholdResidents(householdId, (String) tx.get("transactionId"), "SPLIT_REMAINING");
                tx.put("parentHouseholdId", householdId);
                tx.put("newHouseholdId", newHouseholdId);
                return ResponseEntity.status(201).body(tx);
            }
            case "MERGE" -> {
                String absorbingHouseholdId = string(body.get("absorbingHouseholdId"), null);
                if (absorbingHouseholdId == null || absorbingHouseholdId.isBlank()) {
                    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "MERGE には absorbingHouseholdId が必要です。"));
                }
                if (absorbingHouseholdId.equals(householdId)) {
                    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "同一世帯を合併先に指定できません。"));
                }
                Integer absorberExists = jdbc.queryForObject(
                    "select count(*) from household where household_id = ? and closed_date is null",
                    Integer.class, absorbingHouseholdId);
                if (absorberExists == null || absorberExists == 0) {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("HOUSEHOLD_NOT_FOUND", "吸収先世帯が見つかりません。"));
                }
                Map<String, Object> absorber = jdbc.queryForMap(
                    "select address_text, address_code from household where household_id = ?", absorbingHouseholdId);
                // 対象世帯の在籍全員を吸収先へ
                List<Map<String, Object>> moving = jdbc.queryForList(
                    "select resident_id from resident where household_id = ? and moved_out_date is null", householdId);
                if (moving.isEmpty()) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(error("HOUSEHOLD_EMPTY", "合併元世帯に在籍員がいません。"));
                }
                for (Map<String, Object> row : moving) {
                    String rid = String.valueOf(row.get("resident_id"));
                    jdbc.update("update resident set household_id = ?, address_text = ?, address_code = ? where resident_id = ?",
                        absorbingHouseholdId, absorber.get("address_text"), absorber.get("address_code"), rid);
                    jdbc.update("update household_member set left_date = ? where household_id = ? and resident_id = ? and left_date is null",
                        eventDate, householdId, rid);
                    jdbc.update("""
                        insert into household_member (household_id, resident_id, relation_to_head, joined_date)
                        values (?, ?, ?, ?)
                        """, absorbingHouseholdId, rid, "—", eventDate);
                }
                // 合併元を閉鎖
                jdbc.update("update household set closed_date = ? where household_id = ?", eventDate, householdId);
                Map<String, Object> tx = insertTransaction("HOUSEHOLD", newHead, absorbingHouseholdId, "MERGE", eventDate, null);
                publishHouseholdResidents(absorbingHouseholdId, (String) tx.get("transactionId"), "MERGE");
                tx.put("absorbedHouseholdId", householdId);
                tx.put("absorbingHouseholdId", absorbingHouseholdId);
                return ResponseEntity.status(201).body(tx);
            }
            default -> {
                // 任意操作（履歴のみ記録）
            }
        }
        Map<String, Object> tx = insertTransaction("HOUSEHOLD", newHead, householdId, operation, eventDate, null);
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

    /**
     * 出生連動: 戸籍からの出生通知を受け、親の世帯に新生児を登録する。
     * 入力:
     *   - parentResidentId: 親（同一世帯に既に在籍する世帯員 ID）
     *   - eventDate: 出生日
     *   - familyNameKanji / givenNameKanji / familyNameKana / givenNameKana
     *   - sex: M / F / U
     *   - relationToHead: 「子」「孫」等。省略時は「子」
     */
    @PostMapping("/birth")
    @Transactional
    public ResponseEntity<Map<String, Object>> birth(@RequestBody Map<String, Object> body) {
        String parentResidentId = string(body.get("parentResidentId"), null);
        if (parentResidentId == null || parentResidentId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "parentResidentId は必須です。"));
        }
        Map<String, Object> parent;
        try {
            parent = jdbc.queryForMap(
                "select household_id, address_code, address_text from resident where resident_id = ? and moved_out_date is null",
                parentResidentId);
        } catch (EmptyResultDataAccessException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("PARENT_NOT_FOUND", "親となる住民が在籍中で見つかりません。"));
        }
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        String familyKanji = string(body.get("familyNameKanji"), null);
        String givenKanji = string(body.get("givenNameKanji"), null);
        if (familyKanji == null || givenKanji == null || familyKanji.isBlank() || givenKanji.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "familyNameKanji / givenNameKanji は必須です。"));
        }
        String sex = string(body.get("sex"), "U");
        if (!"M".equals(sex) && !"F".equals(sex) && !"U".equals(sex)) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "sex は M / F / U のいずれかです。"));
        }
        String householdId = String.valueOf(parent.get("household_id"));
        String residentId = "B" + System.currentTimeMillis();
        jdbc.update("""
            insert into resident
              (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
               birth_date, sex, address_code, address_text, moved_in_date, restricted_flag, valid_from)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)
            """, residentId, householdId, familyKanji, givenKanji,
            string(body.get("familyNameKana"), ""), string(body.get("givenNameKana"), ""),
            eventDate, sex, string(parent.get("address_code"), ""), string(parent.get("address_text"), ""),
            eventDate, OffsetDateTime.now());
        jdbc.update("""
            insert into household_member (household_id, resident_id, relation_to_head, joined_date)
            values (?, ?, ?, ?)
            """, householdId, residentId, string(body.get("relationToHead"), "子"), eventDate);
        Map<String, Object> tx = insertTransaction("BIRTH", residentId, householdId, "BIRTH", eventDate, null);
        events.publishEvent(new ResidentChangedEvent(residentId, (String) tx.get("transactionId"), "BIRTH"));
        tx.put("parentResidentId", parentResidentId);
        return ResponseEntity.status(201).body(tx);
    }

    /**
     * 死亡連動: 戸籍からの死亡通知を受け、対象者を消除する。
     * - moved_out_date を死亡日に設定（除票化）
     * - 対象が世帯主だった場合は世帯主未設定とし、別途 HEAD_CHANGE 推奨アラートを返す
     * 入力:
     *   - residentId: 死亡者
     *   - eventDate: 死亡年月日
     */
    @PostMapping("/death")
    @Transactional
    public ResponseEntity<Map<String, Object>> death(@RequestBody Map<String, Object> body) {
        String residentId = string(body.get("residentId"), null);
        if (residentId == null || residentId.isBlank()) {
            return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", "residentId は必須です。"));
        }
        Map<String, Object> target;
        try {
            target = jdbc.queryForMap(
                "select household_id, moved_out_date from resident where resident_id = ?", residentId);
        } catch (EmptyResultDataAccessException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND", "対象住民が見つかりません。"));
        }
        if (target.get("moved_out_date") != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error("ALREADY_REMOVED", "既に除票済みです。"));
        }
        LocalDate eventDate = LocalDate.parse(string(body.get("eventDate"), LocalDate.now().toString()));
        String householdId = String.valueOf(target.get("household_id"));
        jdbc.update("update resident set moved_out_date = ?, valid_to = ? where resident_id = ?",
            eventDate, OffsetDateTime.now(), residentId);
        jdbc.update("update household_member set left_date = ? where household_id = ? and resident_id = ? and left_date is null",
            eventDate, householdId, residentId);
        // 世帯主だった場合は household.head_resident_id をクリア
        Integer wasHead = jdbc.queryForObject(
            "select count(*) from household where household_id = ? and head_resident_id = ?",
            Integer.class, householdId, residentId);
        boolean alertHeadChange = false;
        if (wasHead != null && wasHead > 0) {
            jdbc.update("update household set head_resident_id = null where household_id = ?", householdId);
            alertHeadChange = true;
        }
        Map<String, Object> tx = insertTransaction("DEATH", residentId, householdId, "DEATH", eventDate, null);
        events.publishEvent(new ResidentChangedEvent(residentId, (String) tx.get("transactionId"), "DEATH"));
        if (alertHeadChange) {
            tx.put("alert", Map.of("code", "HEAD_CHANGE_REQUIRED",
                "message", "世帯主が死亡しました。後継世帯主を HEAD_CHANGE で指定してください。"));
        }
        return ResponseEntity.status(201).body(tx);
    }

    /**
     * 戸籍異動連動の汎用受付（婚姻・離婚・養子縁組 等）。
     * 戸籍側 ID と reasonCode を受け、住民票記載を変更する。詳細は今後実装。
     */
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
