package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class MrpService {

    @Autowired private JdbcTemplate db;
    @Autowired private ProductionService production;

    /** BOM 展开：优先按 parent_code 匹配（v3 模型），兼容旧数据按 product_code 匹配 */
    private List<Map<String,Object>> bomOf(String productCode) {
        try {
            return db.queryForList(
                "SELECT * FROM prod_bom_structure WHERE parent_code=? OR (parent_code IS NULL AND product_code=?)",
                productCode, productCode);
        } catch (Exception e) {
            // 尚未执行 upgrade3.sql 时无 parent_code 列，退回旧查询
            return db.queryForList("SELECT * FROM prod_bom_structure WHERE product_code=?", productCode);
        }
    }

    /** 取 BOM 行的子件编码：优先 component_code，兼容旧行退回 product_code */
    private String componentCodeOf(Map<String,Object> item, String fallback) {
        Object cc = item.get("component_code");
        if (cc != null && !String.valueOf(cc).isEmpty()) return String.valueOf(cc);
        Object pc = item.get("product_code");
        return pc == null ? fallback : String.valueOf(pc);
    }

    /** MRP净需求计算：净需求 = 总需求 - 现有库存 - 在途 + 安全库存(min_stock)。
     *  在途 = 已下单未入库的采购在单数量 */
    @Transactional
    public void calculateNetDemand(String productCode, BigDecimal demandQty) {
        // 1. BOM 展开物料清单
        List<Map<String,Object>> bom = bomOf(productCode);

        // 2. 现有库存 + 安全库存(min_stock)：按 product_code 聚合 max(min_stock) 作为安全库存来源
        Map<String,BigDecimal> stockMap = new HashMap<>();
        Map<String,BigDecimal> safetyMap = new HashMap<>();
        List<Map<String,Object>> invRows = db.queryForList(
            "SELECT product_code, MAX(qty) qty, MAX(min_stock) min_stock FROM trade_inventory_balance GROUP BY product_code");
        for (Map<String,Object> r : invRows) {
            stockMap.put(String.valueOf(r.get("product_code")), toBD(r.get("qty")));
            safetyMap.put(String.valueOf(r.get("product_code")), toBD(r.get("min_stock")));
        }

        // 3. 在途 = 采购在单未入库（purchase_status 不属于 已入库/已收货/已取消 的）
        Map<String,BigDecimal> transitMap = new HashMap<>();
        try {
            List<Map<String,Object>> transitRows = db.queryForList(
                "SELECT d.product_code, COALESCE(SUM(d.qty - COALESCE(d.recv_qty,0)),0) transit " +
                "FROM trade_purchase_detail d " +
                "JOIN trade_purchase_main m ON m.purchase_no = d.purchase_no " +
                "WHERE m.purchase_status NOT IN ('已入库','已收货','已取消','已完结') " +
                "GROUP BY d.product_code");
            for (Map<String,Object> r : transitRows) transitMap.put(String.valueOf(r.get("product_code")), toBD(r.get("transit")));
        } catch (Exception e) {
            // 库无 recv_qty 等列则尝试直接 SUM(qty)
            try {
                List<Map<String,Object>> fallback = db.queryForList(
                    "SELECT d.product_code, COALESCE(SUM(d.qty),0) transit " +
                    "FROM trade_purchase_detail d " +
                    "JOIN trade_purchase_main m ON m.purchase_no = d.purchase_no " +
                    "WHERE m.purchase_status NOT IN ('已入库','已收货','已取消','已完结') " +
                    "GROUP BY d.product_code");
                for (Map<String,Object> r : fallback) transitMap.put(String.valueOf(r.get("product_code")), toBD(r.get("transit")));
            } catch (Exception ignored) {}
        }

        for (Map<String,Object> item : bom) {
            String matCode = componentCodeOf(item, productCode);
            BigDecimal qtyPer = toBD(item.getOrDefault("qty","1"));
            BigDecimal totalDemand = demandQty.multiply(qtyPer);
            BigDecimal currentStock = stockMap.getOrDefault(matCode, BigDecimal.ZERO);
            BigDecimal safetyStock = safetyMap.getOrDefault(matCode, new BigDecimal("10"));
            BigDecimal inTransit = transitMap.getOrDefault(matCode, BigDecimal.ZERO);
            BigDecimal netDemand = totalDemand.subtract(currentStock).subtract(inTransit).add(safetyStock).max(BigDecimal.ZERO);

            String calcCode = "MRP-" + System.currentTimeMillis() + "-" + matCode;
            // 物料名称取商品主数据，兜底用编码
            String matName = matCode;
            try {
                List<Map<String,Object>> g = db.queryForList("SELECT product_name FROM trade_goods_main WHERE product_code=?", matCode);
                if (!g.isEmpty() && g.get(0).get("product_name") != null && !String.valueOf(g.get(0).get("product_name")).isEmpty()) matName = String.valueOf(g.get(0).get("product_name"));
            } catch (Exception ignored) {}
            try {
                db.update("INSERT INTO prod_mrp_calc(calc_code,calc_date,plan_start_date,plan_end_date,calc_type,product_code,product_name,spec_model,demand_qty,current_stock,in_transit_qty,allocated_qty,net_demand,suggest_purchase,suggest_produce,planner,calc_status) VALUES(?,CURDATE(),CURDATE(),DATE_ADD(CURDATE(),INTERVAL 30 DAY),'MRP',?,?,?,?,?,?,0,?,?,0,'系统','已运算')",
                    calcCode, matCode, matName, item.getOrDefault("spec_model", item.getOrDefault("spec","")),
                    totalDemand, currentStock, inTransit, netDemand, netDemand);
            } catch (Exception e) {
                System.err.println("MRP insert failed for " + matCode + ": " + e.getMessage());
            }
        }
    }

    /** 从 MRP 计算结果一键拉起采购订单 */
    @Transactional
    public Map<String,Object> generatePurchaseFromMrp(String calcCode, String operator) {
        Map<String,Object> mrp = db.queryForMap("SELECT * FROM prod_mrp_calc WHERE calc_code=?", calcCode);
        BigDecimal suggestPur = toBD(mrp.get("suggest_purchase"));
        if (suggestPur.compareTo(BigDecimal.ZERO) <= 0) suggestPur = toBD(mrp.get("net_demand"));
        if (suggestPur.compareTo(BigDecimal.ZERO) <= 0) throw new RuntimeException("建议采购数量须大于0");

        String pCode = String.valueOf(mrp.get("product_code"));
        String pName = String.valueOf(mrp.getOrDefault("product_name", pCode));
        String spec = String.valueOf(mrp.getOrDefault("spec_model", ""));

        BigDecimal price = BigDecimal.ZERO;
        String supplierCode = "SUPP-001", supplierName = "默认供应商";
        try {
            Map<String,Object> g = db.queryForMap("SELECT unit_cost, purchase_price FROM trade_goods_main WHERE product_code=?", pCode);
            price = toBD(g.get("purchase_price") != null ? g.get("purchase_price") : g.get("unit_cost"));
        } catch (Exception ignored) {}
        // 优先复用该物料最近一次采购的供应商
        try {
            Map<String,Object> sup = db.queryForMap(
                "SELECT m.supplier_code, m.supplier_name FROM trade_purchase_detail d " +
                "JOIN trade_purchase_main m ON m.purchase_no=d.purchase_no " +
                "WHERE d.product_code=? ORDER BY d.id DESC LIMIT 1", pCode);
            if (sup.get("supplier_code") != null && !String.valueOf(sup.get("supplier_code")).isEmpty()) {
                supplierCode = String.valueOf(sup.get("supplier_code"));
                supplierName = String.valueOf(sup.getOrDefault("supplier_name", supplierName));
            }
        } catch (Exception ignored) {}

        String poNo = "PO-MRP-" + System.currentTimeMillis();
        BigDecimal totalAmt = suggestPur.multiply(price).setScale(2, RoundingMode.HALF_UP);
        db.update("INSERT INTO trade_purchase_main(purchase_no,supplier_code,supplier_name,purchase_date,total_amount,buyer,purchase_status,warehouse) VALUES(?,?,?,CURDATE(),?,?,'已审核','默认仓')",
            poNo, supplierCode, supplierName, totalAmt, operator == null ? "系统" : operator);
        db.update("INSERT INTO trade_purchase_detail(purchase_no,line_no,product_code,product_name,spec_model,qty,unit_price,amount) VALUES(?,1,?,?,?,?,?,?)",
            poNo, pCode, pName, spec, suggestPur, price, totalAmt);

        db.update("UPDATE prod_mrp_calc SET calc_status='已转采购' WHERE calc_code=?", calcCode);

        Map<String,Object> res = new HashMap<>();
        res.put("purchase_no", poNo);
        res.put("product_code", pCode);
        res.put("qty", suggestPur);
        res.put("status", "已转采购单");
        return res;
    }

    /** 从 MRP 计算结果一键拉起生产工单 */
    @Transactional
    public Map<String,Object> generateWorkOrderFromMrp(String calcCode, String operator) {
        Map<String,Object> mrp = db.queryForMap("SELECT * FROM prod_mrp_calc WHERE calc_code=?", calcCode);
        BigDecimal suggestProd = toBD(mrp.get("suggest_produce"));
        if (suggestProd.compareTo(BigDecimal.ZERO) <= 0) suggestProd = toBD(mrp.get("net_demand"));
        if (suggestProd.compareTo(BigDecimal.ZERO) <= 0) throw new RuntimeException("建议生产数量须大于0");

        String pCode = String.valueOf(mrp.get("product_code"));
        String spec = String.valueOf(mrp.getOrDefault("spec_model", ""));

        Map<String,Object> woRes = production.createWorkOrder("PLAN-MRP-" + System.currentTimeMillis(), pCode, spec, suggestProd, "默认车间", operator);
        db.update("UPDATE prod_mrp_calc SET calc_status='已转生产' WHERE calc_code=?", calcCode);

        Map<String,Object> res = new HashMap<>();
        res.put("work_order_no", woRes.get("work_order_no"));
        res.put("product_code", pCode);
        res.put("qty", suggestProd);
        res.put("status", "已转生产工单");
        return res;
    }

    /** BOM 成本滚算：从原材料向上累计 unit_price * qty，BOM 多级递归累加 */
    public BigDecimal rollUpCost(String productCode) {
        return rollUpCost(productCode, new HashSet<>());
    }

    private BigDecimal rollUpCost(String productCode, Set<String> visited) {
        if (!visited.add(productCode)) return BigDecimal.ZERO; // 防循环
        List<Map<String,Object>> bom = bomOf(productCode);
        if (bom.isEmpty()) {
            // 自身无 BOM：尝试从 trade_goods_main 取成本
            try {
                BigDecimal self = db.queryForObject(
                    "SELECT COALESCE(unit_cost,0) FROM trade_goods_main WHERE product_code=? LIMIT 1",
                    BigDecimal.class, productCode);
                return self == null ? BigDecimal.ZERO : self;
            } catch (Exception e) { return BigDecimal.ZERO; }
        }
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String,Object> item : bom) {
            String matCode = componentCodeOf(item, productCode);
            BigDecimal qty = toBD(item.get("qty"));
            BigDecimal unitPrice = toBD(item.get("unit_price"));
            // 子件成本优先用其自身 rollUp；若是叶件用 unit_price
            BigDecimal childCost = rollUpCost(matCode, new HashSet<>(visited));
            BigDecimal effUnit = unitPrice.signum() > 0 ? unitPrice : childCost;
            total = total.add(qty.multiply(effUnit));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(4, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
}