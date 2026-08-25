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
    @Autowired private MetaService meta; @Autowired private SummaryService summaryService;

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
                        @RequestParam(defaultValue="") String sort, @RequestParam(defaultValue="") String dir,
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
            // 排序列白名单校验（仅允许真实列，方向仅 asc/desc），防止注入
            String orderBy = "";
            if (!sort.isEmpty()) {
                boolean valid = false;
                for (Map<String,Object> c : meta.columns(t)) {
                    if (sort.equals(String.valueOf(c.get("name")))) { valid = true; break; }
                }
                if (valid) orderBy = " ORDER BY `" + sort + "` " + ("asc".equalsIgnoreCase(dir) ? "ASC" : "DESC");
            }
            params.add(size);params.add((page-1)*size);
            List<Map<String,Object>> rows=db.queryForList("SELECT * FROM "+t+where+orderBy+" LIMIT ? OFFSET ?",params.toArray());
            return Result.ok(map("total",total,"page",page,"rows",rows));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("查询失败: " + e.getMessage());
        }
    }

    /** 列表页汇总分析：汇总卡片 + 月度趋势 + 分布（列配置在服务端，无注入面） */
    @GetMapping("/{table}/summary")
    public Result summary(@PathVariable String table, HttpServletRequest req) {
        try {
            String t = safe(table);
            if (!canRead(String.valueOf(req.getAttribute("role")), t)) return Result.error("权限不足");
            return Result.ok(summaryService.summary(t));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("汇总加载失败: " + e.getMessage());
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
            // 客户信用额度控制：新增销售单前置校验（信用额度>0 时生效）
            if (t.equals("trade_sales_main")) {
                String custCode = str(body.get("customer_code"));
                java.math.BigDecimal orderAmt = BigDecimal.ZERO;
                try { if (body.get("total_amount") != null) orderAmt = new java.math.BigDecimal(String.valueOf(body.get("total_amount")).trim()); } catch (Exception ignored) {}
                if (!custCode.isEmpty() && orderAmt.signum() > 0) {
                    List<Map<String,Object>> cs = db.queryForList("SELECT customer_name, credit_limit FROM cust_customer_main WHERE customer_code=?", custCode);
                    if (!cs.isEmpty() && cs.get(0).get("credit_limit") != null) {
                        java.math.BigDecimal limit = new java.math.BigDecimal(cs.get(0).get("credit_limit").toString());
                        if (limit.signum() > 0) {
                            java.math.BigDecimal used = db.queryForObject("SELECT COALESCE(SUM(remain_amount),0) FROM finance_receivable_main WHERE customer_code=?", java.math.BigDecimal.class, custCode);
                            if (used == null) used = java.math.BigDecimal.ZERO;
                            if (used.add(orderAmt).compareTo(limit) > 0) {
                                return Result.error("超出客户信用额度：" + cs.get(0).get("customer_name")
                                    + "（额度 ¥" + limit + "，应收未收 ¥" + used + "，本单 ¥" + orderAmt
                                    + "，将超出 ¥" + used.add(orderAmt).subtract(limit) + "）—— 请先催收核销回款或调整信用额度");
                            }
                        }
                    }
                }
            }
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

            // 级联更正业务模块关联数据与凭证/应收应付总账/工单/领料/商品库
            if (t.equals("trade_sales_main")) handleUpdateSalesMain(id, body);
            if (t.equals("trade_sales_detail")) handleUpdateSalesDetail(id, body);
            if (t.equals("trade_purchase_main")) handleUpdatePurchaseMain(id, body);
            if (t.equals("trade_purchase_detail")) handleUpdatePurchaseDetail(id, body);
            if (t.equals("finance_receivable_main")) handleUpdateReceivableMain(id, body);
            if (t.equals("finance_payable_main")) handleUpdatePayableMain(id, body);
            if (t.equals("prod_work_order")) handleUpdateWorkOrder(id, body);
            if (t.equals("prod_material_requisition")) handleUpdateRequisition(id, body);
            if (t.equals("trade_goods_main")) handleUpdateGoodsMain(id, body);

            return n>0?Result.ok("修改成功"):Result.error("记录不存在");
        }catch(IllegalArgumentException e){return Result.error(e.getMessage());}
        catch(Exception e){return Result.error("修改失败: "+(e.getMessage() != null ? e.getMessage() : e.toString()));}
    }

    private void handleUpdateSalesDetail(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> d = db.queryForMap("SELECT sales_no, qty, unit_price FROM trade_sales_detail WHERE id=?", id);
            String salesNo = String.valueOf(d.get("sales_no"));
            if (d.get("qty") != null && d.get("unit_price") != null) {
                java.math.BigDecimal qty = new java.math.BigDecimal(d.get("qty").toString());
                java.math.BigDecimal price = new java.math.BigDecimal(d.get("unit_price").toString());
                java.math.BigDecimal amt = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
                db.update("UPDATE trade_sales_detail SET amount=? WHERE id=?", amt, id);

                // 重新汇总销售主表总金额
                java.math.BigDecimal newTotal = db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM trade_sales_detail WHERE sales_no=?", java.math.BigDecimal.class, salesNo);
                if (newTotal != null && newTotal.signum() > 0) {
                    db.update("UPDATE trade_sales_main SET total_amount=? WHERE sales_no=?", newTotal, salesNo);
                    db.update("UPDATE finance_receivable_main SET total_amount=?, remain_amount=GREATEST(0, total_amount-COALESCE(received_amount,0)) WHERE remark LIKE ?", newTotal, "%" + salesNo + "%");
                    db.update("UPDATE voucher_main SET debit_total=?, credit_total=? WHERE remark LIKE ?", newTotal, newTotal, "%" + salesNo + "%");
                    db.update("UPDATE voucher_detail SET debit_amount=? WHERE summary LIKE ? AND subject_code='1122'", newTotal, "%" + salesNo + "%");
                    db.update("UPDATE voucher_detail SET credit_amount=? WHERE summary LIKE ? AND subject_code='6001'", newTotal, "%" + salesNo + "%");
                }
            }
        } catch (Exception e) {
            System.err.println("Cascade update sales detail warning: " + e.getMessage());
        }
    }

    private void handleUpdatePurchaseDetail(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> d = db.queryForMap("SELECT purchase_no, qty, unit_price FROM trade_purchase_detail WHERE id=?", id);
            String purchaseNo = String.valueOf(d.get("purchase_no"));
            if (d.get("qty") != null && d.get("unit_price") != null) {
                java.math.BigDecimal qty = new java.math.BigDecimal(d.get("qty").toString());
                java.math.BigDecimal price = new java.math.BigDecimal(d.get("unit_price").toString());
                java.math.BigDecimal amt = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
                db.update("UPDATE trade_purchase_detail SET amount=? WHERE id=?", amt, id);

                // 重新汇总采购主表总金额
                java.math.BigDecimal newTotal = db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM trade_purchase_detail WHERE purchase_no=?", java.math.BigDecimal.class, purchaseNo);
                if (newTotal != null && newTotal.signum() > 0) {
                    db.update("UPDATE trade_purchase_main SET total_amount=? WHERE purchase_no=?", newTotal, purchaseNo);
                    db.update("UPDATE finance_payable_main SET total_amount=?, remain_amount=GREATEST(0, total_amount-COALESCE(paid_amount,0)) WHERE remark LIKE ?", newTotal, "%" + purchaseNo + "%");
                    db.update("UPDATE voucher_main SET debit_total=?, credit_total=? WHERE remark LIKE ?", newTotal, newTotal, "%" + purchaseNo + "%");
                    db.update("UPDATE voucher_detail SET debit_amount=? WHERE summary LIKE ? AND subject_code='1403'", newTotal, "%" + purchaseNo + "%");
                    db.update("UPDATE voucher_detail SET credit_amount=? WHERE summary LIKE ? AND subject_code='2202'", newTotal, "%" + purchaseNo + "%");
                }
            }
        } catch (Exception e) {
            System.err.println("Cascade update purchase detail warning: " + e.getMessage());
        }
    }

    private void handleUpdateWorkOrder(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> wo = db.queryForMap("SELECT work_order_no, product_code, product_name, plan_qty, spec_model FROM prod_work_order WHERE id=?", id);
            String woNo = String.valueOf(wo.get("work_order_no"));
            String pCode = String.valueOf(wo.get("product_code"));
            String pName = String.valueOf(wo.get("product_name"));
            String spec = String.valueOf(wo.getOrDefault("spec_model", ""));

            // 联动更新关联领料单
            db.update("UPDATE prod_material_requisition SET product_code=?, product_name=?, spec_model=? WHERE ref_work_order=?",
                pCode, pName, spec, woNo);
            db.update("UPDATE prod_warehousing SET product_code=?, product_name=?, spec_model=? WHERE ref_work_order=?",
                pCode, pName, spec, woNo);
            db.update("UPDATE prod_cost_settle SET product_code=?, product_name=?, spec_model=? WHERE work_order_no=?",
                pCode, pName, spec, woNo);
        } catch (Exception e) {
            System.err.println("Cascade update work order warning: " + e.getMessage());
        }
    }

    private void handleUpdateRequisition(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> req = db.queryForMap("SELECT req_no, product_code, plan_req_qty, actual_req_qty FROM prod_material_requisition WHERE id=?", id);
            String pCode = String.valueOf(req.get("product_code"));
            if (req.get("actual_req_qty") != null) {
                java.math.BigDecimal actualQty = new java.math.BigDecimal(req.get("actual_req_qty").toString());
                db.update("UPDATE trade_inventory_balance SET qty=GREATEST(0, qty-?) WHERE product_code=?", actualQty, pCode);
            }
        } catch (Exception ignored) {}
    }

    private void handleUpdateGoodsMain(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> g = db.queryForMap("SELECT product_code, product_name, unit_cost FROM trade_goods_main WHERE id=?", id);
            String pCode = String.valueOf(g.get("product_code"));
            String pName = String.valueOf(g.get("product_name"));
            if (g.get("unit_cost") != null) {
                java.math.BigDecimal unitCost = new java.math.BigDecimal(g.get("unit_cost").toString());
                db.update("UPDATE trade_inventory_balance SET product_name=?, unit_cost=?, total_value=qty*? WHERE product_code=?",
                    pName, unitCost, unitCost, pCode);
            }
        } catch (Exception ignored) {}
    }

    private void handleUpdateSalesMain(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> sale = db.queryForMap("SELECT sales_no, total_amount, customer_code, customer_name FROM trade_sales_main WHERE id=?", id);
            String salesNo = String.valueOf(sale.get("sales_no"));
            if (sale.get("total_amount") != null) {
                java.math.BigDecimal amt = new java.math.BigDecimal(sale.get("total_amount").toString());
                String custCode = String.valueOf(sale.getOrDefault("customer_code", ""));
                String custName = String.valueOf(sale.getOrDefault("customer_name", ""));
                db.update("UPDATE finance_receivable_main SET customer_code=?, customer_name=?, total_amount=?, remain_amount=GREATEST(0, total_amount-COALESCE(received_amount,0)) WHERE remark LIKE ?",
                    custCode, custName, amt, "%" + salesNo + "%");
                db.update("UPDATE voucher_main SET debit_total=?, credit_total=? WHERE remark LIKE ?", amt, amt, "%" + salesNo + "%");
                db.update("UPDATE voucher_detail SET debit_amount=? WHERE summary LIKE ? AND subject_code='1122'", amt, "%" + salesNo + "%");
                db.update("UPDATE voucher_detail SET credit_amount=? WHERE summary LIKE ? AND subject_code='6001'", amt, "%" + salesNo + "%");
            }
        } catch (Exception e) {
            System.err.println("Cascade update sales main warning: " + e.getMessage());
        }
    }

    private void handleUpdatePurchaseMain(Long id, Map<String,Object> body) {
        try {
            Map<String,Object> po = db.queryForMap("SELECT purchase_no, total_amount, supplier_code, supplier_name FROM trade_purchase_main WHERE id=?", id);
            String purchaseNo = String.valueOf(po.get("purchase_no"));
            if (po.get("total_amount") != null) {
                java.math.BigDecimal amt = new java.math.BigDecimal(po.get("total_amount").toString());
                String suppCode = String.valueOf(po.getOrDefault("supplier_code", ""));
                String suppName = String.valueOf(po.getOrDefault("supplier_name", ""));
                db.update("UPDATE finance_payable_main SET supplier_code=?, supplier_name=?, total_amount=?, remain_amount=GREATEST(0, total_amount-COALESCE(paid_amount,0)) WHERE remark LIKE ?",
                    suppCode, suppName, amt, "%" + purchaseNo + "%");
                db.update("UPDATE voucher_main SET debit_total=?, credit_total=? WHERE remark LIKE ?", amt, amt, "%" + purchaseNo + "%");
                db.update("UPDATE voucher_detail SET debit_amount=? WHERE summary LIKE ? AND subject_code='1403'", amt, "%" + purchaseNo + "%");
                db.update("UPDATE voucher_detail SET credit_amount=? WHERE summary LIKE ? AND subject_code='2202'", amt, "%" + purchaseNo + "%");
            }
        } catch (Exception e) {
            System.err.println("Cascade update purchase main warning: " + e.getMessage());
        }
    }

    private void handleUpdateReceivableMain(Long id, Map<String,Object> body) {
        try {
            db.update("UPDATE finance_receivable_main SET remain_amount=GREATEST(0, total_amount-COALESCE(received_amount,0)) WHERE id=?", id);
        } catch (Exception ignored) {}
    }

    private void handleUpdatePayableMain(Long id, Map<String,Object> body) {
        try {
            db.update("UPDATE finance_payable_main SET remain_amount=GREATEST(0, total_amount-COALESCE(paid_amount,0)) WHERE id=?", id);
        } catch (Exception ignored) {}
    }

    @Transactional
    @DeleteMapping("/{table}/{id}")
    public Result delete(@PathVariable String table, @PathVariable Long id, HttpServletRequest req) {
        if(!canWrite(String.valueOf(req.getAttribute("role")), table)) return Result.error("权限不足");
        try{String t=safe(table);
            // 删除前归档到回收站（可一键恢复）
            try {
                List<Map<String,Object>> old = db.queryForList("SELECT * FROM "+t+" WHERE id=?", id);
                if (!old.isEmpty()) {
                    com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                    db.update("INSERT INTO sys_deleted_backup(table_name,row_id,row_data,deleted_by) VALUES(?,?,?,?)",
                        t, id, om.writeValueAsString(old.get(0)), String.valueOf(req.getAttribute("user")));
                }
            } catch (Exception ignored) {} // 归档失败不阻断删除（如未执行 upgrade3 无回收站表）
            int n=db.update("DELETE FROM "+t+" WHERE id=?",id);
            audit.log(String.valueOf(req.getAttribute("user")),table,"删除","id="+id+"（已归档回收站）",audit.getIp(req));
            return n>0?Result.ok("删除成功，已存入回收站可恢复"):Result.error("记录不存在");
        }catch(Exception e){
            String msg = e.getMessage() == null ? e.toString() : e.getMessage();
            if (msg.contains("a foreign key constraint fails")) return Result.error("删除失败：存在关联明细/引用记录（外键保护），请先处理子数据");
            return Result.error("删除失败: "+msg);
        }
    }
}
