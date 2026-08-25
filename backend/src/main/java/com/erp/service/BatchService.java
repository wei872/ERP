package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

/**
 * 批次追溯服务 —— 业财一体化的质量底座：
 *   采购入库 → 每行明细生成「采购批次」(PB-采购单-行号)
 *   生产入库 → 生成「生产批次」(MB-工单)，按 FIFO 回写耗用的原料批次
 *   销售出库 → 按 FIFO 耗用成品批次并记录去向（销售单/客户）
 * 由此支持：
 *   正向追溯：原料批次 → 用在了哪些工单/卖给了哪些客户
 *   反向追溯：销售单 → 成品批次 → 原料批次 → 采购单/供应商
 */
@Service
public class BatchService {

    @Autowired private JdbcTemplate db;

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return BigDecimal.ZERO; }
    }

    /** 采购入库创建批次（每行明细一个批次，记录批次入库单价供 FIFO 成本法） */
    @Transactional
    public void createPurchaseBatches(String purchaseNo) {
        List<Map<String,Object>> po = db.queryForList("SELECT supplier_code, supplier_name FROM trade_purchase_main WHERE purchase_no=?", purchaseNo);
        String sc = po.isEmpty() ? "" : String.valueOf(po.get(0).getOrDefault("supplier_code",""));
        String sn = po.isEmpty() ? "" : String.valueOf(po.get(0).getOrDefault("supplier_name",""));
        List<Map<String,Object>> details = db.queryForList("SELECT * FROM trade_purchase_detail WHERE purchase_no=? ORDER BY id", purchaseNo);
        int line = 0;
        for (Map<String,Object> d : details) {
            line++;
            String batchNo = "PB-" + purchaseNo + "-" + line;
            BigDecimal qty = toBD(d.get("qty"));
            db.update("INSERT IGNORE INTO trade_batch_trace(batch_no,product_code,product_name,batch_type,qty,remain_qty,source_no,supplier_code,supplier_name,in_date,status,unit_cost) VALUES(?,?,?,?,?,?,?,?,?,CURDATE(),'在库',?)",
                batchNo, d.get("product_code"), d.get("product_name"), "采购批次", qty, qty, purchaseNo, sc, sn, toBD(d.get("unit_price")));
        }
    }

    /** 生产入库创建生产批次：FIFO 耗用原料批次并记录成分清单（带批次成本） */
    @Transactional
    public void createProductionBatch(String workOrderNo, String productCode, String productName, BigDecimal qty, BigDecimal unitCost) {
        String batchNo = "MB-" + workOrderNo;
        List<String> consumed = new ArrayList<>();
        // 优先取领料环节已耗用的批次（领料确认时已 FIFO 耗用），避免重复扣减
        try {
            List<Map<String,Object>> consumedRows = db.queryForList(
                "SELECT DISTINCT batch_no FROM trade_batch_consume WHERE target_no=? AND target_type='生产领料'", workOrderNo);
            for (Map<String,Object> r : consumedRows) consumed.add(String.valueOf(r.get("batch_no")));
        } catch (Exception ignored) {}
        if (consumed.isEmpty()) try {
            List<Map<String,Object>> bom;
            try {
                bom = db.queryForList("SELECT * FROM prod_bom_structure WHERE parent_code=? OR (parent_code IS NULL AND product_code=?)", productCode, productCode);
            } catch (Exception legacy) {
                bom = db.queryForList("SELECT * FROM prod_bom_structure WHERE product_code=?", productCode);
            }
            for (Map<String,Object> item : bom) {
                Object cc = item.get("component_code");
                String matCode = (cc != null && !String.valueOf(cc).isEmpty()) ? String.valueOf(cc) : String.valueOf(item.getOrDefault("product_code", productCode));
                BigDecimal need = toBD(item.get("qty")).multiply(qty);
                consumeBatches(matCode, need, workOrderNo, "生产领料", consumed);
            }
        } catch (Exception e) {
            System.err.println("[batch] 生产批次成分回写失败(不阻断): " + e.getMessage());
        }
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < consumed.size(); i++) {
            if (i > 0) json.append(",");
            json.append("\"").append(consumed.get(i)).append("\"");
        }
        json.append("]");
        db.update("INSERT IGNORE INTO trade_batch_trace(batch_no,product_code,product_name,batch_type,qty,remain_qty,source_no,work_order_no,component_batches,in_date,status,unit_cost) VALUES(?,?,?,?,?,?,?,?,?,CURDATE(),'在库',?)",
            batchNo, productCode, productName, "生产批次", qty, qty, workOrderNo, workOrderNo, json.toString(), unitCost == null ? BigDecimal.ZERO : unitCost);
    }

    /** 销售出库按行耗用：FIFO 消耗批次并返回该行先进先出成本（批次无成本数据时返回 0，由调用方回退加权平均） */
    @Transactional
    /** 按行 FIFO 耗用批次（通用：销售出库/生产领料），返回先进先出成本（批次无成本数据时返回 0） */
    @Transactional
    public BigDecimal consumeLineForTarget(String productCode, BigDecimal qty, String targetNo, String targetType) {
        BigDecimal totalCost = BigDecimal.ZERO;
        boolean hasCost = false;
        if (qty == null || qty.signum() <= 0) return BigDecimal.ZERO;
        List<Map<String,Object>> batches = db.queryForList(
            "SELECT * FROM trade_batch_trace WHERE product_code=? AND remain_qty>0 ORDER BY in_date ASC, id ASC", productCode);
        BigDecimal need = qty;
        for (Map<String,Object> b : batches) {
            if (need.signum() <= 0) break;
            String bn = String.valueOf(b.get("batch_no"));
            BigDecimal remain = toBD(b.get("remain_qty"));
            BigDecimal take = remain.min(need);
            BigDecimal after = remain.subtract(take);
            BigDecimal batchCost = toBD(b.get("unit_cost"));
            if (batchCost.signum() > 0) { totalCost = totalCost.add(take.multiply(batchCost)); hasCost = true; }
            db.update("UPDATE trade_batch_trace SET remain_qty=?, status=? WHERE batch_no=?",
                after, after.signum() == 0 ? "已耗用" : "在库", bn);
            db.update("INSERT INTO trade_batch_consume(batch_no,product_code,consume_qty,target_no,target_type,consume_date) VALUES(?,?,?,?,?,CURDATE())",
                bn, productCode, take, targetNo, targetType);
            need = need.subtract(take);
        }
        return hasCost ? totalCost : BigDecimal.ZERO;
    }

    /** 销售出库按行 FIFO 耗用，返回先进先出成本（批次无成本数据时返回 0，调用方回退加权平均） */
    public BigDecimal consumeLineForSale(String productCode, BigDecimal qty, String salesNo) {
        return consumeLineForTarget(productCode, qty, salesNo, "销售出库");
    }

    public void consumeForSale(String salesNo) {
        List<Map<String,Object>> details = db.queryForList("SELECT product_code, qty FROM trade_sales_detail WHERE sales_no=?", salesNo);
        for (Map<String,Object> d : details) {
            consumeLineForSale(String.valueOf(d.get("product_code")), toBD(d.get("qty")), salesNo);
        }
    }

    /** FIFO 耗用某物料批次；不足时只追溯可得部分（库存真源校验由 InventoryService 负责） */
    private void consumeBatches(String productCode, BigDecimal need, String targetNo, String targetType, List<String> consumedLog) {
        if (need.signum() <= 0) return;
        List<Map<String,Object>> batches = db.queryForList(
            "SELECT * FROM trade_batch_trace WHERE product_code=? AND remain_qty>0 ORDER BY in_date ASC, id ASC", productCode);
        for (Map<String,Object> b : batches) {
            if (need.signum() <= 0) break;
            String bn = String.valueOf(b.get("batch_no"));
            BigDecimal remain = toBD(b.get("remain_qty"));
            BigDecimal take = remain.min(need);
            BigDecimal after = remain.subtract(take);
            db.update("UPDATE trade_batch_trace SET remain_qty=?, status=? WHERE batch_no=?",
                after, after.signum() == 0 ? "已耗用" : "在库", bn);
            db.update("INSERT INTO trade_batch_consume(batch_no,product_code,consume_qty,target_no,target_type,consume_date) VALUES(?,?,?,?,?,CURDATE())",
                bn, productCode, take, targetNo, targetType);
            if (consumedLog != null && !consumedLog.contains(bn)) consumedLog.add(bn);
            need = need.subtract(take);
        }
    }

    /** 批次基因图谱：上游来源（采购单/供应商 或 工单+原料批次） + 下游流向（耗用去向） */
    public Map<String,Object> trace(String batchNo) {
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM trade_batch_trace WHERE batch_no=?", batchNo);
        if (rows.isEmpty()) throw new RuntimeException("批次不存在: " + batchNo);
        Map<String,Object> batch = rows.get(0);
        ret.put("batch", batch);

        String type = String.valueOf(batch.getOrDefault("batch_type",""));
        if ("采购批次".equals(type)) {
            List<Map<String,Object>> po = db.queryForList("SELECT * FROM trade_purchase_main WHERE purchase_no=?", batch.get("source_no"));
            ret.put("sourcePurchase", po.isEmpty() ? null : po.get(0));
        } else if ("生产批次".equals(type)) {
            List<Map<String,Object>> wo = db.queryForList("SELECT * FROM prod_work_order WHERE work_order_no=?", batch.get("work_order_no"));
            ret.put("sourceWorkOrder", wo.isEmpty() ? null : wo.get(0));
            // 成分批次展开（含各自的上游供应商）
            List<Map<String,Object>> components = new ArrayList<>();
            String cb = batch.get("component_batches") == null ? "[]" : String.valueOf(batch.get("component_batches"));
            for (String c : cb.replace("[","").replace("]","").replace("\"","").split(",")) {
                String cn = c.trim();
                if (cn.isEmpty()) continue;
                Map<String,Object> comp = new LinkedHashMap<>();
                List<Map<String,Object>> crows = db.queryForList("SELECT * FROM trade_batch_trace WHERE batch_no=?", cn);
                if (crows.isEmpty()) continue;
                comp.put("batch", crows.get(0));
                List<Map<String,Object>> cpo = db.queryForList("SELECT purchase_no,supplier_code,supplier_name,purchase_date FROM trade_purchase_main WHERE purchase_no=?", crows.get(0).get("source_no"));
                if (!cpo.isEmpty()) comp.put("sourcePurchase", cpo.get(0));
                components.add(comp);
            }
            ret.put("components", components);
        }
        ret.put("consumptions", db.queryForList("SELECT * FROM trade_batch_consume WHERE batch_no=? ORDER BY id", batchNo));
        return ret;
    }

    /** 反向追溯：销售单 → 成品批次 → 原料批次 → 供应商 */
    public Map<String,Object> traceBySale(String salesNo) {
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> sale = db.queryForList("SELECT * FROM trade_sales_main WHERE sales_no=?", salesNo);
        if (sale.isEmpty()) throw new RuntimeException("销售单不存在: " + salesNo);
        ret.put("sale", sale.get(0));
        List<Map<String,Object>> used = db.queryForList(
            "SELECT c.*, t.batch_type, t.supplier_code, t.supplier_name, t.source_no, t.work_order_no, t.product_name batch_product_name " +
            "FROM trade_batch_consume c LEFT JOIN trade_batch_trace t ON t.batch_no=c.batch_no " +
            "WHERE c.target_no=? AND c.target_type='销售出库' ORDER BY c.id", salesNo);
        // 每个成品批次再展开其原料批次
        List<Map<String,Object>> enriched = new ArrayList<>();
        for (Map<String,Object> u : used) {
            Map<String,Object> item = new LinkedHashMap<>(u);
            if ("生产批次".equals(String.valueOf(u.getOrDefault("batch_type","")))) {
                List<Map<String,Object>> crows = db.queryForList("SELECT component_batches FROM trade_batch_trace WHERE batch_no=?", u.get("batch_no"));
                List<Map<String,Object>> materials = new ArrayList<>();
                if (!crows.isEmpty() && crows.get(0).get("component_batches") != null) {
                    String cb = String.valueOf(crows.get(0).get("component_batches"));
                    for (String c : cb.replace("[","").replace("]","").replace("\"","").split(",")) {
                        String cn = c.trim();
                        if (cn.isEmpty()) continue;
                        List<Map<String,Object>> mrows = db.queryForList(
                            "SELECT t.batch_no, t.product_code, t.product_name, t.qty, t.supplier_code, t.supplier_name, t.source_no " +
                            "FROM trade_batch_trace t WHERE t.batch_no=?", cn);
                        if (!mrows.isEmpty()) materials.add(mrows.get(0));
                    }
                }
                item.put("materials", materials);
            }
            enriched.add(item);
        }
        ret.put("batches", enriched);
        return ret;
    }
}
