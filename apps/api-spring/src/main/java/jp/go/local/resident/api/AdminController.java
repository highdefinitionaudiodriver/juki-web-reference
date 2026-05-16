package jp.go.local.resident.api;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final JdbcTemplate jdbc;

    public AdminController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return jdbc.queryForList("select user_id, employee_no, department, full_name, active from user_account order by user_id limit 100");
    }

    @PostMapping("/users")
    public Map<String, Object> createUser(@RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into user_account (user_id, employee_no, department, full_name, active)
            values (?, ?, ?, ?, true)
            on conflict (user_id) do update set employee_no = excluded.employee_no, department = excluded.department, full_name = excluded.full_name
            """, body.get("userId"), body.get("employeeNo"), body.get("department"), body.get("fullName"));
        return body;
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> roles() {
        return jdbc.queryForList("select role_id, name, description from role order by role_id");
    }

    @PostMapping("/roles")
    public Map<String, Object> createRole(@RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into role (role_id, name, description)
            values (?, ?, ?)
            on conflict (role_id) do update set name = excluded.name, description = excluded.description
            """, body.get("roleId"), body.get("name"), body.get("description"));
        return body;
    }

    @PostMapping("/permissions")
    public Map<String, Object> updatePermission(@RequestBody Map<String, Object> body) {
        jdbc.update("""
            insert into permission (role_id, resource, action, mask)
            values (?, ?, ?, ?)
            on conflict (role_id, resource, action) do update set mask = excluded.mask
            """, body.get("roleId"), body.get("resource"), body.get("action"), body.get("mask"));
        return body;
    }
}
