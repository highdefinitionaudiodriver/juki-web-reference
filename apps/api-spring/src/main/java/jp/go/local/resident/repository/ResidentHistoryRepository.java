package jp.go.local.resident.repository;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jp.go.local.resident.domain.Resident;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 住民の履歴管理（SCD-2）。
 *
 * - resident テーブルは現在値のみ保持。
 * - すべての更新で resident_history に jsonb スナップショットを書き込む。
 * - 時点照会は valid_from <= asOf < valid_to で 1 行を特定。
 * - 物理削除は禁止（取消は transaction.parent_transaction_id を辿る）。
 */
@Repository
public class ResidentHistoryRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ResidentHistoryRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    /** 新しいスナップショットを追加（前の行は valid_to を closeAt にクローズ）。 */
    public void append(Resident resident, String transactionId, OffsetDateTime now) {
        jdbc.update("""
            update resident_history
               set valid_to = ?
             where resident_id = ? and valid_to is null
            """, now, resident.residentId());
        String snapshotJson = toJson(resident);
        jdbc.update(
            "insert into resident_history (resident_id, valid_from, valid_to, snapshot, transaction_id) values (?, ?, null, ?::jsonb, ?)",
            new Object[]{resident.residentId(), now, snapshotJson, transactionId},
            new int[]{Types.VARCHAR, Types.TIMESTAMP_WITH_TIMEZONE, Types.OTHER, Types.VARCHAR}
        );
    }

    /** 指定時点で有効だったスナップショットを返す。 */
    public Optional<Map<String, Object>> findSnapshotAt(String residentId, OffsetDateTime asOf) {
        return jdbc.query("""
            select snapshot::text as snapshot, valid_from, valid_to, transaction_id
              from resident_history
             where resident_id = ?
               and valid_from <= ?
               and (valid_to is null or valid_to > ?)
             order by valid_from desc
             limit 1
            """, rs -> {
                if (!rs.next()) return Optional.<Map<String, Object>>empty();
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> snap = mapper.readValue(rs.getString("snapshot"), Map.class);
                    snap.put("__validFrom", rs.getObject("valid_from"));
                    snap.put("__validTo", rs.getObject("valid_to"));
                    snap.put("__transactionId", rs.getString("transaction_id"));
                    return Optional.of(snap);
                } catch (JsonProcessingException e) {
                    return Optional.<Map<String, Object>>empty();
                }
            }, residentId, asOf, asOf);
    }

    /** 異動履歴一覧（resident_history ではなく transaction を返す。Node 版互換）。 */
    public List<Map<String, Object>> listTransactions(String residentId) {
        return jdbc.query("""
            select transaction_id, resident_id, household_id, type_code, reason_code,
                   event_date, processed_date, receiver_office, status, parent_transaction_id
              from transaction
             where resident_id = ?
             order by event_date desc, transaction_id desc
            """, (rs, rowNum) -> {
                Map<String, Object> tx = new LinkedHashMap<>();
                tx.put("transactionId", rs.getString("transaction_id"));
                tx.put("residentId", rs.getString("resident_id"));
                tx.put("householdId", rs.getString("household_id"));
                tx.put("typeCode", rs.getString("type_code"));
                tx.put("reasonCode", rs.getString("reason_code"));
                tx.put("eventDate", rs.getObject("event_date"));
                tx.put("processedDate", rs.getObject("processed_date"));
                tx.put("receiverOffice", rs.getString("receiver_office"));
                tx.put("status", rs.getString("status"));
                tx.put("parentTransactionId", rs.getString("parent_transaction_id"));
                return tx;
            }, residentId);
    }

    private String toJson(Resident resident) {
        try {
            return mapper.writeValueAsString(resident);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize resident snapshot", e);
        }
    }
}
