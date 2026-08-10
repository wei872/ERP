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

    /** MRP净需求计算：净需求 = 总需求 - 现有库存 - 在途 + 安全库存(min_stock)。
     *  在途 = 已下单未入库的采购在单数量 */
    @Transactional
    public void calculateNetDemand(String productCode, BigDecimal demandQty) {
        // 1. BOM 展开物料清单
        List<Map<String,Object>> bom = db.queryForList(
            "SELECT * FROM prod_bom_structure WHERE product_code=?", productCode);

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
            String matCode = String.valueOf(item.get("product_code"));
            BigDecimal qtyPer = toBD(item.getOrDefault("qty","1"));
            BigDecimal totalDemand = demandQty.multiply(qtyPer);
            BigDecimal currentStock = stockMap.getOrDefault(matCode, BigDecimal.ZERO);
            BigDecimal safetyStock = safetyMap.getOrDefault(matCode, new BigDecimal("10"));
            BigDecimal inTransit = transitMap.getOrDefault(matCode, BigDecimal.ZERO);
            BigDecimal netDemand = totalDemand.subtract(currentStock).subtract(inTransit).add(safetyStock).max(BigDecimal.ZERO);

            String calcCode = "MRP-" + System.currentTimeMillis() + "-" + matCode;
            try {
                db.update("INSERT INTO prod_mrp_calc(calc_code,calc_date,plan_start_date,plan_end_date,calc_type,product_code,product_name,spec_model,demand_qty,current_stock,in_transit_qty,allocated_qty,net_demand,suggest_purchase,suggest_produce,planner,calc_status) VALUES(?,CURDATE(),CURDATE(),DATE_ADD(CURDATE(),INTERVAL 30 DAY),'MRP',?,?,?,?,?,?,0,?,?,0,'系统','已运算')",
                    calcCode, matCode, matCode, item.getOrDefault("spec_model", item.getOrDefault("spec","")),
                    totalDemand, currentStock, inTransit, netDemand, netDemand);
            } catch (Exception e) {
                System.err.println("MRP insert failed for " + matCode + ": " + e.getMessage());
            }
        }
    }

    /** BOM 成本滚算：从原材料向上累计 unit_price * qty，BOM 多级递归累加 */
    public BigDecimal rollUpCost(String productCode) {
        return rollUpCost(productCode, new HashSet<>());
    }

    private BigDecimal rollUpCost(String productCode, Set<String> visited) {
        if (!visited.add(productCode)) return BigDecimal.ZERO; // 防循环
        List<Map<String,Object>> bom = db.queryForList(
            "SELECT product_code, qty, unit_price FROM prod_bom_structure WHERE product_code=?", productCode);
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
            String matCode = String.valueOf(item.get("product_code"));
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