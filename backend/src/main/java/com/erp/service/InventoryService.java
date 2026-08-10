package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
public class InventoryService {

    @Autowired private JdbcTemplate db;

    /** 入库 — 加权平均成本计算 */
    @Transactional
    public void stockIn(String productCode, String productName, String specModel, String warehouse, String location, BigDecimal inQty, BigDecimal inPrice) {
        if (inQty.compareTo(BigDecimal.ZERO) <= 0) return;

        // 查询当前库存（行锁 FOR UPDATE 防并发竞争）
        java.util.List<java.util.Map<String,Object>> rows = db.queryForList("SELECT qty,total_value,product_name,spec_model FROM trade_inventory_balance WHERE product_code=? AND warehouse=? FOR UPDATE", productCode, warehouse);

        BigDecimal oldQty = BigDecimal.ZERO, oldValue = BigDecimal.ZERO;
        String curName = productName, curSpec = specModel;
        if (!rows.isEmpty()) {
            oldQty = new BigDecimal(rows.get(0).get("qty").toString());
            oldValue = new BigDecimal(rows.get(0).get("total_value").toString());
            if (curName == null || curName.isEmpty()) curName = String.valueOf(rows.get(0).getOrDefault("product_name", productCode));
            if (curSpec == null || curSpec.isEmpty()) curSpec = String.valueOf(rows.get(0).getOrDefault("spec_model", ""));
        }

        // 加权平均：新总额 = 旧总额 + 入库数量*单价，新均价 = 新总额 / 新总量
        BigDecimal newQty = oldQty.add(inQty);
        BigDecimal newValue = oldValue.add(inQty.multiply(inPrice));
        BigDecimal newCost = newQty.compareTo(BigDecimal.ZERO) > 0 ? newValue.divide(newQty, 4, RoundingMode.HALF_UP) : inPrice;

        if (!rows.isEmpty()) {
            db.update("UPDATE trade_inventory_balance SET qty=?, unit_cost=?, total_value=? WHERE product_code=? AND warehouse=?",
                newQty, newCost, newValue, productCode, warehouse);
        } else {
            db.update("INSERT INTO trade_inventory_balance(product_code,product_name,spec_model,warehouse,location,qty,unit_cost,total_value,min_stock,stock_status) VALUES(?,?,?,?,?,?,?,?,10,'正常')",
                productCode, curName == null ? productCode : curName, curSpec == null ? "" : curSpec, warehouse, location, newQty, newCost, newValue);
        }

        db.update("INSERT INTO trade_stock_log(log_no,product_code,product_name,warehouse,change_type,change_qty,ref_no,operator,change_date) VALUES(?,?,?,?,'入库',?,?,?,CURDATE())",
            "LOG-" + System.currentTimeMillis(), productCode, curName == null ? productCode : curName, warehouse, inQty, "IN-" + System.currentTimeMillis(), "系统");
    }

    /** 出库 — 按比例扣减 */
    @Transactional
    public void stockOut(String productCode, String warehouse, BigDecimal outQty) {
        if (outQty.compareTo(BigDecimal.ZERO) <= 0) return;

        // 行锁 FOR UPDATE 防并发超扣
        java.util.List<java.util.Map<String,Object>> rows = db.queryForList("SELECT qty,total_value,product_name FROM trade_inventory_balance WHERE product_code=? AND warehouse=? FOR UPDATE", productCode, warehouse);
        if (rows.isEmpty()) throw new RuntimeException("库存不存在: " + productCode + " @" + warehouse);

        BigDecimal curQty = new BigDecimal(rows.get(0).get("qty").toString());
        BigDecimal curValue = new BigDecimal(rows.get(0).get("total_value").toString());
        String curName = String.valueOf(rows.get(0).getOrDefault("product_name", productCode));
        if (curQty.compareTo(outQty) < 0) throw new RuntimeException("库存不足: 当前" + curQty + " 出库" + outQty);

        // 按比例扣减：新总额 = 旧总额 × (新数量/旧数量)
        BigDecimal newQty = curQty.subtract(outQty);
        BigDecimal ratio = curQty.compareTo(BigDecimal.ZERO) > 0 ? newQty.divide(curQty, 8, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal newValue = curValue.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
        BigDecimal newCost = newQty.compareTo(BigDecimal.ZERO) > 0 ? newValue.divide(newQty, 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;

        db.update("UPDATE trade_inventory_balance SET qty=?, unit_cost=?, total_value=? WHERE product_code=? AND warehouse=?",
            newQty, newCost, newValue, productCode, warehouse);

        db.update("INSERT INTO trade_stock_log(log_no,product_code,product_name,warehouse,change_type,change_qty,ref_no,operator,change_date) VALUES(?,?,?,?,'出库',?,?,?,CURDATE())",
            "LOG-" + System.currentTimeMillis(), productCode, curName, warehouse, outQty, "OUT-" + System.currentTimeMillis(), "系统");
    }
}
