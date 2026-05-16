package jp.go.local.resident.api;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jp.go.local.resident.authz.MaskService;
import jp.go.local.resident.domain.Resident;
import jp.go.local.resident.repository.ResidentHistoryRepository;
import jp.go.local.resident.repository.ResidentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * 住民 API。Node 版 apps/api/src/server.js の /api/v1/residents/* と互換。
 *
 * - 検索: 抑止対象は権限なしには件数にも含めない (Node 版と同じ挙動)
 * - 詳細: 抑止対象を見えないロールは 404 を返す
 * - 時点照会: ?asOf=2025-01-01T00:00:00+09:00 で過去スナップショットを返す
 */
@RestController
@RequestMapping("/api/v1/residents")
public class ResidentController {

    private final ResidentRepository repository;
    private final ResidentHistoryRepository historyRepository;
    private final MaskService maskService;

    public ResidentController(ResidentRepository repository,
                              ResidentHistoryRepository historyRepository,
                              MaskService maskService) {
        this.repository = repository;
        this.historyRepository = historyRepository;
        this.maskService = maskService;
    }

    @PostMapping("/search")
    public Map<String, Object> search(@RequestBody Map<String, Object> criteria, Authentication authentication) {
        int page = number(criteria.get("page"), 1);
        int size = number(criteria.get("size"), 50);
        boolean allowRestricted = maskService.canSeeRestricted(authentication);
        var items = repository.search(
            (String) criteria.getOrDefault("name", null),
            Boolean.TRUE.equals(criteria.get("includeRemoved")),
            allowRestricted,
            size,
            (page - 1) * size
        );
        List<String> unmask = unmaskParams(null);
        List<Map<String, Object>> visibleItems = new ArrayList<>();
        for (Resident r : items) {
            Map<String, Object> payload = maskService.toResponse(r, authentication, unmask);
            if (payload != null) visibleItems.add(payload);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", visibleItems.size());
        response.put("page", page);
        response.put("size", size);
        response.put("items", visibleItems);
        return response;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> show(
        @PathVariable("id") String id,
        @RequestParam(name = "asOf", required = false) String asOf,
        @RequestParam(name = "unmask", required = false) List<String> unmask,
        Authentication authentication
    ) {
        // 時点照会
        if (asOf != null && !asOf.isBlank()) {
            OffsetDateTime at = parseOffsetDateTime(asOf);
            if (at == null) return ResponseEntity.badRequest().build();
            return historyRepository.findSnapshotAt(id, at)
                .map(snapshot -> ResponseEntity.ok(snapshot))
                .orElseGet(() -> ResponseEntity.notFound().build());
        }

        return repository.findById(id)
            .map(resident -> maskService.toResponse(resident, authentication, unmaskParams(unmask)))
            .filter(payload -> payload != null)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * 異動履歴。抑止対象に対しては Node 版と同じく 404。
     */
    @GetMapping("/{id}/history")
    public ResponseEntity<List<Map<String, Object>>> history(@PathVariable("id") String id, Authentication authentication) {
        var resident = repository.findById(id).orElse(null);
        if (resident == null || maskService.applyResidentMask(resident, authentication) == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(historyRepository.listTransactions(id));
    }

    private static OffsetDateTime parseOffsetDateTime(String s) {
        try {
            return OffsetDateTime.parse(s);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static List<String> unmaskParams(List<String> raw) {
        return raw == null ? List.of() : raw;
    }

    private int number(Object value, int defaultValue) {
        return value instanceof Number number ? number.intValue() : defaultValue;
    }
}
