package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class InventoryService {

    @Autowired private JdbcTemplate db;
    @Autowired private FinanceService finance;

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

    /** 采购单 -> 一键生成入库单 + 自动增加库存 + 同步采购单与物料到货状态 */
    @Transactional
    public Map<String,Object> stockInFromPurchase(Long purchaseId, String operator) {
        Map<String,Object> po = db.queryForMap("SELECT * FROM trade_purchase_main WHERE id=?", purchaseId);
        String purchaseNo = String.valueOf(po.get("purchase_no"));
        String status = String.valueOf(po.getOrDefault("purchase_status", ""));
        if ("已入库".equals(status)) throw new RuntimeException("该采购单已入库: " + purchaseNo);

        String warehouse = String.valueOf(po.getOrDefault("warehouse", "默认仓"));
        List<Map<String,Object>> details = db.queryForList("SELECT * FROM trade_purchase_detail WHERE purchase_no=?", purchaseNo);

        String inNo = "IN-PO-" + System.currentTimeMillis();
        BigDecimal totalAmt = new BigDecimal(po.getOrDefault("total_amount", "0").toString());
        db.update("INSERT INTO trade_stock_in_main(in_no,ref_purchase_no,supplier_code,supplier_name,warehouse,in_date,total_amount,status,handler) VALUES(?,?,?,?,?,CURDATE(),?,'已入库',?)",
            inNo, purchaseNo, po.getOrDefault("supplier_code",""), po.getOrDefault("supplier_name",""), warehouse, totalAmt, operator == null ? "系统" : operator);

        if (!details.isEmpty()) {
            for (Map<String,Object> d : details) {
                String pCode = String.valueOf(d.get("product_code"));
                String pName = String.valueOf(d.getOrDefault("product_name", pCode));
                String spec = String.valueOf(d.getOrDefault("spec_model", ""));
                BigDecimal qty = new BigDecimal(d.getOrDefault("qty", "1").toString());
                BigDecimal price = new BigDecimal(d.getOrDefault("unit_price", "0").toString());
                db.update("INSERT INTO trade_stock_in_detail(in_no,product_code,product_name,spec_model,qty,unit_cost,total_amount) VALUES(?,?,?,?,?,?,?)",
                    inNo, pCode, pName, spec, qty, price, qty.multiply(price));
                stockIn(pCode, pName, spec, warehouse, "", qty, price);
                db.update("UPDATE trade_goods_main SET unit_cost=?, purchase_price=? WHERE product_code=?", price, price, pCode);
            }
        } else {
            // 无明细时作为整单操作
            stockIn(purchaseNo, "采购到货-" + purchaseNo, "", warehouse, "", BigDecimal.ONE, totalAmt);
        }

        db.update("UPDATE trade_purchase_main SET purchase_status='已入库', arrival_status='全部到货' WHERE id=?", purchaseId);

        Map<String,Object> res = new HashMap<>();
        res.put("in_no", inNo);
        res.put("purchase_no", purchaseNo);
        res.put("status", "已入库");
        return res;
    }

    /** 销售单 -> 一键生成出库单 + 自动扣减库存 + 自动结转销售成本凭证(6401/1405) + 同步发货状态 */
    @Transactional
    public Map<String,Object> stockOutFromSale(Long saleId, String operator) {
        Map<String,Object> sale = db.queryForMap("SELECT * FROM trade_sales_main WHERE id=?", saleId);
        String salesNo = String.valueOf(sale.get("sales_no"));
        String shipStatus = String.valueOf(sale.getOrDefault("shipping_status", ""));
        if ("已出库".equals(shipStatus) || "已发货".equals(shipStatus)) throw new RuntimeException("该销售单已完成出库发货: " + salesNo);

        String warehouse = String.valueOf(sale.getOrDefault("warehouse", "默认仓"));
        List<Map<String,Object>> details = db.queryForList("SELECT * FROM trade_sales_detail WHERE sales_no=?", salesNo);

        String outNo = "OUT-SO-" + System.currentTimeMillis();
        BigDecimal totalSalesAmt = new BigDecimal(sale.getOrDefault("total_amount", "0").toString());
        db.update("INSERT INTO trade_stock_out_main(out_no,ref_sales_no,customer_code,customer_name,warehouse,out_date,total_amount,status,handler) VALUES(?,?,?,?,?,CURDATE(),?,'已出库',?)",
            outNo, salesNo, sale.getOrDefault("customer_code",""), sale.getOrDefault("customer_name",""), warehouse, totalSalesAmt, operator == null ? "系统" : operator);

        BigDecimal cogsTotal = BigDecimal.ZERO;
        if (!details.isEmpty()) {
            for (Map<String,Object> d : details) {
                String pCode = String.valueOf(d.get("product_code"));
                String pName = String.valueOf(d.getOrDefault("product_name", pCode));
                String spec = String.valueOf(d.getOrDefault("spec_model", ""));
                BigDecimal qty = new BigDecimal(d.getOrDefault("qty", "1").toString());
                stockOut(pCode, warehouse, qty);
                // 获取商品当前库存成本单价
                BigDecimal unitCost = BigDecimal.ZERO;
                List<Map<String,Object>> balRows = db.queryForList("SELECT unit_cost FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", pCode, warehouse);
                if (!balRows.isEmpty() && balRows.get(0).get("unit_cost") != null) {
                    unitCost = new BigDecimal(balRows.get(0).get("unit_cost").toString());
                }
                BigDecimal lineCost = qty.multiply(unitCost).setScale(2, RoundingMode.HALF_UP);
                cogsTotal = cogsTotal.add(lineCost);
                db.update("INSERT INTO trade_stock_out_detail(out_no,product_code,product_name,spec_model,qty,unit_cost,total_amount) VALUES(?,?,?,?,?,?,?)",
                    outNo, pCode, pName, spec, qty, unitCost, lineCost);
            }
        }

        db.update("UPDATE trade_sales_main SET shipping_status='已出库', sales_status='已完成' WHERE id=?", saleId);

        // 自动结转销售成本会计凭证 (借: 6401 主营业务成本, 贷: 1405 库存商品)
        String cogsVoucherNo = "";
        if (cogsTotal.signum() > 0) {
            cogsVoucherNo = "VZ-COGS-" + System.currentTimeMillis();
            String period = new SimpleDateFormat("yyyy-MM").format(new Date());
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
                cogsVoucherNo, period, cogsTotal, cogsTotal, "销售出库自动结转成本:" + salesNo);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'6401','主营业务成本',?,0,?)",
                cogsVoucherNo, cogsTotal, "结转销售成本-" + salesNo);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1405','库存商品',0,?,?)",
                cogsVoucherNo, cogsTotal, "结转销售成本-" + salesNo);
            finance.updateBalance("6401", "主营业务成本", cogsTotal, BigDecimal.ZERO);
            finance.updateBalance("1405", "库存商品", BigDecimal.ZERO, cogsTotal);
        }

        Map<String,Object> res = new HashMap<>();
        res.put("out_no", outNo);
        res.put("sales_no", salesNo);
        res.put("cogs_amount", cogsTotal);
        res.put("cogs_voucher_no", cogsVoucherNo);
        res.put("status", "已出库");
        return res;
    }
}
