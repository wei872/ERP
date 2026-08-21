package com.erp.controller;

import com.erp.model.Result;
import com.erp.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.*;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 通用 CRUD —— v2 数据基础重构版。
 * 写入侧三道防线：
 *   1) 列白名单：只接受 INFORMATION_SCHEMA 里的真实列（MetaService），杜绝任意列名拼接；
 *   2) 类型转换：按列 JDBC 类型把前端值规范化（空串→null、数字串→BigDecimal/Long），错误就地报人话；
 *   3) 字典校验：sys_dict_column 绑定的状态列，取值必须命中 sys_dict_item。
 * 联动钩子：库存联动硬失败（异常上抛、整体回滚）；凭证生成软失败（记日志、结果带 warning）。
 */
@RestController
@RequestMapping("/data")
public class DataController {

    @Autowired private JdbcTemplate db; @Autowired private DataSource ds;
    @Autowired private AuditService audit; @Autowired private FinanceService finance; @Autowired private InventoryService inventory;
    @Autowired private MetaService meta;

    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");
    private static final Map<String, Set<String>> TABLE_ROLE_MAP = new LinkedHashMap<>();
    static {
        TABLE_ROLE_MAP.put("trade_", new HashSet<>(Arrays.asList("admin","sales","warehouse","procurement")));
        TABLE_ROLE_MAP.put("finance_", new HashSet<>(Arrays.asList("admin","accounting")));
        TABLE_ROLE_MAP.put("voucher_", new HashSet<>(Arrays.asList("admin","accounting")));
        TABLE_ROLE_MAP.put("account_", new HashSet<>(Arrays.asList("admin","accounting")));
        TABLE_ROLE_MAP.put("prod_", new HashSet<>(Arrays.asList("admin","production")));
        TABLE_ROLE_MAP.put("quality_", new HashSet<>(Arrays.asList("admin","production")));
        TABLE_ROLE_MAP.put("equip_", new HashSet<>(Arrays.asList("admin","production")));
        TABLE_ROLE_MAP.put("hr_", new HashSet<>(Arrays.asList("admin","hr")));
        TABLE_ROLE_MAP.put("oa_", new HashSet<>(Arrays.asList("admin","hr")));
        TABLE_ROLE_MAP.put("cust_", new HashSet<>(Arrays.asList("admin","sales","procurement")));
        TABLE_ROLE_MAP.put("supp_", new HashSet<>(Arrays.asList("admin","sales","procurement")));
        TABLE_ROLE_MAP.put("aftersale_", new HashSet<>(Arrays.asList("admin","aftersale")));
        TABLE_ROLE_MAP.put("rpt_", new HashSet<>(Arrays.asList("admin")));
        TABLE_ROLE_MAP.put("sys_", new HashSet<>(Arrays.asList("admin")));
        TABLE_ROLE_MAP.put("fin_", new HashSet<>(Arrays.asList("admin","accounting")));
    }

    /** 文本列（搜索用），来自元数据缓存 */
    private List<String> getTextColumns(String t) {
        List<String> cols = new ArrayList<>();
        for (Map<String,Object> c : meta.columns(t)) {
            if ("string".equals(c.get("uiType"))) cols.add(String.valueOf(c.get("name")));
        }
        return cols;
    }

    private boolean canRead(String role, String table) {
        if ("admin".equals(role)) return true;
        for (Map.Entry<String, java.util.Set<String>> e : TABLE_ROLE_MAP.entrySet()) {
            if (table.startsWith(e.getKey())) return e.getValue().contains(role);
        }
        return false;
    }

    /** 🔐 admin 全可写；副账号只能写本角色前缀下的表，跨模块写一律拒绝。 */
    private boolean canWrite(String role, String table) {
        if ("admin".equals(role)) return true;
        for (Map.Entry<String, java.util.Set<String>> e : TABLE_ROLE_MAP.entrySet()) {
            if (table.startsWith(e.getKey())) return e.getValue().contains(role);
        }
        return false;
    }

    private String safe(String t) {
        if (!VALID.matcher(t).matches()) throw new IllegalArgumentException("无效表名: "+t);
        if (!meta.tableExists(t)) throw new IllegalArgumentException("表不存在: "+t);
        return t;
    }

    /** 列白名单过滤 + 按列类型规范化值 */
    private Map<String,Object> sanitize(String table, Map<String,Object> body) {
        Map<String,Object> typed = new LinkedHashMap<>();
        Map<String,Map<String,Object>> colMap = new HashMap<>();
        for (Map<String,Object> c : meta.columns(table)) colMap.put(String.valueOf(c.get("name")), c);
        for (Map.Entry<String,Object> e : body.entrySet()) {
            String k = e.getKey();
            if ("id".equals(k) || "_rowId".equals(k)) continue;
            Map<String,Object> col = colMap.get(k);
            if (col == null) continue; // 非真实列，直接丢弃
            typed.put(k, coerce(k, String.valueOf(col.get("jdbcType")), e.getValue()));
        }
        return typed;
    }

    private Object coerce(String col, String jdbcType, Object v) {
        if (v == null) return null;
        String s = String.valueOf(v);
        switch (String.valueOf(jdbcType)) {
            case "decimal": case "double": case "float":
                if (s.trim().isEmpty()) return null;
                try { return new BigDecimal(s.trim()); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("字段 " + col + " 需要数字，收到: \"" + s + "\""); }
            case "int": case "bigint": case "smallint": case "tinyint":
                if (s.trim().isEmpty()) return null;
                try { return Long.parseLong(s.trim().replaceFirst("\\.0+$", "")); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("字段 " + col + " 需要整数，收到: \"" + s + "\""); }
            case "date": case "datetime": case "timestamp":
                return s.trim().isEmpty() ? null : s.trim();
            default:
                return s.isEmpty() ? null : s; // 空字符串转 null，防止 NOT NULL/DATE 报晦涩错误
        }
    }

    private int clamp(int v, int mn, int mx) { return Math.max(mn, Math.min(v, mx)); }
    private Map<String,Object> map(Object... entries) {
        Map<String,Object> data = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) data.put(String.valueOf(entries[i]), entries[i + 1]);
        return data;
    }

    @GetMapping("/init-db")
    public Result init(HttpServletRequest req) {
        if (!"admin".equals(String.valueOf(req.getAttribute("role")))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> tables = meta.listTables();
            meta.evict(null); // 元数据缓存刷新
            return Result.ok(map("success",true,"tableCount",tables.size(),"registered",tables.size()));
        } catch (Exception e) { return Result.error("DB: "+e.getMessage()); }
    }

    @GetMapping("/{table}")
    public Result query(@PathVariable String table, @RequestParam(defaultValue="1") int page,
                        @RequestParam(defaultValue="15") int size, @RequestParam(defaultValue="") String search,
                        HttpServletRequest req) {
        try {
            String t = safe(table);
            String role = String.valueOf(req.getAttribute("role"));
            if (!canRead(role, t)) return Result.error("权限不足");
            page=clamp(page,1,999999); size=clamp(size,1,200);
            StringBuilder where=new StringBuilder();
            List<Object> params=new ArrayList<>();
            if(!search.isEmpty()){
                List<String> cols = getTextColumns(t);
                if(!cols.isEmpty()){
                    where.append(" WHERE (");
                    for(int i=0;i<cols.size();i++){
                        if(i>0)where.append(" OR ");
                        where.append("`").append(cols.get(i)).append("` LIKE ?");
                        params.add("%"+search+"%");
                    }
                    where.append(")");
                }
            }
            Long total=db.queryForObject("SELECT COUNT(*) FROM "+t+where,Long.class,params.toArray());
            params.add(size);params.add((page-1)*size);
            List<Map<String,Object>> rows=db.queryForList("SELECT * FROM "+t+where+" LIMIT ? OFFSET ?",params.toArray());
            return Result.ok(map("total",total,"page",page,"rows",rows));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("查询失败: " + e.getMessage());
        }
    }

    @Transactional
    @PostMapping("/{table}")
    public Result insert(@PathVariable String table, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        String role=String.valueOf(req.getAttribute("role"));
        if(!canWrite(role, table)) return Result.error("权限不足");
        try {
            String t=safe(table);
            if(body.isEmpty())return Result.error("数据为空");
            meta.validateDictValues(t, body);
            Map<String,Object> clean = sanitize(t, body);
            if(clean.isEmpty())return Result.error("无可插入字段（提交字段均不是表的真实列）");
            StringBuilder sb=new StringBuilder("INSERT INTO "+t+" ("),vb=new StringBuilder(" VALUES (");
            List<Object> params=new ArrayList<>();boolean first=true;
            for(Map.Entry<String,Object> e:clean.entrySet()){
                if(!first){sb.append(",");vb.append(",");}
                sb.append("`").append(e.getKey()).append("`");
                vb.append("?");
                params.add(e.getValue());
                first=false;
            }
            sb.append(")").append(vb.append(")"));
            db.update(sb.toString(),params.toArray());
            Long newId=db.queryForObject("SELECT LAST_INSERT_ID()",Long.class);
            audit.log(String.valueOf(req.getAttribute("user")),table,"新增","id="+newId,audit.getIp(req));
            String warning = runInsertHooks(t, newId, clean);
            Map<String,Object> data = new HashMap<>();
            data.put("id", newId);
            if (warning != null) data.put("warning", warning);
            return Result.ok(data);
        }catch(IllegalArgumentException e){return Result.error(e.getMessage());}
        catch(Exception e){return Result.error("新增失败: "+(e.getMessage() != null ? e.getMessage() : e.toString()));}
    }

    /**
     * 单据联动钩子 —— 数据完整性分两级：
     *   硬（异常上抛→@Transactional 整体回滚）：库存主/明细联动 —— 库存真源不容静默断裂；
     *   软（日志+warning）：销售/采购凭证补生成 —— 财务可事后手动补（/biz/finance/voucher-from-*）。
     */
    private String runInsertHooks(String t, Long newId, Map<String,Object> body) {
        // 库存联动（硬）
        if(t.equals("trade_stock_in_main")) inventory.applyStockInDoc(str(body.get("in_no")), str(body.getOrDefault("warehouse","默认仓")), str(body.get("ref_no")));
        if(t.equals("trade_stock_out_main")) inventory.applyStockOutDoc(str(body.get("out_no")), str(body.getOrDefault("warehouse","默认仓")), str(body.get("ref_no")));
        if(t.equals("trade_stock_in_detail")) inventory.applyStockInLine(body);
        if(t.equals("trade_stock_out_detail")) inventory.applyStockOutLine(body);
        // 凭证生成（软）
        try {
            if(t.equals("trade_sales_main")) finance.generateVoucherFromSale(newId);
            if(t.equals("trade_purchase_main")) finance.generateVoucherFromPurchase(newId);
        } catch (Exception e) {
            System.err.println("[voucher-hook] " + t + " id=" + newId + " 凭证生成失败(不阻断，可手动补): " + e.getMessage());
            return "单据已保存，但凭证自动生成失败：" + e.getMessage() + "（可在会计模块手动补生成）";
        }
        return null;
    }

    private String str(Object o) { return o == null ? "" : String.valueOf(o); }

    @Transactional
    @PutMapping("/{table}/{id}")
    public Result update(@PathVariable String table, @PathVariable Long id, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        if(!canWrite(String.valueOf(req.getAttribute("role")), table)) return Result.error("权限不足");
        try{String t=safe(table);
            meta.validateDictValues(t, body);
            Map<String,Object> clean = sanitize(t, body);
            if(clean.isEmpty())return Result.error("无更新字段（提交字段均不是表的真实列）");
            StringBuilder sb=new StringBuilder("UPDATE "+t+" SET ");List<Object> params=new ArrayList<>();
            for(Map.Entry<String,Object> e:clean.entrySet()){
                if(params.size()>0)sb.append(",");
                sb.append("`").append(e.getKey()).append("`=?");
                params.add(e.getValue());
            }
            sb.append(" WHERE id=?");params.add(id);int n=db.update(sb.toString(),params.toArray());
            audit.log(String.valueOf(req.getAttribute("user")),table,"修改","id="+id,audit.getIp(req));
            return n>0?Result.ok("修改成功"):Result.error("记录不存在");
        }catch(IllegalArgumentException e){return Result.error(e.getMessage());}
        catch(Exception e){return Result.error("修改失败: "+(e.getMessage() != null ? e.getMessage() : e.toString()));}
    }

    @Transactional
    @DeleteMapping("/{table}/{id}")
    public Result delete(@PathVariable String table, @PathVariable Long id, HttpServletRequest req) {
        if(!canWrite(String.valueOf(req.getAttribute("role")), table)) return Result.error("权限不足");
        try{String t=safe(table);int n=db.update("DELETE FROM "+t+" WHERE id=?",id);
            audit.log(String.valueOf(req.getAttribute("user")),table,"删除","id="+id,audit.getIp(req));
            return n>0?Result.ok("删除成功"):Result.error("记录不存在");
        }catch(Exception e){
            String msg = e.getMessage() == null ? e.toString() : e.getMessage();
            if (msg.contains("a foreign key constraint fails")) return Result.error("删除失败：存在关联明细/引用记录（外键保护），请先处理子数据");
            return Result.error("删除失败: "+msg);
        }
    }
}
