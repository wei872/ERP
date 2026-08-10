package com.erp.controller;

import com.erp.model.Result;
import com.erp.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import javax.sql.DataSource;
import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/data")
public class DataController {

    @Autowired private JdbcTemplate db; @Autowired private DataSource ds;
    @Autowired private AuditService audit; @Autowired private FinanceService finance; @Autowired private InventoryService inventory;
    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");
    private static final Pattern COL_PATTERN = Pattern.compile("^[a-zA-Z0-9_]{1,64}$");
    private static final Map<String, List<String>> TEXT_COLS_CACHE = new ConcurrentHashMap<>();
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

    private List<String> getTextColumns(String t) {
        return TEXT_COLS_CACHE.computeIfAbsent(t, tbl -> {
            List<String> cols = new ArrayList<>();
            try (Connection c = ds.getConnection()) {
                ResultSet rs = c.getMetaData().getColumns(null, null, tbl, null);
                while (rs.next()) {
                    String typeName = rs.getString("TYPE_NAME");
                    if (typeName != null && typeName.toUpperCase().matches(".*(CHAR|TEXT).*")) {
                        String col = rs.getString("COLUMN_NAME");
                        if (COL_PATTERN.matcher(col).matches()) {
                            cols.add(col);
                        }
                    }
                }
            } catch (Exception ignored) {}
            return cols;
        });
    }

    private boolean canRead(String role, String table) {
        if ("admin".equals(role)) return true;
        for (Map.Entry<String, java.util.Set<String>> e : TABLE_ROLE_MAP.entrySet()) {
            if (table.startsWith(e.getKey())) return e.getValue().contains(role);
        }
        // 未登记前缀的表一律拒绝，避免越权读取
        return false;
    }

    /** 🔐 后端权限校验 — admin 全可写；副账号只能写本角色前缀下的表，跨模块写一律拒绝。
     *  细粒度 canAdd/canEdit/canDelete 仍由前端按 sys_user.permissions 控制；此处仅做模块级安全边界。*/
    private boolean canWrite(String role, String table) {
        if ("admin".equals(role)) return true;
        for (Map.Entry<String, java.util.Set<String>> e : TABLE_ROLE_MAP.entrySet()) {
            if (table.startsWith(e.getKey())) return e.getValue().contains(role);
        }
        return false;
    }

    private String safe(String t) {
        if (!VALID.matcher(t).matches()) throw new IllegalArgumentException("无效表名: "+t);
        try { db.queryForObject("SELECT COUNT(*) FROM "+t, Integer.class); return t; }
        catch (Exception e) { throw new IllegalArgumentException("表不存在: "+t); }
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
        try (Connection c = ds.getConnection()) {
            DatabaseMetaData m = c.getMetaData(); ResultSet rs = m.getTables(null,null,"%",new String[]{"TABLE"});
            int n=0; List<String> names=new ArrayList<>();
            while(rs.next()){n++;names.add(rs.getString("TABLE_NAME"));}
            return Result.ok(map("success",true,"tableCount",n,"tables",names));
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
            // safe() 抛出：表名不合法或表不存在
            return Result.error(e.getMessage());
        } catch (Exception e) {
            // 其余 SQL 异常也返回错误，避免把"出错"伪装成"空表"
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
            StringBuilder sb=new StringBuilder("INSERT INTO "+t+" ("),vb=new StringBuilder(" VALUES (");
            List<Object> params=new ArrayList<>();boolean first=true;
            for(Map.Entry<String,Object> e:body.entrySet()){
                String k = e.getKey();
                if("id".equals(k)||"_rowId".equals(k))continue;
                if(!COL_PATTERN.matcher(k).matches()) continue;
                if(!first){sb.append(",");vb.append(",");}
                sb.append("`").append(k).append("`");
                vb.append("?");
                params.add(e.getValue());
                first=false;
            }
            if(params.isEmpty())return Result.error("无可插入字段");
            sb.append(")").append(vb).append(")");db.update(sb.toString(),params.toArray());
            Long newId=db.queryForObject("SELECT LAST_INSERT_ID()",Long.class);
            audit.log(String.valueOf(req.getAttribute("user")),table,"新增","id="+newId,audit.getIp(req));
            if(t.equals("trade_stock_in_main")) handleStockIn(body);
            if(t.equals("trade_stock_out_main")) handleStockOut(body);
            if(t.equals("trade_stock_in_detail")) handleStockInDetail(body);
            if(t.equals("trade_stock_out_detail")) handleStockOutDetail(body);
            if(t.equals("trade_sales_main")) finance.generateVoucherFromSale(newId);
            if(t.equals("trade_purchase_main")) finance.generateVoucherFromPurchase(newId);
            return Result.ok("新增成功");
        }catch(Exception e){return Result.error("操作失败: "+e.getMessage());}
    }

    @Transactional
    @PutMapping("/{table}/{id}")
    public Result update(@PathVariable String table, @PathVariable Long id, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        if(!canWrite(String.valueOf(req.getAttribute("role")), table)) return Result.error("权限不足");
        try{String t=safe(table);
            StringBuilder sb=new StringBuilder("UPDATE "+t+" SET ");List<Object> params=new ArrayList<>();boolean f=true;
            for(Map.Entry<String,Object> e:body.entrySet()){
                String k = e.getKey();
                if("id".equals(k)||"_rowId".equals(k))continue;
                if(!COL_PATTERN.matcher(k).matches()) continue;
                if(!f)sb.append(",");
                sb.append("`").append(k).append("`=?");
                params.add(e.getValue());
                f=false;
            }
            if(params.isEmpty())return Result.error("无更新字段");
            sb.append(" WHERE id=?");params.add(id);int n=db.update(sb.toString(),params.toArray());
            audit.log(String.valueOf(req.getAttribute("user")),table,"修改","id="+id,audit.getIp(req));
            return n>0?Result.ok("修改成功"):Result.error("记录不存在");
        }catch(Exception e){return Result.error("更新失败: "+e.getMessage());}
    }

    @Transactional
    @DeleteMapping("/{table}/{id}")
    public Result delete(@PathVariable String table, @PathVariable Long id, HttpServletRequest req) {
        if(!canWrite(String.valueOf(req.getAttribute("role")), table)) return Result.error("权限不足");
        try{String t=safe(table);int n=db.update("DELETE FROM "+t+" WHERE id=?",id);
            audit.log(String.valueOf(req.getAttribute("user")),table,"删除","id="+id,audit.getIp(req));
            return n>0?Result.ok("删除成功"):Result.error("记录不存在");
        }catch(Exception e){return Result.error("删除失败: "+e.getMessage());}
    }

    private void handleStockIn(Map<String,Object> body) {
        List<Map<String,Object>> details=db.queryForList("SELECT * FROM trade_stock_in_detail WHERE in_no=?",body.get("in_no"));
        for(Map<String,Object> d:details)inventory.stockIn(String.valueOf(d.get("product_code")),String.valueOf(d.get("product_name")),String.valueOf(d.getOrDefault("spec_model","")),String.valueOf(body.getOrDefault("warehouse","默认仓")),String.valueOf(d.getOrDefault("location","")),new java.math.BigDecimal(d.getOrDefault("qty",0).toString()),new java.math.BigDecimal(d.getOrDefault("unit_cost",0).toString()));
    }
    private void handleStockOut(Map<String,Object> body) {
        List<Map<String,Object>> details=db.queryForList("SELECT * FROM trade_stock_out_detail WHERE out_no=?",body.get("out_no"));
        for(Map<String,Object> d:details)inventory.stockOut(String.valueOf(d.get("product_code")),String.valueOf(body.getOrDefault("warehouse","默认仓")),new java.math.BigDecimal(d.getOrDefault("qty",0).toString()));
    }
    /** 明细表 INSERT 时也联动库存（主表先建、明细后补的场景） */
    private void handleStockInDetail(Map<String,Object> body) {
        try {
            Map<String,Object> main = db.queryForMap("SELECT * FROM trade_stock_in_main WHERE in_no=?", body.get("in_no"));
            inventory.stockIn(String.valueOf(body.get("product_code")), String.valueOf(body.getOrDefault("product_name","")),
                String.valueOf(body.getOrDefault("spec_model","")), String.valueOf(main.getOrDefault("warehouse","默认仓")),
                String.valueOf(body.getOrDefault("location","")),
                new java.math.BigDecimal(body.getOrDefault("qty",0).toString()),
                new java.math.BigDecimal(body.getOrDefault("unit_cost",0).toString()));
        } catch (Exception ignored) {}
    }
    private void handleStockOutDetail(Map<String,Object> body) {
        try {
            Map<String,Object> main = db.queryForMap("SELECT * FROM trade_stock_out_main WHERE out_no=?", body.get("out_no"));
            inventory.stockOut(String.valueOf(body.get("product_code")), String.valueOf(main.getOrDefault("warehouse","默认仓")),
                new java.math.BigDecimal(body.getOrDefault("qty",0).toString()));
        } catch (Exception ignored) {}
    }
}
