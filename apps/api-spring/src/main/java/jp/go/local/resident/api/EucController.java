package jp.go.local.resident.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/euc")
public class EucController {

    @PostMapping("/query")
    public ResponseEntity<Map<String, Object>> query(@RequestBody Map<String, Object> body) {
        boolean includeMyNumber = Boolean.TRUE.equals(body.get("includeMyNumber")) || outputFields(body).contains("myNumber");
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", "EUC-" + System.currentTimeMillis());
        response.put("status", includeMyNumber ? "QUEUED" : "DONE");
        response.put("progress", includeMyNumber ? 10 : 100);
        response.put("resultUrl", includeMyNumber ? null : "/euc/result.csv");
        response.put("error", null);
        response.put("requiresSecondApproval", includeMyNumber);
        return ResponseEntity.status(202).body(response);
    }

    @SuppressWarnings("unchecked")
    private List<String> outputFields(Map<String, Object> body) {
        Object fields = body.get("outputFields");
        return fields instanceof List<?> list ? (List<String>) list : List.of();
    }
}
