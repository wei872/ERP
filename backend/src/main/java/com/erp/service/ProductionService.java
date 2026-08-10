package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class ProductionService {

    @Autowired private JdbcTemplate db;
    @Autowired private InventoryService inventory;
    @Autowired private FinanceService finance;

    /** 创建生产工单 → 自动 BOM 展算 → 生成领料单 */
    @Transactional
    public Map<String,Object> createWorkOrder(String planNo, String productCode, String specModel, BigDecimal planQty, String workshop, String operator) {
        String woNo = "WO-" + System.currentTimeMillis();
        db.update("INSERT INTO prod_work_order(work_order_no,ref_plan_no,product_code,product_name,spec_model,plan_qty,actual_qty,complete_qty,scrap_qty,unit,workshop,leader,start_date,plan_end_date,order_status,priority) VALUES(?,?,?,?,?,?,0,0,0,'件',?,?,CURDATE(),DATE_ADD(CURDATE(),INTERVAL 7 DAY),'生产中','中')",
            woNo, planNo == null ? "" : planNo, productCode, productCode, specModel == null ? "" : specModel, planQty, workshop == null ? "默认车间" : workshop, operator == null ? "系统" : operator);

        // BOM 展算 → 自动创建领料单（每个 BOM 组件生成一条领料记录）
        try {
            List<Map<String,Object>> bom = db.queryForList("SELECT * FROM prod_bom_structure WHERE product_code=?", productCode);
            if (!bom.isEmpty()) {
                String reqNo = "REQ-" + System.currentTimeMillis();
                for (Map<String,Object> item : bom) {
                    String matCode = String.valueOf(item.getOrDefault("product_code", productCode));
                    String matName = String.valueOf(item.getOrDefault("product_name", productCode));
                    String matSpec = String.valueOf(item.getOrDefault("spec",""));
                    BigDecimal qtyPer = new BigDecimal(item.getOrDefault("qty","1").toString());
                    BigDecimal reqQty = qtyPer.multiply(planQty).setScale(4, RoundingMode.HALF_UP);
                    db.update("INSERT INTO prod_material_requisition(req_no,ref_work_order,product_code,product_name,spec_model,plan_req_qty,actual_req_qty,unit,warehouse,req_date,req_person,reviewer,review_date) VALUES(?,?,?,?,?,?,0,'件','默认仓',CURDATE(),?,NULL,NULL)",
                        reqNo, woNo, matCode, matName, matSpec, reqQty, operator == null ? "系统" : operator);
                }
            }
        } catch (Exception e) {
            System.err.println("BOM explosion failed for " + woNo + ": " + e.getMessage());
        }
        Map<String,Object> ret = new HashMap<>();
        ret.put("work_order_no", woNo);
        ret.put("plan_qty", planQty);
        return ret;
    }

    /** 生产入库 → 更新库存 + 更新工单完成量 + 成本结算 */
    @Transactional
    public Map<String,Object> recordWarehousing(String workOrderNo, BigDecimal actualInQty, String warehouse, String operator) {
        if (workOrderNo == null || workOrderNo.isEmpty()) throw new RuntimeException("工单号不能为空");
        Map<String,Object> wo = db.queryForMap("SELECT * FROM prod_work_order WHERE work_order_no=?", workOrderNo);
        String productCode = String.valueOf(wo.get("product_code"));
        String productName = String.valueOf(wo.get("product_name"));
        String specModel = String.valueOf(wo.getOrDefault("spec_model",""));

        String inNo = "PWI-" + System.currentTimeMillis();
        db.update("INSERT INTO prod_warehousing(in_no,ref_work_order,product_code,product_name,spec_model,plan_in_qty,actual_in_qty,unit,warehouse,in_date,handler,reviewer,review_date) VALUES(?,?,?,?,?,?,?,'件',?,CURDATE(),?,NULL,NULL)",
            inNo, workOrderNo, productCode, productName, specModel,
            new BigDecimal(wo.get("plan_qty").toString()), actualInQty,
            warehouse == null ? "默认仓" : warehouse, operator == null ? "系统" : operator);

        // 库存入库（加权平均）
        inventory.stockIn(productCode, productName, specModel, warehouse == null ? "默认仓" : warehouse, "", actualInQty,
            BigDecimal.ZERO);

        // 更新工单完成量
        db.update("UPDATE prod_work_order SET actual_qty=actual_qty+?, complete_qty=complete_qty+? WHERE work_order_no=?",
            actualInQty, actualInQty, workOrderNo);

        // 自动生产成本结算（如果完整入库）
        BigDecimal planQty = new BigDecimal(wo.get("plan_qty").toString());
        BigDecimal actualQty = db.queryForObject("SELECT COALESCE(actual_qty,0) FROM prod_work_order WHERE work_order_no=?", BigDecimal.class, workOrderNo);
        if (actualQty != null && actualQty.compareTo(planQty) >= 0) {
            db.update("UPDATE prod_work_order SET order_status='已完成' WHERE work_order_no=?", workOrderNo);
            settleWorkOrder(workOrderNo, actualQty, productCode, productName, specModel, operator);
        }

        Map<String,Object> ret = new HashMap<>();
        ret.put("warehousing_no", inNo);
        ret.put("actual_in_qty", actualInQty);
        return ret;
    }

    /** 生产成本结算：汇总领料成本 + 工序成本，写入结算记录、更新物料单位成本并生成产成品入库凭证(1405/5001) */
    @Transactional
    public Map<String,Object> settleWorkOrder(String workOrderNo, BigDecimal produceQty, String productCode, String productName, String specModel, String operator) {
        // 汇总领料成本
        BigDecimal materialCost = db.queryForObject(
            "SELECT COALESCE(SUM(d.plan_req_qty * COALESCE(g.unit_cost,0)),0) FROM prod_material_requisition d LEFT JOIN trade_goods_main g ON g.product_code=d.product_code WHERE d.ref_work_order=?",
            BigDecimal.class, workOrderNo);
        if (materialCost == null) materialCost = BigDecimal.ZERO;
        // 工序成本（来自 prod_process_mgmt 的 unit_price * 标准工时）
        BigDecimal laborCost = db.queryForObject(
            "SELECT COALESCE(SUM(p.unit_price * p.standard_hours),0) FROM prod_process_mgmt p WHERE p.process_code IN (SELECT DISTINCT b.product_code FROM prod_bom_structure b WHERE b.product_code=?)",
            BigDecimal.class, productCode);
        if (laborCost == null) laborCost = BigDecimal.ZERO;
        BigDecimal totalCost = materialCost.add(laborCost).setScale(2, RoundingMode.HALF_UP);
        BigDecimal unitCost = produceQty.signum() > 0 ? totalCost.divide(produceQty, 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;

        String settleNo = "SETTLE-" + System.currentTimeMillis();
        db.update("INSERT INTO prod_cost_settle(settle_no,work_order_no,product_code,product_name,spec_model,produce_qty,material_cost,labor_cost,total_cost,unit_cost,settle_date,handler,reviewer) VALUES(?,?,?,?,?,?,?,?,?,?,CURDATE(),?,NULL)",
            settleNo, workOrderNo, productCode, productName, specModel, produceQty,
            materialCost, laborCost, totalCost, unitCost, operator == null ? "系统" : operator);

        // 同步更新商品表单位成本
        db.update("UPDATE trade_goods_main SET unit_cost=? WHERE product_code=?", unitCost, productCode);

        // 自动联动生成产成品完工入库会计凭证 (借: 1405 库存商品, 贷: 5001 生产成本)
        if (totalCost.signum() > 0) {
            String vn = "VZ-PROD-" + System.currentTimeMillis();
            String period = new SimpleDateFormat("yyyy-MM").format(new Date());
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
                vn, period, totalCost, totalCost, "生产完工入库成本结转:" + workOrderNo);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'1405','库存商品',?,0,?)",
                vn, totalCost, "完工入库成本-" + productCode);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'5001','生产成本',0,?,?)",
                vn, totalCost, "结转生产成本-" + workOrderNo);
            finance.updateBalance("1405", "库存商品", totalCost, BigDecimal.ZERO);
            finance.updateBalance("5001", "生产成本", BigDecimal.ZERO, totalCost);
        }

        Map<String,Object> ret = new HashMap<>();
        ret.put("settle_no", settleNo);
        ret.put("material_cost", materialCost);
        ret.put("labor_cost", laborCost);
        ret.put("unit_cost", unitCost);
        ret.put("total_cost", totalCost);
        return ret;
    }

    /** 报废记录 */
    @Transactional
    public void recordScrap(String workOrderNo, BigDecimal scrapQty, String reason, String operator) {
        String scrapNo = "SCP-" + System.currentTimeMillis();
        db.update("INSERT INTO prod_scrap_main(scrap_no,work_order_no,scrap_qty,scrap_reason,handler,scrap_date,status) VALUES(?,?,?,?,?,CURDATE(),'已确认')",
            scrapNo, workOrderNo, scrapQty, reason == null ? "" : reason, operator == null ? "系统" : operator);
        db.update("UPDATE prod_work_order SET scrap_qty=scrap_qty+? WHERE work_order_no=?", scrapQty, workOrderNo);
    }

    /** 领料确认：从指定领料单扣减库存，并自动联动直接材料成本凭证(5001/1403) */
    @Transactional
    public void confirmRequisition(String reqNo, BigDecimal actualQty, String warehouse, String operator) {
        Map<String,Object> req = db.queryForMap("SELECT * FROM prod_material_requisition WHERE req_no=?", reqNo);
        String productCode = String.valueOf(req.get("product_code"));
        inventory.stockOut(productCode, warehouse, actualQty);
        db.update("UPDATE prod_material_requisition SET actual_req_qty=actual_req_qty+? WHERE req_no=?", actualQty, reqNo);

        // 获取该物料的当前成本，自动联动生产领料凭证 (借: 5001 生产成本, 贷: 1403 原材料)
        BigDecimal unitCost = BigDecimal.ZERO;
        List<Map<String,Object>> bal = db.queryForList("SELECT unit_cost FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", productCode, warehouse);
        if (!bal.isEmpty() && bal.get(0).get("unit_cost") != null) {
            unitCost = new BigDecimal(bal.get(0).get("unit_cost").toString());
        }
        BigDecimal matCost = actualQty.multiply(unitCost).setScale(2, RoundingMode.HALF_UP);
        if (matCost.signum() > 0) {
            String vn = "VZ-REQ-" + System.currentTimeMillis();
            String period = new SimpleDateFormat("yyyy-MM").format(new Date());
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
                vn, period, matCost, matCost, "生产领料成本结转:" + reqNo);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'5001','生产成本',?,0,?)",
                vn, matCost, "生产直接领料-" + productCode);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1403','原材料',0,?,?)",
                vn, matCost, "生产直接领料-" + reqNo);
            finance.updateBalance("5001", "生产成本", matCost, BigDecimal.ZERO);
            finance.updateBalance("1403", "原材料", BigDecimal.ZERO, matCost);
        }
    }
}