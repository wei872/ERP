package com.erp.controller;

import com.erp.model.Result;
import com.erp.security.JwtUtil;
import com.erp.service.AuditService;
import com.erp.service.RbacService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import javax.annotation.PostConstruct;
import javax.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired private JwtUtil jwtUtil;
    @Autowired private JdbcTemplate db;
    @Autowired private AuditService audit;
    @Autowired private RbacService rbac;
    private final ObjectMapper om = new ObjectMapper();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private static final List<String> ALL_MODULES = Arrays.asList(
        "生产模块","客户供应商","进销存管理","人力资源","财务管理","会计凭证","报表中心","质量管理","协同办公","设备管理","售后管理","系统维护"
    );

    @PostConstruct void seedUsers() {
        try {
            String[][] users = {
                {"admin","admin123","admin","系统管理员","13800000000","管理层","active"},
                {"zhangsan","123456","sales","张三","13811111111","销售部","active"},
                {"lisi","123456","warehouse","李四","13822222222","仓储部","active"},
                {"wangwu","123456","accounting","王五","13833333333","财务部","active"},
                {"zhaoliu","123456","production","赵六","13844444444","生产部","active"},
                {"sunqi","123456","hr","孙七","13855555555","人事部","active"},
                {"zhouba","123456","procurement","周八","13866666666","采购部","active"},
                {"wujiu","123456","aftersale","吴九","13877777777","售后部","active"},
            };
            for (String[] u : users) {
                ensureDefaultUser(u);
            }
        } catch (Exception ignored) {}
    }

    @GetMapping("/all-modules") public Result modules() { return Result.ok(ALL_MODULES); }

    @PostMapping("/login")
    public Result login(@RequestBody Map<String,String> body, HttpServletRequest req) {
        String u = body.get("username") == null ? "" : body.get("username").trim();
        String p = body.get("password") == null ? "" : body.get("password");
        String ip = audit.getIp(req);
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_user WHERE username=?", u);
            if (rows.isEmpty()) { audit.logLogin(u, ip, "失败-用户不存在"); return Result.error("用户名或密码错误"); }
            Map<String,Object> user = rows.get(0);
            String storedHash = String.valueOf(user.getOrDefault("password",""));
            if (!passwordMatches(p, storedHash)) { audit.logLogin(u, ip, "失败-密码错误"); return Result.error("用户名或密码错误"); }
            upgradeLegacyPassword(user, p, storedHash);
            String st = String.valueOf(user.getOrDefault("status","active"));
            if ("pending".equals(st)) { audit.logLogin(u, ip, "失败-未审核"); return Result.error("账号未审核"); }
            if ("disabled".equals(st)) { audit.logLogin(u, ip, "失败-已禁用"); return Result.error("账号已禁用"); }
            long uid = ((Number)user.get("id")).longValue();
            String role = String.valueOf(user.getOrDefault("role","sales"));
            String token = jwtUtil.generate(uid, u, role);
            Map<String,Object> result = new HashMap<>();
            result.put("token",token);
            Map<String,Object> cu = new HashMap<>(user); cu.remove("password");
            cu.put("permissions", parsePerms(user));
            result.put("user",cu);
            audit.logLogin(u, ip, "成功");
            return Result.ok(result);
        } catch (Exception e) { audit.logLogin(u, ip, "失败-异常"); return Result.error("登录失败: "+e.getMessage()); }
    }

    @PostMapping("/register")
    public Result register(@RequestBody Map<String,Object> body) {
        String un = String.valueOf(body.get("username"));
        try {
            Integer c = db.queryForObject("SELECT COUNT(*) FROM sys_user WHERE username=?", Integer.class, un);
            if (c != null && c > 0) return Result.error("用户名已存在");
            db.update("INSERT INTO sys_user(username,password,role,real_name,phone,email,department,status) VALUES(?,?,?,?,?,?,?,?)",
                un, encoder.encode(String.valueOf(body.get("password"))), body.get("role"), body.get("realName"),
                body.get("phone"), body.getOrDefault("email",""), body.getOrDefault("department",""), "pending");
            return Result.ok("注册成功，等待审核");
        } catch (Exception e) { return Result.error("注册失败: "+e.getMessage()); }
    }

    @GetMapping("/me")
    public Result me(HttpServletRequest req) { Map<String,Object> u = findUser(String.valueOf(req.getAttribute("user"))); return u!=null?Result.ok(u):Result.error("用户不存在"); }

    @GetMapping("/users")
    public Result users(HttpServletRequest req) {
        if (!"admin".equals(req.getAttribute("role"))) return Result.error("权限不足");
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_user");
        for (Map<String,Object> r : rows) { r.remove("password"); r.put("permissions", parsePerms(r)); }
        return Result.ok(rows);
    }

    @PostMapping("/approve/{id}") public Result approve(@PathVariable Long id, HttpServletRequest req) { return checkAdmin(req) ? (db.update("UPDATE sys_user SET status='active' WHERE id=?", id) > 0 ? Result.ok("ok") : Result.error("not found")) : Result.error("权限不足"); }
    @PostMapping("/disable/{id}") public Result disable(@PathVariable Long id, HttpServletRequest req) { return checkAdmin(req) ? (db.update("UPDATE sys_user SET status='disabled' WHERE id=?", id) > 0 ? Result.ok("ok") : Result.error("not found")) : Result.error("权限不足"); }
    @PostMapping("/enable/{id}")  public Result enable(@PathVariable Long id, HttpServletRequest req)  { return checkAdmin(req) ? (db.update("UPDATE sys_user SET status='active' WHERE id=?", id) > 0 ? Result.ok("ok") : Result.error("not found")) : Result.error("权限不足"); }
    @DeleteMapping("/delete/{id}")  public Result delete(@PathVariable Long id, HttpServletRequest req)  { return checkAdmin(req) ? (db.update("DELETE FROM sys_user WHERE id=?", id) > 0 ? Result.ok("ok") : Result.error("not found")) : Result.error("权限不足"); }

    @PostMapping("/permissions/{id}")
    public Result perms(@PathVariable Long id, @RequestBody List<Map<String,Object>> p, HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        try { db.update("UPDATE sys_user SET permissions=? WHERE id=?", om.writeValueAsString(p), id); return Result.ok("ok"); }
        catch (Exception e) { return Result.error("保存失败: "+e.getMessage()); }
    }

    // ── RBAC 角色菜单矩阵 ──
    @GetMapping("/rbac/roles") public Result rbacRoles(HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        return Result.ok(rbac.listRoles());
    }
    @GetMapping("/rbac/menus") public Result rbacMenus(HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        return Result.ok(rbac.listMenus());
    }
    @GetMapping("/rbac/matrix") public Result rbacMatrix(HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        return Result.ok(rbac.getMatrix());
    }
    @GetMapping("/rbac/role-menus/{roleId}") public Result rbacRoleMenus(@PathVariable Long roleId, HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        return Result.ok(rbac.getRoleMenus(roleId));
    }
    @PostMapping("/rbac/role-menus/{roleId}") public Result rbacSaveRoleMenus(@PathVariable Long roleId, @RequestBody List<Map<String,Object>> perms, HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        try {
            rbac.saveRoleMenus(roleId, perms);
            audit.log(String.valueOf(req.getAttribute("user")), "系统", "保存角色权限", "role_id="+roleId, audit.getIp(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error("保存失败: "+e.getMessage()); }
    }
    @GetMapping("/rbac/user-roles/{userId}") public Result rbacUserRoles(@PathVariable Long userId, HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        return Result.ok(rbac.getUserRoles(userId));
    }
    @PostMapping("/rbac/user-roles/{userId}") public Result rbacSaveUserRoles(@PathVariable Long userId, @RequestBody List<Long> roleIds, HttpServletRequest req) {
        if (!checkAdmin(req)) return Result.error("权限不足");
        try {
            rbac.saveUserRoles(userId, roleIds);
            audit.log(String.valueOf(req.getAttribute("user")), "系统", "保存用户角色", "user_id="+userId, audit.getIp(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error("保存失败: "+e.getMessage()); }
    }

    private boolean checkAdmin(HttpServletRequest req) { return "admin".equals(req.getAttribute("role")); }

    private Map<String,Object> findUser(String un) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_user WHERE username=?", un);
            if (!rows.isEmpty()) { Map<String,Object> r = rows.get(0); r.remove("password"); r.put("permissions",parsePerms(r)); return r; }
        } catch (Exception ignored) {}
        return null;
    }

    private void ensureDefaultUser(String[] u) {
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_user WHERE username=?", u[0]);
        if (rows.isEmpty()) {
            db.update("INSERT INTO sys_user(username,password,role,real_name,phone,department,status) VALUES(?,?,?,?,?,?,?)",
                u[0], encoder.encode(u[1]), u[2], u[3], u[4], u[5], u[6]);
            return;
        }
        if ("admin".equals(u[0])) {
            Map<String,Object> admin = rows.get(0);
            String storedHash = String.valueOf(admin.getOrDefault("password",""));
            if (!passwordMatches(u[1], storedHash)) {
                db.update("UPDATE sys_user SET password=? WHERE username=?", encoder.encode(u[1]), u[0]);
            }
            db.update("UPDATE sys_user SET role=?, real_name=?, phone=?, department=?, status=? WHERE username=?",
                u[2], u[3], u[4], u[5], u[6], u[0]);
        }
    }

    private boolean passwordMatches(String raw, String stored) {
        if (stored == null || stored.isEmpty()) return false;
        if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
            try { return encoder.matches(raw, stored); } catch (Exception e) { return false; }
        }
        return raw.equals(stored);
    }

    private void upgradeLegacyPassword(Map<String,Object> user, String raw, String stored) {
        if (stored != null && !stored.startsWith("$2a$") && !stored.startsWith("$2b$") && !stored.startsWith("$2y$")) {
            db.update("UPDATE sys_user SET password=? WHERE id=?", encoder.encode(raw), user.get("id"));
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String,Object>> parsePerms(Map<String,Object> user) {
        Object sp = user.get("permissions");
        if (sp != null && !sp.toString().isEmpty()) {
            try { return om.readValue(sp.toString(), List.class); } catch (Exception e) {}
        }
        String role = String.valueOf(user.getOrDefault("role","sales"));
        // RBAC 表兜底：若 sys_role_menu 有数据则优先用
        try {
            List<Map<String,Object>> rbacPerms = rbac.permsByRoleCode(role);
            if (!rbacPerms.isEmpty()) return rbacPerms;
        } catch (Exception ignored) {}
        // 兜底兜底：硬编码映射
        Map<String,List<String>> m = new HashMap<>();
        m.put("admin", ALL_MODULES);
        m.put("sales",Arrays.asList("客户供应商","进销存管理","报表中心"));
        m.put("aftersale",Arrays.asList("售后管理","报表中心"));
        m.put("warehouse",Arrays.asList("进销存管理","报表中心"));
        m.put("accounting",Arrays.asList("财务管理","会计凭证","报表中心"));
        m.put("production",Arrays.asList("生产模块","质量管理","设备管理","报表中心"));
        m.put("hr",Arrays.asList("人力资源","协同办公","报表中心"));
        m.put("procurement",Arrays.asList("客户供应商","进销存管理","报表中心"));
        List<String> mods = m.getOrDefault(role, Collections.emptyList());
        List<Map<String,Object>> perms = new ArrayList<>();
        for (String mod : mods) { Map<String,Object> p = new HashMap<>(); p.put("module",mod); p.put("canView",true); p.put("canAdd",false); p.put("canEdit",false); p.put("canDelete",false); perms.add(p); }
        return perms;
    }
}
