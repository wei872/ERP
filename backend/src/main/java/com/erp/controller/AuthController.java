package com.erp.controller;

import com.erp.model.Result;
import com.erp.security.JwtUtil;
import com.erp.service.AuditService;
import com.erp.service.RbacService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import javax.annotation.PostConstruct;
import javax.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired private JwtUtil jwtUtil;
    @Autowired private JdbcTemplate db;
    @Autowired private AuditService audit;
    @Autowired private RbacService rbac;
    private final ObjectMapper om = new ObjectMapper();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** 是否自动播种演示账号（生产环境通过 SEED_DEMO_USERS=false 关闭） */
    @Value("${app.seed-demo-users:true}")
    private boolean seedDemoUsers;
    /** 首次创建 admin 时使用的初始密码（留空则用默认值；绝不覆盖已有密码） */
    @Value("${app.seed-admin-password:}")
    private String seedAdminPassword;

    private static final List<String> ALL_MODULES = Arrays.asList(
        "生产模块","客户供应商","进销存管理","人力资源","财务管理","会计凭证","报表中心","质量管理","协同办公","设备管理","售后管理","系统维护"
    );

    @PostConstruct void seedUsers() {
        try {
            // admin 账号：任何环境都保证存在（仅首次创建，绝不覆盖已有密码）。
            // 生产部署请通过 SEED_ADMIN_PASSWORD 指定强初始密码。
            String adminPw = (seedAdminPassword != null && !seedAdminPassword.isEmpty()) ? seedAdminPassword : "admin123";
            ensureDefaultUser(new String[]{"admin",adminPw,"admin","系统管理员","13800000000","管理层","active"});
            // 其余演示账号：仅在允许播种演示数据时创建
            if (!seedDemoUsers) return;
            String[][] users = {
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

    // ── 登录限流：同一「用户名+IP」连续失败 5 次后锁定 15 分钟，防暴力破解 ──
    private static final int MAX_ATTEMPTS = 5;
    private static final long LOCK_WINDOW_MS = 15 * 60 * 1000L;
    private static final Map<String, long[]> ATTEMPTS = new ConcurrentHashMap<>();

    private String attemptKey(String u, String ip) { return u.toLowerCase() + "|" + (ip == null ? "" : ip); }

    /** @return 锁定截止时间戳；0 表示未锁定 */
    private long lockedUntil(String key) {
        long[] rec = ATTEMPTS.get(key);
        if (rec != null && rec[0] >= MAX_ATTEMPTS && System.currentTimeMillis() < rec[1]) return rec[1];
        return 0L;
    }

    private void recordFailure(String key) {
        if (ATTEMPTS.size() > 10000) ATTEMPTS.clear(); // 内存保护：上限兜底
        long now = System.currentTimeMillis();
        long[] rec = ATTEMPTS.get(key);
        if (rec == null || now >= rec[1]) rec = new long[]{0, now + LOCK_WINDOW_MS};
        rec[0]++;
        ATTEMPTS.put(key, rec);
    }

    @PostMapping("/login")
    public Result login(@RequestBody Map<String,String> body, HttpServletRequest req) {
        String u = body.get("username") == null ? "" : body.get("username").trim();
        String p = body.get("password") == null ? "" : body.get("password");
        String ip = audit.getIp(req);
        String aKey = attemptKey(u, ip);
        long lockUntil = lockedUntil(aKey);
        if (lockUntil > 0) {
            long minutes = (lockUntil - System.currentTimeMillis()) / 60000 + 1;
            audit.logLogin(u, ip, "失败-已锁定");
            return Result.error("登录失败次数过多，账号已临时锁定，请 " + minutes + " 分钟后再试");
        }
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_user WHERE username=?", u);
            if (rows.isEmpty()) { recordFailure(aKey); audit.logLogin(u, ip, "失败-用户不存在"); return Result.error("用户名或密码错误"); }
            Map<String,Object> user = rows.get(0);
            String storedHash = String.valueOf(user.getOrDefault("password",""));
            if (!passwordMatches(p, storedHash)) { recordFailure(aKey); audit.logLogin(u, ip, "失败-密码错误"); return Result.error("用户名或密码错误"); }
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
            ATTEMPTS.remove(aKey);
            audit.logLogin(u, ip, "成功");
            return Result.ok(result);
        } catch (Exception e) { recordFailure(aKey); audit.logLogin(u, ip, "失败-异常"); return Result.error("登录失败，请稍后重试"); }
    }

    private static final java.util.regex.Pattern USERNAME_PATTERN = java.util.regex.Pattern.compile("^[a-zA-Z0-9_]{3,32}$");

    /** 密码强度：至少 8 位，且同时包含字母与数字 */
    private boolean validPasswordPolicy(String pw) {
        if (pw == null || pw.length() < 8 || pw.length() > 64) return false;
        boolean letter = false, digit = false;
        for (char c : pw.toCharArray()) {
            if (Character.isLetter(c)) letter = true;
            else if (Character.isDigit(c)) digit = true;
        }
        return letter && digit;
    }

    @PostMapping("/register")
    public Result register(@RequestBody Map<String,Object> body) {
        String un = body.get("username") == null ? "" : String.valueOf(body.get("username")).trim();
        String pw = body.get("password") == null ? "" : String.valueOf(body.get("password"));
        if (!USERNAME_PATTERN.matcher(un).matches()) return Result.error("用户名需为 3-32 位字母、数字或下划线");
        if (!validPasswordPolicy(pw)) return Result.error("密码至少 8 位，且需同时包含字母和数字");
        try {
            Integer c = db.queryForObject("SELECT COUNT(*) FROM sys_user WHERE username=?", Integer.class, un);
            if (c != null && c > 0) return Result.error("用户名已存在");
            db.update("INSERT INTO sys_user(username,password,role,real_name,phone,email,department,status) VALUES(?,?,?,?,?,?,?,?)",
                un, encoder.encode(pw), body.get("role"), body.get("realName"),
                body.get("phone"), body.getOrDefault("email",""), body.getOrDefault("department",""), "pending");
            return Result.ok("注册成功，等待审核");
        } catch (Exception e) { return Result.error("注册失败，请稍后重试"); }
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

    /**
     * 仅在用户不存在时创建。已存在的账号（包括 admin）绝不在重启时被覆盖
     * 密码或资料 —— 否则运维改过的密码会在下次重启时被重置为演示密码。
     */
    private void ensureDefaultUser(String[] u) {
        List<Map<String,Object>> rows = db.queryForList("SELECT id FROM sys_user WHERE username=?", u[0]);
        if (rows.isEmpty()) {
            db.update("INSERT INTO sys_user(username,password,role,real_name,phone,department,status) VALUES(?,?,?,?,?,?,?)",
                u[0], encoder.encode(u[1]), u[2], u[3], u[4], u[5], u[6]);
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
