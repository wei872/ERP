package com.erp.controller;

import com.erp.model.Result;
import com.erp.service.*;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/biz")
public class BizController {

    @Autowired private WorkflowService workflow;
    @Autowired private ClosingService closing;
    @Autowired private MrpService mrp;
    @Autowired private ExportService exportService;
    @Autowired private AuditService audit;
    @Autowired private BatchService batchService;
    @Autowired private FinanceTemplateService fin;
    @Autowired private ReconciliationService reconciliation;
    @Autowired private FinanceService finance;
    @Autowired private InventoryService inventory;
    @Autowired private ReportService report;
    @Autowired private ProductionService production;
    @Autowired private JdbcTemplate db;

    // ── 数据驾驶舱 / 报表中心 ──
    @GetMapping("/dashboard") public Result dashboard() {
        try { return Result.ok(report.dashboard()); }
        catch (Exception e) { return Result.error("仪表盘加载失败: " + e.getMessage()); }
    }
    @GetMapping("/report") public Result report() {
        try { return Result.ok(report.report()); }
        catch (Exception e) { return Result.error("报表加载失败: " + e.getMessage()); }
    }
    @GetMapping("/report/balance-sheet") public Result balanceSheet(@RequestParam String period, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(report.balanceSheet(period)); }
        catch (Exception e) { return Result.error("资产负债表加载失败: " + e.getMessage()); }
    }
    @GetMapping("/report/income-statement") public Result incomeStatement(@RequestParam String period, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(report.incomeStatement(period)); }
        catch (Exception e) { return Result.error("利润表加载失败: " + e.getMessage()); }
    }
    @GetMapping("/report/cash-flow") public Result cashFlow(@RequestParam String period, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(report.cashFlow(period)); }
        catch (Exception e) { return Result.error("现金流量表加载失败: " + e.getMessage()); }
    }

    // ── 工作流 ──
    @PostMapping("/approve/{approvalNo}") public Result approve(@PathVariable String approvalNo, @RequestBody Map<String,String> body, HttpServletRequest req) {
        workflow.approve(approvalNo, String.valueOf(req.getAttribute("user")), body.getOrDefault("comment",""));
        return Result.ok("审批通过");
    }
    @PostMapping("/reject/{approvalNo}") public Result reject(@PathVariable String approvalNo, @RequestBody Map<String,String> body, HttpServletRequest req) {
        workflow.reject(approvalNo, String.valueOf(req.getAttribute("user")), body.getOrDefault("comment",""));
        return Result.ok("已驳回");
    }
    @PostMapping("/submit-approval") public Result submit(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        String type = val(body.get("type"));
        if (type.isEmpty()) return Result.error("审批类型不能为空");
        try {
            workflow.submit(type, String.valueOf(req.getAttribute("user")), String.valueOf(body.getOrDefault("dept","")), String.valueOf(body.getOrDefault("refNo","")), new java.math.BigDecimal(body.getOrDefault("amount","0").toString()), String.valueOf(body.getOrDefault("remark","")));
        } catch (Exception e) { return Result.error(e.getMessage()); }
        audit.log(String.valueOf(req.getAttribute("user")), "协同", "提交审批", String.valueOf(body.get("type")), audit.getIp(req));
        return Result.ok("已提交审批");
    }

    // ── 部门预算占用查询（费用审批表单提示用） ──
    @GetMapping("/budget-usage") public Result budgetUsage(@RequestParam String department) {
        try {
            String month = db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m')", String.class);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("month", month);
            ret.put("department", department);
            List<Map<String,Object>> b = db.queryForList("SELECT budget_amount FROM oa_budget WHERE department=? AND budget_month=?", department, month);
            if (b.isEmpty() || b.get(0).get("budget_amount") == null) {
                ret.put("hasBudget", false);
                return Result.ok(ret);
            }
            BigDecimal budget = new java.math.BigDecimal(b.get(0).get("budget_amount").toString());
            BigDecimal used = db.queryForObject(
                "SELECT COALESCE(SUM(amount),0) FROM oa_approval_main WHERE approval_type='费用审批' AND department=? AND approval_status IN ('待审批','已通过') AND DATE_FORMAT(submit_date,'%Y-%m')=?",
                BigDecimal.class, department, month);
            if (used == null) used = BigDecimal.ZERO;
            ret.put("hasBudget", true);
            ret.put("budget", budget);
            ret.put("used", used);
            ret.put("available", budget.subtract(used));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("预算查询失败: " + e.getMessage()); }
    }

    // ── 工作流：任务列表 / 详情 ──
    @GetMapping("/my-tasks") public Result myTasks(HttpServletRequest req) {
        return Result.ok(workflow.myTasks(String.valueOf(req.getAttribute("user")), String.valueOf(req.getAttribute("role"))));
    }
    @GetMapping("/approval/{approvalNo}") public Result approvalDetail(@PathVariable String approvalNo) {
        return Result.ok(workflow.approvalDetail(approvalNo));
    }

    // ── 月末/年结 ──
    @PostMapping("/month-close") public Result monthClose(@RequestBody Map<String,String> body, HttpServletRequest req) {
        closing.monthEndClose(body.get("period"));
        audit.log(String.valueOf(req.getAttribute("user")), "财务", "月结", "期间："+body.get("period"), audit.getIp(req));
        return Result.ok("月结完成");
    }
    @PostMapping("/year-close") public Result yearClose(@RequestBody Map<String,String> body, HttpServletRequest req) {
        closing.yearEndClose(body.get("year"));
        return Result.ok("年结完成");
    }

    // ── MRP ──
    @PostMapping("/mrp-calc") public Result mrpCalc(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        String pc = val(body.get("product_code"));
        if (pc.isEmpty()) return Result.error("产品编码不能为空");
        mrp.calculateNetDemand(pc, new java.math.BigDecimal(body.getOrDefault("qty","1").toString()));
        audit.log(String.valueOf(req.getAttribute("user")), "生产", "MRP运算", String.valueOf(body.get("product_code")) + " qty=" + body.getOrDefault("qty","1"), audit.getIp(req));
        return Result.ok("MRP运算完成");
    }

    @GetMapping("/mrp-rollup-cost") public Result mrpRollup(@RequestParam String product_code) {
        try { return Result.ok(java.util.Collections.singletonMap("cost", mrp.rollUpCost(product_code))); }
        catch (Exception e) { return Result.error("BOM成本滚算失败: " + e.getMessage()); }
    }

    @PostMapping("/mrp-to-purchase") public Result mrpToPurchase(@RequestBody Map<String,String> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"procurement".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            String calcCode = body.get("calc_code");
            if (calcCode == null || calcCode.isEmpty()) return Result.error("计算单号不能为空");
            Map<String,Object> r = mrp.generatePurchaseFromMrp(calcCode, user(req));
            audit.log(user(req), "MRP", "MRP转采购单", calcCode, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("MRP转采购失败: " + e.getMessage()); }
    }

    @PostMapping("/mrp-to-work-order") public Result mrpToWorkOrder(@RequestBody Map<String,String> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            String calcCode = body.get("calc_code");
            if (calcCode == null || calcCode.isEmpty()) return Result.error("计算单号不能为空");
            Map<String,Object> r = mrp.generateWorkOrderFromMrp(calcCode, user(req));
            audit.log(user(req), "MRP", "MRP转生产工单", calcCode, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("MRP转工单失败: " + e.getMessage()); }
    }

    // ── 生产管理 ──
    @PostMapping("/production/work-order") public Result createWorkOrder(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = production.createWorkOrder(
                String.valueOf(body.getOrDefault("plan_no","")),
                String.valueOf(body.get("product_code")),
                String.valueOf(body.getOrDefault("spec_model","")),
                new java.math.BigDecimal(body.getOrDefault("plan_qty","1").toString()),
                String.valueOf(body.getOrDefault("workshop","默认车间")),
                user(req));
            audit.log(user(req), "生产", "创建工单", String.valueOf(r.get("work_order_no")), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("创建工单失败: " + e.getMessage()); }
    }
    @PostMapping("/production/warehousing") public Result productionWarehousing(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = production.recordWarehousing(
                String.valueOf(body.get("work_order_no")),
                new java.math.BigDecimal(body.getOrDefault("actual_qty","0").toString()),
                String.valueOf(body.getOrDefault("warehouse","默认仓")),
                user(req));
            audit.log(user(req), "生产", "生产入库", String.valueOf(r.get("warehousing_no")), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("生产入库失败: " + e.getMessage()); }
    }
    @PostMapping("/production/scrap") public Result productionScrap(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> res = production.recordScrap(
                String.valueOf(body.get("work_order_no")),
                new java.math.BigDecimal(body.getOrDefault("scrap_qty","0").toString()),
                String.valueOf(body.getOrDefault("reason","")),
                user(req));
            audit.log(user(req), "生产", "报废记录", String.valueOf(body.get("work_order_no")), audit.getIp(req));
            return Result.ok(res);
        } catch (Exception e) { return Result.error("报废失败: " + e.getMessage()); }
    }
    @PostMapping("/production/requisition-confirm") public Result confirmRequisition(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            production.confirmRequisition(
                String.valueOf(body.get("req_no")),
                new java.math.BigDecimal(body.getOrDefault("actual_qty","0").toString()),
                String.valueOf(body.getOrDefault("warehouse","默认仓")),
                user(req));
            audit.log(user(req), "生产", "领料确认", String.valueOf(body.get("req_no")), audit.getIp(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error("领料确认失败: " + e.getMessage()); }
    }
    @GetMapping("/production/settle/{workOrderNo}") public Result settle(@PathVariable String workOrderNo, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> wo = db.queryForMap("SELECT * FROM prod_work_order WHERE work_order_no=?", workOrderNo);
            Map<String,Object> r = production.settleWorkOrder(workOrderNo,
                new java.math.BigDecimal(wo.get("actual_qty").toString()),
                String.valueOf(wo.get("product_code")), String.valueOf(wo.get("product_name")),
                String.valueOf(wo.getOrDefault("spec_model","")), user(req));
            audit.log(user(req), "生产", "成本结算", workOrderNo, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("结算失败: " + e.getMessage()); }
    }

    // ── 库存直接出入库（不走主从表，便于库存盘点快速调账）──
    @PostMapping("/stock-in") public Result stockIn(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            if (val(body.get("product_code")).isEmpty()) return Result.error("商品编码不能为空");
            inventory.stockIn(
                String.valueOf(body.get("product_code")),
                String.valueOf(body.getOrDefault("product_name","")),
                String.valueOf(body.getOrDefault("spec_model","")),
                String.valueOf(body.getOrDefault("warehouse","默认仓")),
                String.valueOf(body.getOrDefault("location","")),
                new java.math.BigDecimal(body.getOrDefault("qty","0").toString()),
                new java.math.BigDecimal(body.getOrDefault("unit_cost","0").toString()));
            audit.log(user(req), "库存", "入库", String.valueOf(body.get("product_code")) + " qty=" + body.get("qty"), audit.getIp(req));
            return Result.ok("入库成功");
        } catch (Exception e) { return Result.error("入库失败: " + e.getMessage()); }
    }

    @PostMapping("/stock-out") public Result stockOut(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            if (val(body.get("product_code")).isEmpty()) return Result.error("商品编码不能为空");
            inventory.stockOut(
                String.valueOf(body.get("product_code")),
                String.valueOf(body.getOrDefault("warehouse","默认仓")),
                new java.math.BigDecimal(body.getOrDefault("qty","0").toString()));
            audit.log(user(req), "库存", "出库", String.valueOf(body.get("product_code")) + " qty=" + body.get("qty"), audit.getIp(req));
            return Result.ok("出库成功");
        } catch (Exception e) { return Result.error("出库失败: " + e.getMessage()); }
    }

    // ── 采购单 / 销售单 智能单据联动 ──
    @PostMapping("/stock-in-from-purchase/{id}") public Result stockInFromPurchase(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"procurement".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = inventory.stockInFromPurchase(id, user(req));
            audit.log(user(req), "采购", "采购一键入库", "purchaseId="+id, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("采购入库联动失败: " + e.getMessage()); }
    }

    @PostMapping("/stock-out-from-sale/{id}") public Result stockOutFromSale(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = inventory.stockOutFromSale(id, user(req));
            audit.log(user(req), "销售", "销售一键出库", "saleId="+id, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("销售出库联动失败: " + e.getMessage()); }
    }

    // ── 三大财务报表 Excel(.xlsx) 导出（POI，财务归档级） ──
    @GetMapping("/report/excel")
    @SuppressWarnings("unchecked")
    public ResponseEntity<byte[]> reportExcel(@RequestParam String type, @RequestParam String period, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return ResponseEntity.status(403).build();
        String name = "balance".equals(type) ? "资产负债表" : "income".equals(type) ? "利润表" : "现金流量表";
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            CellStyle headStyle = wb.createCellStyle();
            Font hf = wb.createFont(); hf.setBold(true);
            headStyle.setFont(hf);
            headStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            Sheet sh = wb.createSheet(name);
            int r = 0;
            xlCells(sh, r++, name + "　—　会计期间：" + period + "　—　ERP 企业管理系统");
            r++;
            if ("balance".equals(type)) {
                Map<String,Object> d = report.balanceSheet(period);
                xlHead(sh, r++, headStyle, "科目编码", "科目名称", "期末余额");
                for (Map<String,Object> it : (List<Map<String,Object>>) d.getOrDefault("assetItems", Collections.emptyList()))
                    xlCells(sh, r++, it.get("code"), it.get("name"), it.get("balance"));
                for (Map<String,Object> it : (List<Map<String,Object>>) d.getOrDefault("liabilityItems", Collections.emptyList()))
                    xlCells(sh, r++, it.get("code"), it.get("name"), it.get("balance"));
                r++;
                xlCells(sh, r++, "资产合计", "", d.get("assets"));
                xlCells(sh, r++, "负债合计", "", d.get("liabilities"));
                xlCells(sh, r++, "所有者权益合计", "", d.get("equity"));
                xlCells(sh, r++, "负债和所有者权益总计", "", d.get("total_liability_equity"));
            } else if ("income".equals(type)) {
                Map<String,Object> d = report.incomeStatement(period);
                xlCells(sh, r++, "营业收入", d.get("revenue"), "营业成本", d.get("cost"));
                xlCells(sh, r++, "毛利润", d.get("gross_profit"), "净利润", d.get("net_profit"));
                r++;
                xlHead(sh, r++, headStyle, "科目编码", "科目名称", "借方发生", "贷方发生", "期末余额");
                for (Map<String,Object> it : (List<Map<String,Object>>) d.getOrDefault("items", Collections.emptyList()))
                    xlCells(sh, r++, it.get("subject_code"), it.get("subject_name"), it.get("debit_amount"), it.get("credit_amount"), it.get("end_balance"));
            } else {
                Map<String,Object> d = report.cashFlow(period);
                xlCells(sh, r++, "现金流入", d.get("cash_in"), "现金流出", d.get("cash_out"), "净现金流", d.get("net_cash"));
                r++;
                xlHead(sh, r++, headStyle, "流入项目", "金额");
                for (Map<String,Object> it : (List<Map<String,Object>>) d.getOrDefault("inflow_items", Collections.emptyList()))
                    xlCells(sh, r++, it.get("name"), it.get("value"));
                r++;
                xlHead(sh, r++, headStyle, "流出项目", "金额");
                for (Map<String,Object> it : (List<Map<String,Object>>) d.getOrDefault("outflow_items", Collections.emptyList()))
                    xlCells(sh, r++, it.get("name"), it.get("value"));
            }
            int[] widths = {16, 30, 18, 18, 18, 18};
            for (int i = 0; i < widths.length; i++) sh.setColumnWidth(i, widths[i] * 256);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            String filename = URLEncoder.encode(name + "_" + period + ".xlsx", "UTF-8").replace("+", "%20");
            audit.log(user(req), "财务", "导出报表Excel", type + "/" + period, audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + filename)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(bos.toByteArray());
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }

    private void xlHead(Sheet sh, int r, CellStyle st, String... cols) {
        Row row = sh.createRow(r);
        for (int i = 0; i < cols.length; i++) {
            org.apache.poi.ss.usermodel.Cell c = row.createCell(i);
            c.setCellValue(cols[i]);
            c.setCellStyle(st);
        }
    }

    private void xlCells(Sheet sh, int r, Object... vals) {
        Row row = sh.createRow(r);
        for (int i = 0; i < vals.length; i++) {
            org.apache.poi.ss.usermodel.Cell c = row.createCell(i);
            Object v = vals[i];
            if (v instanceof Number) c.setCellValue(((Number) v).doubleValue());
            else c.setCellValue(v == null ? "" : String.valueOf(v));
        }
    }

    // ── 待办中心：顶栏铃铛的数据源（审批待办/库存预警/逾期应收应付/待审用户） ──
    @GetMapping("/todos") public Result todos(HttpServletRequest req) {
        try {
            String user = String.valueOf(req.getAttribute("user"));
            String role = String.valueOf(req.getAttribute("role"));
            boolean isAdmin = "admin".equals(req.getAttribute("role"));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("pendingApprovals", isAdmin
                ? db.queryForObject("SELECT COUNT(*) FROM oa_flow_task WHERE task_status='待处理'", Long.class)
                : db.queryForObject("SELECT COUNT(*) FROM oa_flow_task WHERE task_status='待处理' AND (assignee=? OR assignee=?)", Long.class, user, role));
            Map<String,Object> low = new LinkedHashMap<>();
            low.put("count", db.queryForObject("SELECT COUNT(*) FROM trade_inventory_balance WHERE stock_status='预警'", Long.class));
            low.put("items", db.queryForList("SELECT product_code, product_name, qty, min_stock FROM trade_inventory_balance WHERE stock_status='预警' ORDER BY (qty / NULLIF(min_stock,0)) ASC LIMIT 6"));
            ret.put("lowStock", low);
            Map<String,Object> ovR = new LinkedHashMap<>();
            ovR.put("count", db.queryForObject("SELECT COUNT(*) FROM finance_receivable_main WHERE remain_amount>0 AND due_date<CURDATE()", Long.class));
            ovR.put("amount", db.queryForObject("SELECT COALESCE(SUM(remain_amount),0) FROM finance_receivable_main WHERE remain_amount>0 AND due_date<CURDATE()", java.math.BigDecimal.class));
            ret.put("overdueReceivable", ovR);
            Map<String,Object> ovP = new LinkedHashMap<>();
            ovP.put("count", db.queryForObject("SELECT COUNT(*) FROM finance_payable_main WHERE remain_amount>0 AND due_date<CURDATE()", Long.class));
            ovP.put("amount", db.queryForObject("SELECT COALESCE(SUM(remain_amount),0) FROM finance_payable_main WHERE remain_amount>0 AND due_date<CURDATE()", java.math.BigDecimal.class));
            ret.put("overduePayable", ovP);
            if (isAdmin) ret.put("pendingUsers", db.queryForObject("SELECT COUNT(*) FROM sys_user WHERE status='pending'", Long.class));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("待办加载失败: " + e.getMessage()); }
    }

    // ── 经营动态：最近业务事件聚合（仪表盘实时脉搏） ──
    @GetMapping("/activity-feed") public Result activityFeed() {
        try {
            List<Map<String,Object>> items = new ArrayList<>();
            for (Map<String,Object> r : db.queryForList("SELECT sales_no no, customer_name who, total_amount amount, sales_date dt, sales_status st FROM trade_sales_main ORDER BY id DESC LIMIT 4"))
                items.add(feedItem("sale", "销售单 " + r.get("no"), str2(r.get("who")), r.get("amount"), r.get("dt"), str2(r.get("st"))));
            for (Map<String,Object> r : db.queryForList("SELECT purchase_no no, supplier_name who, total_amount amount, purchase_date dt, purchase_status st FROM trade_purchase_main ORDER BY id DESC LIMIT 4"))
                items.add(feedItem("purchase", "采购单 " + r.get("no"), str2(r.get("who")), r.get("amount"), r.get("dt"), str2(r.get("st"))));
            for (Map<String,Object> r : db.queryForList("SELECT voucher_no no, remark who, debit_total amount, voucher_date dt, voucher_status st FROM voucher_main ORDER BY id DESC LIMIT 4"))
                items.add(feedItem("voucher", "凭证 " + r.get("no"), str2(r.get("who")), r.get("amount"), r.get("dt"), str2(r.get("st"))));
            for (Map<String,Object> r : db.queryForList("SELECT approval_no no, CONCAT(approval_type, ' · ', applicant) who, amount, submit_date dt, approval_status st FROM oa_approval_main ORDER BY id DESC LIMIT 3"))
                items.add(feedItem("approval", "审批 " + r.get("no"), str2(r.get("who")), r.get("amount"), r.get("dt"), str2(r.get("st"))));
            for (Map<String,Object> r : db.queryForList("SELECT product_name who, change_type, change_qty amount, ref_no no, change_date dt FROM trade_stock_log ORDER BY id DESC LIMIT 3"))
                items.add(feedItem("stock", str2(r.get("change_type")) + " " + str2(r.get("no")), str2(r.get("who")), r.get("amount"), r.get("dt"), str2(r.get("change_type"))));
            // 按日期倒序（null 最后）
            items.sort((a, b) -> {
                Object da = a.get("date"), dbb = b.get("date");
                if (da == null && dbb == null) return 0;
                if (da == null) return 1;
                if (dbb == null) return -1;
                return String.valueOf(dbb).compareTo(String.valueOf(da));
            });
            return Result.ok(items.subList(0, Math.min(10, items.size())));
        } catch (Exception e) { return Result.error("经营动态加载失败: " + e.getMessage()); }
    }

    private String str2(Object o) { return o == null ? "" : String.valueOf(o); }

    private Map<String,Object> feedItem(String kind, String title, String sub, Object amount, Object date, String status) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("kind", kind); m.put("title", title); m.put("sub", sub);
        m.put("amount", amount); m.put("date", date); m.put("status", status);
        return m;
    }

    // ── 凭证审核流：待审核 → 已审核 → 已记账 ──
    @PostMapping("/voucher-audit/{no}") public Result voucherAudit(@PathVariable String no, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT voucher_status FROM voucher_main WHERE voucher_no=?", no);
            if (rows.isEmpty()) return Result.error("凭证不存在: " + no);
            String st = String.valueOf(rows.get(0).get("voucher_status"));
            if (!"待审核".equals(st)) return Result.error("仅「待审核」凭证可审核，当前状态：" + st);
            db.update("UPDATE voucher_main SET voucher_status='已审核', reviewer=? WHERE voucher_no=?", user(req), no);
            audit.log(user(req), "财务", "凭证审核", no, audit.getIp(req));
            return Result.ok("已审核");
        } catch (Exception e) { return Result.error("审核失败: " + e.getMessage()); }
    }
    @PostMapping("/voucher-post/{no}") public Result voucherPost(@PathVariable String no, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT voucher_status FROM voucher_main WHERE voucher_no=?", no);
            if (rows.isEmpty()) return Result.error("凭证不存在: " + no);
            String st = String.valueOf(rows.get(0).get("voucher_status"));
            if (!"已审核".equals(st)) return Result.error("仅「已审核」凭证可记账，当前状态：" + st);
            db.update("UPDATE voucher_main SET voucher_status='已记账' WHERE voucher_no=?", no);
            audit.log(user(req), "财务", "凭证记账", no, audit.getIp(req));
            return Result.ok("已记账");
        } catch (Exception e) { return Result.error("记账失败: " + e.getMessage()); }
    }

    // ── Excel 批量导入（商品 / 客户） ──
    @PostMapping("/import/{type}")
    public Result importExcel(@PathVariable String type, @RequestParam("file") MultipartFile file, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        if (file == null || file.isEmpty()) return Result.error("请上传文件");
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) return Result.error("仅支持 .xlsx / .xls 文件");
        try (org.apache.poi.ss.usermodel.Workbook wb = org.apache.poi.ss.usermodel.WorkbookFactory.create(file.getInputStream())) {
            org.apache.poi.ss.usermodel.Sheet sh = wb.getSheetAt(0);
            if (sh == null || sh.getLastRowNum() < 1) return Result.error("工作表为空（第 1 行须为表头，第 2 行起为数据）");
            // 表头 → 列号映射（按中文表头，兼容顺序变化）
            Map<String, Integer> head = new LinkedHashMap<>();
            org.apache.poi.ss.usermodel.Row hr = sh.getRow(0);
            if (hr != null) for (int c = 0; c < hr.getLastCellNum(); c++) {
                String v = cellStr(hr.getCell(c)).trim();
                if (!v.isEmpty()) head.put(v, c);
            }
            org.apache.poi.ss.usermodel.DataFormatter fmt = new org.apache.poi.ss.usermodel.DataFormatter();
            int imported = 0, skipped = 0;
            List<String> errors = new ArrayList<>();
            for (int r = 1; r <= sh.getLastRowNum(); r++) {
                org.apache.poi.ss.usermodel.Row row = sh.getRow(r);
                if (row == null) continue;
                try {
                    if ("goods".equals(type)) {
                        String code = cellAt(row, head, "商品编码", fmt).trim();
                        if (code.isEmpty()) { skipped++; continue; }
                        db.update("INSERT INTO trade_goods_main(product_code,product_name,category,spec_model,unit,purchase_price,sale_price,status) VALUES(?,?,?,?,?,?,?,'启用') " +
                            "ON DUPLICATE KEY UPDATE product_name=VALUES(product_name), category=VALUES(category), spec_model=VALUES(spec_model), unit=VALUES(unit), purchase_price=VALUES(purchase_price), sale_price=VALUES(sale_price)",
                            code, cellAt(row, head, "商品名称", fmt), cellAt(row, head, "分类", fmt), cellAt(row, head, "规格型号", fmt),
                            cellAt(row, head, "单位", fmt), cellNum(row, head, "采购价", fmt), cellNum(row, head, "销售价", fmt));
                        imported++;
                    } else if ("customers".equals(type)) {
                        String code = cellAt(row, head, "客户编码", fmt).trim();
                        if (code.isEmpty()) { skipped++; continue; }
                        db.update("INSERT INTO cust_customer_main(customer_code,customer_name,customer_type,industry,region,contact_person,contact_phone,level,status) VALUES(?,?,?,?,?,?,?,'普通客户','启用') " +
                            "ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), customer_type=VALUES(customer_type), industry=VALUES(industry), region=VALUES(region), contact_person=VALUES(contact_person), contact_phone=VALUES(contact_phone)",
                            code, cellAt(row, head, "客户名称", fmt), cellAt(row, head, "客户类型", fmt), cellAt(row, head, "行业", fmt),
                            cellAt(row, head, "区域", fmt), cellAt(row, head, "联系人", fmt), cellAt(row, head, "联系电话", fmt));
                        imported++;
                    } else {
                        return Result.error("不支持的导入类型: " + type);
                    }
                } catch (Exception e) {
                    if (errors.size() < 5) errors.add("第 " + (r + 1) + " 行: " + e.getMessage());
                }
            }
            audit.log(user(req), "数据", "批量导入", type + " 成功" + imported + "/跳过" + skipped, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("imported", imported);
            ret.put("skipped", skipped);
            ret.put("errors", errors);
            return Result.ok(ret);
        } catch (Exception e) {
            return Result.error("导入失败: " + e.getMessage());
        }
    }

    private String cellStr(org.apache.poi.ss.usermodel.Cell c) {
        if (c == null) return "";
        switch (c.getCellType()) {
            case STRING: return c.getStringCellValue();
            case NUMERIC: return java.math.BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros().toPlainString();
            case BOOLEAN: return String.valueOf(c.getBooleanCellValue());
            default: return "";
        }
    }
    private String cellAt(org.apache.poi.ss.usermodel.Row row, Map<String, Integer> head, String colName, org.apache.poi.ss.usermodel.DataFormatter fmt) {
        Integer idx = head.get(colName);
        if (idx == null) return "";
        org.apache.poi.ss.usermodel.Cell c = row.getCell(idx);
        return c == null ? "" : fmt.formatCellValue(c).trim();
    }
    private java.math.BigDecimal cellNum(org.apache.poi.ss.usermodel.Row row, Map<String, Integer> head, String colName, org.apache.poi.ss.usermodel.DataFormatter fmt) {
        String v = cellAt(row, head, colName, fmt).replace(",", "");
        if (v.isEmpty()) return java.math.BigDecimal.ZERO;
        try { return new java.math.BigDecimal(v); } catch (Exception e) { return java.math.BigDecimal.ZERO; }
    }

    // ── 经营日报：今日业务全景聚合 ──
    @GetMapping("/daily-report") public Result dailyReport() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            Map<String,Object> today = new LinkedHashMap<>();
            today.put("salesCount", db.queryForObject("SELECT COUNT(*) FROM trade_sales_main WHERE DATE(sales_date)=CURDATE()", Long.class));
            today.put("salesAmount", db.queryForObject("SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main WHERE DATE(sales_date)=CURDATE()", java.math.BigDecimal.class));
            today.put("purchaseCount", db.queryForObject("SELECT COUNT(*) FROM trade_purchase_main WHERE DATE(purchase_date)=CURDATE()", Long.class));
            today.put("purchaseAmount", db.queryForObject("SELECT COALESCE(SUM(total_amount),0) FROM trade_purchase_main WHERE DATE(purchase_date)=CURDATE()", java.math.BigDecimal.class));
            today.put("stockIn", db.queryForObject("SELECT COUNT(*) FROM trade_stock_in_main WHERE DATE(in_date)=CURDATE()", Long.class));
            today.put("stockOut", db.queryForObject("SELECT COUNT(*) FROM trade_stock_out_main WHERE DATE(out_date)=CURDATE()", Long.class));
            today.put("vouchers", db.queryForObject("SELECT COUNT(*) FROM voucher_main WHERE DATE(voucher_date)=CURDATE()", Long.class));
            today.put("approvals", db.queryForObject("SELECT COUNT(*) FROM oa_approval_main WHERE DATE(submit_date)=CURDATE()", Long.class));
            today.put("logins", db.queryForObject("SELECT COUNT(*) FROM sys_login_log WHERE DATE(login_time)=CURDATE() AND login_status='成功'", Long.class));
            today.put("loginFails", db.queryForObject("SELECT COUNT(*) FROM sys_login_log WHERE DATE(login_time)=CURDATE() AND login_status LIKE '失败%'", Long.class));
            ret.put("today", today);
            Map<String,Object> month = new LinkedHashMap<>();
            month.put("salesAmount", db.queryForObject("SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main WHERE DATE_FORMAT(sales_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')", java.math.BigDecimal.class));
            month.put("purchaseAmount", db.queryForObject("SELECT COALESCE(SUM(total_amount),0) FROM trade_purchase_main WHERE DATE_FORMAT(purchase_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')", java.math.BigDecimal.class));
            month.put("vouchers", db.queryForObject("SELECT COUNT(*) FROM voucher_main WHERE DATE_FORMAT(voucher_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')", Long.class));
            ret.put("month", month);
            Map<String,Object> alerts = new LinkedHashMap<>();
            alerts.put("lowStock", db.queryForObject("SELECT COUNT(*) FROM trade_inventory_balance WHERE stock_status='预警'", Long.class));
            alerts.put("overdueReceivable", db.queryForObject("SELECT COALESCE(SUM(remain_amount),0) FROM finance_receivable_main WHERE remain_amount>0 AND due_date<CURDATE()", java.math.BigDecimal.class));
            alerts.put("overduePayable", db.queryForObject("SELECT COALESCE(SUM(remain_amount),0) FROM finance_payable_main WHERE remain_amount>0 AND due_date<CURDATE()", java.math.BigDecimal.class));
            alerts.put("pendingApprovals", db.queryForObject("SELECT COUNT(*) FROM oa_flow_task WHERE task_status='待处理'", Long.class));
            try {
                alerts.put("expiringContracts", db.queryForObject("SELECT COUNT(*) FROM cust_contract_main WHERE status='执行中' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)", Long.class));
                alerts.put("expiredContracts", db.queryForObject("SELECT COUNT(*) FROM cust_contract_main WHERE status='执行中' AND end_date<CURDATE()", Long.class));
                ret.put("expiringContractList", db.queryForList("SELECT contract_no, contract_name, party_name, amount, end_date FROM cust_contract_main WHERE status='执行中' AND end_date<=DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY end_date LIMIT 5"));
            } catch (Exception ignored) {} // 未执行 upgrade3 时无合同表
            try {
                alerts.put("highCreditUsage", db.queryForObject(
                    "SELECT COUNT(*) FROM (SELECT c.customer_code FROM cust_customer_main c " +
                    "JOIN (SELECT customer_code, SUM(remain_amount) u FROM finance_receivable_main GROUP BY customer_code) r " +
                    "ON r.customer_code=c.customer_code WHERE c.credit_limit>0 AND r.u >= c.credit_limit*0.9) x", Long.class));
            } catch (Exception ignored) {}
            ret.put("alerts", alerts);
            ret.put("recentSales", db.queryForList("SELECT sales_no, customer_name, total_amount, sales_status FROM trade_sales_main ORDER BY id DESC LIMIT 5"));
            ret.put("recentApprovals", db.queryForList("SELECT approval_no, approval_type, applicant, amount, approval_status FROM oa_approval_main ORDER BY id DESC LIMIT 5"));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("日报加载失败: " + e.getMessage()); }
    }

    // ── 报价单：审批 + 一键转销售订单 ──
    @PostMapping("/quote-approve/{quoteNo}") public Result quoteApprove(@PathVariable String quoteNo, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT audit_status FROM prod_quotation WHERE quote_no=?", quoteNo);
            if (rows.isEmpty()) return Result.error("报价单不存在: " + quoteNo);
            String st = String.valueOf(rows.get(0).get("audit_status"));
            if ("已转订单".equals(st)) return Result.error("该报价单已转订单，不可重复审批");
            db.update("UPDATE prod_quotation SET audit_status='已通过' WHERE quote_no=?", quoteNo);
            audit.log(user(req), "销售", "报价审批", quoteNo, audit.getIp(req));
            return Result.ok("已审批");
        } catch (Exception e) { return Result.error("审批失败: " + e.getMessage()); }
    }

    @PostMapping("/quote-to-sale/{quoteNo}")
    @Transactional
    public Result quoteToSale(@PathVariable String quoteNo, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM prod_quotation WHERE quote_no=?", quoteNo);
            if (rows.isEmpty()) return Result.error("报价单不存在: " + quoteNo);
            Map<String,Object> q = rows.get(0);
            String st = String.valueOf(q.get("audit_status"));
            if (!"已通过".equals(st)) return Result.error("仅「已通过」的报价单可转订单，当前状态：" + st);
            String salesNo = "SO-Q-" + System.currentTimeMillis();
            java.math.BigDecimal qty = new java.math.BigDecimal(String.valueOf(q.getOrDefault("qty", "1")));
            java.math.BigDecimal price = new java.math.BigDecimal(String.valueOf(q.getOrDefault("quote_price", "0")));
            java.math.BigDecimal amount = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
            String customerCode = String.valueOf(q.getOrDefault("customer_code", ""));
            String customerName = String.valueOf(q.getOrDefault("customer_name", ""));
            db.update("INSERT INTO trade_sales_main(sales_no,customer_code,customer_name,sales_date,total_amount,sales_person,sales_status,shipping_status,warehouse,remark) VALUES(?,?,?,?,?,?,'已审核','未发货','成品仓',?)",
                salesNo, customerCode, customerName, new java.sql.Date(System.currentTimeMillis()), amount,
                q.getOrDefault("quote_person", user(req)), "报价单转换:" + quoteNo);
            db.update("INSERT INTO trade_sales_detail(sales_no,line_no,product_code,product_name,spec_model,qty,unit,unit_price,amount,remark) VALUES(?,1,?,?,?,?,?,?,?,?)",
                salesNo, q.get("product_code"), q.get("product_name"), q.getOrDefault("spec_model", ""), qty,
                q.getOrDefault("unit", ""), price, amount, "报价单:" + quoteNo);
            db.update("UPDATE prod_quotation SET audit_status='已转订单', remark=CONCAT(COALESCE(remark,''),' 已转订单:',?) WHERE quote_no=?", salesNo, quoteNo);
            // 业财联动：自动生成凭证 + 应收单
            Long saleId = null;
            try { saleId = db.queryForObject("SELECT id FROM trade_sales_main WHERE sales_no=?", Long.class, salesNo); } catch (Exception ignored) {}
            String warn = "";
            if (saleId != null) {
                try { finance.generateVoucherFromSale(saleId); } catch (Exception e) { warn = "（凭证自动生成失败，可手动补）"; }
            }
            audit.log(user(req), "销售", "报价转订单", quoteNo + "→" + salesNo, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("sales_no", salesNo);
            ret.put("quote_no", quoteNo);
            ret.put("amount", amount);
            ret.put("warning", warn);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("转换失败: " + e.getMessage()); }
    }

    // ── 销售退货：退货单 + 回库 + 红字凭证（收入/成本冲回）+ 应收冲减 ──
    @PostMapping("/sales-return")
    @Transactional
    public Result salesReturn(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req)) && !"aftersale".equals(role(req))) return Result.error("权限不足");
        try {
            String salesNo = String.valueOf(body.getOrDefault("ref_sales_no", ""));
            if (salesNo.isEmpty()) return Result.error("请提供原销售单号");
            List<Map<String,Object>> sales = db.queryForList("SELECT * FROM trade_sales_main WHERE sales_no=?", salesNo);
            if (sales.isEmpty()) return Result.error("销售单不存在: " + salesNo);
            List<Map<String,Object>> details = db.queryForList("SELECT * FROM trade_sales_detail WHERE sales_no=? ORDER BY line_no", salesNo);
            if (details.isEmpty()) return Result.error("销售单无明细行");
            String reqCode = body.get("product_code") == null ? "" : String.valueOf(body.get("product_code"));
            Map<String,Object> line = null;
            for (Map<String,Object> d : details) {
                if (reqCode.isEmpty() || reqCode.equals(String.valueOf(d.get("product_code")))) { line = d; break; }
            }
            if (line == null) return Result.error("销售单中无该商品: " + reqCode);
            java.math.BigDecimal maxQty = new java.math.BigDecimal(String.valueOf(line.getOrDefault("qty", "0")));
            java.math.BigDecimal qty = body.get("qty") == null || String.valueOf(body.get("qty")).isEmpty()
                ? maxQty : new java.math.BigDecimal(String.valueOf(body.get("qty")));
            if (qty.signum() <= 0 || qty.compareTo(maxQty) > 0) return Result.error("退货数量须在 1 ~ " + maxQty.stripTrailingZeros().toPlainString() + " 之间");
            java.math.BigDecimal price = new java.math.BigDecimal(String.valueOf(line.getOrDefault("unit_price", "0")));
            java.math.BigDecimal amount = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
            String pCode = String.valueOf(line.get("product_code"));
            String pName = String.valueOf(line.getOrDefault("product_name", pCode));
            String spec = String.valueOf(line.getOrDefault("spec_model", ""));
            String warehouse = sales.get(0).get("warehouse") != null && !String.valueOf(sales.get(0).get("warehouse")).isEmpty()
                ? String.valueOf(sales.get(0).get("warehouse")) : "默认仓";

            // 1) 退货单
            String retNo = "SR-" + System.currentTimeMillis();
            db.update("INSERT INTO trade_sales_return(return_no,ref_sales_no,customer_code,customer_name,return_date,return_reason,total_amount,handler,status,remark) VALUES(?,?,?,?,CURDATE(),?,?,?,'已入库',?)",
                retNo, salesNo, sales.get(0).getOrDefault("customer_code", ""), sales.get(0).getOrDefault("customer_name", ""),
                String.valueOf(body.getOrDefault("reason", "销售退货")), amount, user(req), "退货:" + pCode + " x" + qty.stripTrailingZeros().toPlainString());

            // 2) 回库（按当前库存加权成本；无库存记录则成本 0）
            java.math.BigDecimal unitCost = java.math.BigDecimal.ZERO;
            try {
                List<Map<String,Object>> bal = db.queryForList("SELECT unit_cost FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", pCode, warehouse);
                if (!bal.isEmpty() && bal.get(0).get("unit_cost") != null) unitCost = new java.math.BigDecimal(bal.get(0).get("unit_cost").toString());
            } catch (Exception ignored) {}
            inventory.stockIn(pCode, pName, spec, warehouse, "", qty, unitCost, retNo);

            // 3) 红字凭证：冲收入（借 6001 贷 1122）+ 冲成本（借 1405 贷 6401）
            String period = new java.text.SimpleDateFormat("yyyy-MM").format(new java.util.Date());
            String cc = com.erp.config.CompanyContext.get();
            String vn1 = "VZ-SR-" + System.currentTimeMillis();
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark,company_code) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?,?)",
                vn1, period, amount, amount, "销售退货红字(冲收入):" + retNo, cc);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'6001','主营业务收入',?,0,?)", vn1, amount, "退货冲收入-" + salesNo);
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1122','应收账款',0,?,?)", vn1, amount, "退货冲应收-" + salesNo);
            finance.updateBalance("6001", "主营业务收入", amount, java.math.BigDecimal.ZERO);
            finance.updateBalance("1122", "应收账款", java.math.BigDecimal.ZERO, amount);
            java.math.BigDecimal costAmount = qty.multiply(unitCost).setScale(2, java.math.RoundingMode.HALF_UP);
            if (costAmount.signum() > 0) {
                String vn2 = vn1 + "-C";
                db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark,company_code) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?,?)",
                    vn2, period, costAmount, costAmount, "销售退货红字(冲成本):" + retNo, cc);
                db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'1405','库存商品',?,0,?)", vn2, costAmount, "退货回库-" + salesNo);
                db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'6401','主营业务成本',0,?,?)", vn2, costAmount, "退货冲成本-" + salesNo);
                finance.updateBalance("1405", "库存商品", costAmount, java.math.BigDecimal.ZERO);
                finance.updateBalance("6401", "主营业务成本", java.math.BigDecimal.ZERO, costAmount);
            }

            // 4) 应收冲减
            try {
                db.update("UPDATE finance_receivable_main SET total_amount=GREATEST(0,total_amount-?), remain_amount=GREATEST(0,remain_amount-?) WHERE remark LIKE ?",
                    amount, amount, "%" + salesNo + "%");
            } catch (Exception ignored) {}

            audit.log(user(req), "销售", "销售退货", salesNo + "→" + retNo + " ¥" + amount, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("return_no", retNo);
            ret.put("sales_no", salesNo);
            ret.put("amount", amount);
            ret.put("cost_amount", costAmount);
            ret.put("voucher_no", vn1);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("退货失败: " + e.getMessage()); }
    }

    // ── 库存盘点：查账面 → 录实盘 → 自动调账 ──
    @GetMapping("/stock-check/query") public Result stockCheckQuery(@RequestParam String product_code, @RequestParam String warehouse) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT qty, unit_cost, product_name FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", product_code, warehouse);
            Map<String,Object> ret = new LinkedHashMap<>();
            if (rows.isEmpty()) { ret.put("exists", false); ret.put("system_qty", 0); }
            else { ret.put("exists", true); ret.put("system_qty", rows.get(0).get("qty")); ret.put("unit_cost", rows.get(0).get("unit_cost")); ret.put("product_name", rows.get(0).get("product_name")); }
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("查询失败: " + e.getMessage()); }
    }
    @PostMapping("/stock-check/confirm") public Result stockCheckConfirm(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"warehouse".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String code = String.valueOf(body.get("product_code"));
            String wh = String.valueOf(body.getOrDefault("warehouse", "默认仓"));
            java.math.BigDecimal actual = new java.math.BigDecimal(String.valueOf(body.getOrDefault("actual_qty", "0")));
            if (code.isEmpty() || actual.signum() < 0) return Result.error("商品编码/实盘数量无效");
            List<Map<String,Object>> rows = db.queryForList("SELECT qty, unit_cost, product_name FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", code, wh);
            java.math.BigDecimal system = rows.isEmpty() ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(rows.get(0).get("qty").toString());
            java.math.BigDecimal unitCost = (rows.isEmpty() || rows.get(0).get("unit_cost") == null) ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(rows.get(0).get("unit_cost").toString());
            String pName = rows.isEmpty() ? String.valueOf(body.getOrDefault("product_name", code)) : String.valueOf(rows.get(0).get("product_name"));
            java.math.BigDecimal diff = actual.subtract(system);
            String checkNo = "PD-" + System.currentTimeMillis();
            // 差异自动调账（盘点盈亏单）
            if (diff.signum() > 0) inventory.stockIn(code, pName, "", wh, "", diff, unitCost, checkNo);
            else if (diff.signum() < 0) inventory.stockOut(code, wh, diff.abs(), checkNo);
            try {
                db.update("INSERT INTO trade_stock_check(check_no,warehouse,product_code,product_name,check_date,system_qty,actual_qty,diff_qty,diff_amount,checker,status,remark) VALUES(?,?,?,?,CURDATE(),?,?,?,?,?,'已盘点',?)",
                    checkNo, wh, code, pName, system, actual, diff, diff.multiply(unitCost), user(req), String.valueOf(body.getOrDefault("reason", "")));
            } catch (Exception ignored) {} // 未执行 upgrade3 补列时不阻断调账
            audit.log(user(req), "库存", "盘点", checkNo + " " + code + " 差异=" + diff, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("check_no", checkNo);
            ret.put("diff", diff);
            ret.put("diff_amount", diff.multiply(unitCost));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("盘点确认失败: " + e.getMessage()); }
    }

    // ── 回收站恢复 ──
    @PostMapping("/restore/{backupId}")
    @SuppressWarnings("unchecked")
    public Result restoreBackup(@PathVariable Long backupId, HttpServletRequest req) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_deleted_backup WHERE id=?", backupId);
            if (rows.isEmpty()) return Result.error("回收站记录不存在");
            String table = String.valueOf(rows.get(0).get("table_name"));
            if (!table.matches("^[a-z][a-z0-9_]{2,60}$")) return Result.error("无效表名");
            Map<String,Object> data = new com.fasterxml.jackson.databind.ObjectMapper().readValue(String.valueOf(rows.get(0).get("row_data")), Map.class);
            data.remove("id"); // 恢复时使用新 ID，避免主键冲突
            if (data.isEmpty()) return Result.error("备份数据为空");
            StringBuilder sb = new StringBuilder("INSERT INTO " + table + " ("), vb = new StringBuilder(" VALUES (");
            List<Object> params = new ArrayList<>();
            boolean first = true;
            for (Map.Entry<String,Object> e : data.entrySet()) {
                String k = e.getKey();
                if (!k.matches("^[a-zA-Z_][a-zA-Z0-9_]{0,60}$")) continue;
                if (!first) { sb.append(","); vb.append(","); }
                sb.append("`").append(k).append("`");
                vb.append("?");
                params.add(e.getValue());
                first = false;
            }
            sb.append(")").append(vb.append(")"));
            db.update(sb.toString(), params.toArray());
            db.update("DELETE FROM sys_deleted_backup WHERE id=?", backupId);
            audit.log(user(req), "系统", "回收站恢复", table + "#" + rows.get(0).get("row_id"), audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("table", table);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("恢复失败: " + e.getMessage()); }
    }

    // ── 多公司主数据 ──
    @GetMapping("/companies") public Result companies() {
        try { return Result.ok(db.queryForList("SELECT * FROM sys_company WHERE status='启用' ORDER BY is_default DESC, id")); }
        catch (Exception e) { return Result.ok(java.util.Collections.emptyList()); }
    }

    // ── 补货建议一键生成采购建议单（按供应商分单，草稿状态待审批） ──
    @PostMapping("/replenish-to-purchase")
    @Transactional
    public Result replenishToPurchase(HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"procurement".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> suggestions = report.replenishSuggestions();
            if (suggestions.isEmpty()) return Result.error("当前无低于安全线的物料，无需补货");
            // 按供应商分组（空供应商归入默认供应商）
            Map<String, List<Map<String,Object>>> bySupplier = new LinkedHashMap<>();
            for (Map<String,Object> s : suggestions) {
                String sup = s.get("supplier") == null || String.valueOf(s.get("supplier")).isEmpty() ? "默认供应商" : String.valueOf(s.get("supplier"));
                bySupplier.computeIfAbsent(sup, k -> new ArrayList<>()).add(s);
            }
            List<String> poNos = new ArrayList<>();
            for (Map.Entry<String, List<Map<String,Object>>> e : bySupplier.entrySet()) {
                String poNo = "PO-SUG-" + System.currentTimeMillis() + "-" + (poNos.size() + 1);
                java.math.BigDecimal total = java.math.BigDecimal.ZERO;
                List<Object[]> lines = new ArrayList<>();
                int lineNo = 0;
                for (Map<String,Object> s : e.getValue()) {
                    String code = String.valueOf(s.get("product_code"));
                    java.math.BigDecimal qty = new java.math.BigDecimal(String.valueOf(s.get("suggest_qty")));
                    java.math.BigDecimal price = java.math.BigDecimal.ZERO;
                    String name = String.valueOf(s.get("product_name"));
                    try {
                        List<Map<String,Object>> g = db.queryForList("SELECT purchase_price, product_name FROM trade_goods_main WHERE product_code=?", code);
                        if (!g.isEmpty()) {
                            if (g.get(0).get("purchase_price") != null) price = new java.math.BigDecimal(g.get(0).get("purchase_price").toString());
                            if (g.get(0).get("product_name") != null) name = String.valueOf(g.get(0).get("product_name"));
                        }
                    } catch (Exception ignored) {}
                    java.math.BigDecimal amount = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
                    total = total.add(amount);
                    lines.add(new Object[]{ poNo, ++lineNo, code, name, qty, price, amount });
                }
                db.update("INSERT INTO trade_purchase_main(purchase_no,supplier_code,supplier_name,purchase_date,total_amount,buyer,purchase_status,warehouse,remark) VALUES(?,?,?,CURDATE(),?,?, '待审批','原料仓','库存预警补货建议自动生成')",
                    poNo, "", e.getKey(), total, user(req));
                for (Object[] l : lines) {
                    db.update("INSERT INTO trade_purchase_detail(purchase_no,line_no,product_code,product_name,qty,unit_price,amount) VALUES(?,?,?,?,?,?,?)", l);
                }
                poNos.add(poNo);
            }
            audit.log(user(req), "采购", "补货转采购单", "共" + poNos.size() + "张:" + String.join(",", poNos), audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("po_count", poNos.size());
            ret.put("po_nos", poNos);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("生成采购建议单失败: " + e.getMessage()); }
    }

    // ── 销售订单执行跟踪：下单 → 审核 → 出库 → 回款 四段进度 ──
    @GetMapping("/sales-tracking") public Result salesTracking() {
        try {
            List<Map<String,Object>> sales = db.queryForList("SELECT * FROM trade_sales_main ORDER BY id DESC LIMIT 25");
            // 应收回款进度（按单号归集，备注格式：销售单:SO-xxx）
            Map<String, java.math.BigDecimal[]> rcvMap = new LinkedHashMap<>();
            try {
                for (Map<String,Object> r : db.queryForList("SELECT remark, COALESCE(SUM(total_amount),0) t, COALESCE(SUM(remain_amount),0) rm FROM finance_receivable_main GROUP BY remark")) {
                    String remark = String.valueOf(r.getOrDefault("remark", ""));
                    int idx = remark.indexOf(':');
                    if (idx >= 0 && idx < remark.length() - 1) {
                        rcvMap.put(remark.substring(idx + 1), new java.math.BigDecimal[]{ new java.math.BigDecimal(r.get("t").toString()), new java.math.BigDecimal(r.get("rm").toString()) });
                    }
                }
            } catch (Exception ignored) {}
            List<Map<String,Object>> rows = new ArrayList<>();
            for (Map<String,Object> s : sales) {
                String salesNo = String.valueOf(s.get("sales_no"));
                String salesStatus = String.valueOf(s.getOrDefault("sales_status", ""));
                String shipStatus = String.valueOf(s.getOrDefault("shipping_status", ""));
                int stage = 0; // 0 下单
                if ("已审核".equals(salesStatus) || "已完成".equals(salesStatus)) stage = 1;
                if ("已出库".equals(shipStatus) || "已发货".equals(shipStatus)) stage = 2;
                java.math.BigDecimal rcvTotal = java.math.BigDecimal.ZERO, rcvRemain = java.math.BigDecimal.ZERO;
                java.math.BigDecimal[] rcv = rcvMap.get(salesNo);
                boolean paidOff = false;
                if (rcv != null) {
                    rcvTotal = rcv[0]; rcvRemain = rcv[1];
                    if (rcvTotal.signum() > 0 && rcvRemain.signum() == 0) { paidOff = true; stage = 3; }
                }
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("sales_no", salesNo);
                row.put("customer_name", s.get("customer_name"));
                row.put("total_amount", s.get("total_amount"));
                row.put("sales_date", s.get("sales_date"));
                row.put("sales_status", salesStatus);
                row.put("shipping_status", shipStatus);
                row.put("stage", stage);
                row.put("paid_off", paidOff);
                row.put("rcv_total", rcvTotal);
                row.put("rcv_remain", rcvRemain);
                row.put("rcv_progress", rcvTotal.signum() > 0
                    ? rcvTotal.subtract(rcvRemain).multiply(new java.math.BigDecimal("100")).divide(rcvTotal, 0, java.math.RoundingMode.HALF_UP)
                    : java.math.BigDecimal.ZERO);
                rows.add(row);
            }
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("销售跟踪加载失败: " + e.getMessage()); }
    }

    // ── 系统运行监控：健康 + JVM + 审计统计 ──
    @GetMapping("/system-monitor") public Result systemMonitor(HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        Map<String,Object> ret = new LinkedHashMap<>();
        try {
            Map<String,Object> health = new LinkedHashMap<>();
            Runtime rt = Runtime.getRuntime();
            health.put("uptime_seconds", java.lang.management.ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
            health.put("heap_used_mb", (rt.totalMemory() - rt.freeMemory()) / 1024 / 1024);
            health.put("heap_max_mb", rt.maxMemory() / 1024 / 1024);
            health.put("threads", Thread.activeCount());
            long t0 = System.currentTimeMillis();
            try { db.queryForObject("SELECT 1", Integer.class); health.put("db_latency_ms", System.currentTimeMillis() - t0); health.put("db", "UP"); }
            catch (Exception e) { health.put("db", "DOWN"); health.put("db_latency_ms", -1); }
            try { health.put("table_count", db.queryForObject("SELECT COUNT(*) FROM sys_table_registry", Long.class)); } catch (Exception e) { health.put("table_count", 0); }
            ret.put("health", health);
            Map<String,Object> auditStats = new LinkedHashMap<>();
            try {
                auditStats.put("ops_today", db.queryForObject("SELECT COUNT(*) FROM sys_log_operation WHERE DATE(created_at)=CURDATE()", Long.class));
                auditStats.put("logins_today", db.queryForObject("SELECT COUNT(*) FROM sys_login_log WHERE DATE(login_time)=CURDATE() AND login_status='成功'", Long.class));
                auditStats.put("login_fails_today", db.queryForObject("SELECT COUNT(*) FROM sys_login_log WHERE DATE(login_time)=CURDATE() AND login_status LIKE '失败%'", Long.class));
                auditStats.put("ops_7d", db.queryForObject("SELECT COUNT(*) FROM sys_log_operation WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)", Long.class));
                auditStats.put("top_users", db.queryForList("SELECT username, COUNT(*) cnt FROM sys_log_operation WHERE DATE(created_at)=CURDATE() GROUP BY username ORDER BY cnt DESC LIMIT 5"));
                auditStats.put("top_modules", db.queryForList("SELECT module, COUNT(*) cnt FROM sys_log_operation WHERE DATE(created_at)=CURDATE() GROUP BY module ORDER BY cnt DESC LIMIT 5"));
            } catch (Exception e) { /* 审计表缺失时保持空 */ }
            ret.put("audit", auditStats);
            Map<String,Object> info = new LinkedHashMap<>();
            info.put("version", "5.19");
            info.put("java", System.getProperty("java.version"));
            ret.put("info", info);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("监控数据加载失败: " + e.getMessage()); }
    }

    // ── 销售/采购订单 Excel 批量导入（同一对方名称的多行合并为一张订单） ──
    @PostMapping("/import-orders/{type}")
    @Transactional
    public Result importOrders(@PathVariable String type, @RequestParam("file") MultipartFile file, HttpServletRequest req) {
        boolean isSales = "sales".equals(type);
        if (!"sales".equals(type) && !"purchase".equals(type)) return Result.error("不支持的导入类型: " + type);
        if (isSales && !"admin".equals(role(req)) && !"sales".equals(role(req))) return Result.error("权限不足");
        if (!isSales && !"admin".equals(role(req)) && !"procurement".equals(role(req))) return Result.error("权限不足");
        if (file == null || file.isEmpty()) return Result.error("请上传文件");
        String fname = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!fname.endsWith(".xlsx") && !fname.endsWith(".xls")) return Result.error("仅支持 .xlsx / .xls 文件");
        try (org.apache.poi.ss.usermodel.Workbook wb = org.apache.poi.ss.usermodel.WorkbookFactory.create(file.getInputStream())) {
            org.apache.poi.ss.usermodel.Sheet sh = wb.getSheetAt(0);
            if (sh == null || sh.getLastRowNum() < 1) return Result.error("工作表为空（第 1 行须为表头）");
            org.apache.poi.ss.usermodel.DataFormatter fmt = new org.apache.poi.ss.usermodel.DataFormatter();
            // 表头映射
            Map<String, Integer> head = new LinkedHashMap<>();
            org.apache.poi.ss.usermodel.Row hr = sh.getRow(0);
            if (hr != null) for (int c = 0; c < hr.getLastCellNum(); c++) {
                String v = cellStr(hr.getCell(c)).trim();
                if (!v.isEmpty()) head.put(v, c);
            }
            String partyCol = isSales ? "客户名称" : "供应商名称";
            if (!head.containsKey(partyCol) || !head.containsKey("商品编码")) return Result.error("表头缺少必需列：" + partyCol + " / 商品编码");
            // 按对方名称分组
            Map<String, List<String[]>> groups = new LinkedHashMap<>();
            Map<String, java.math.BigDecimal> groupAmount = new LinkedHashMap<>();
            List<String> errors = new ArrayList<>();
            for (int r = 1; r <= sh.getLastRowNum(); r++) {
                org.apache.poi.ss.usermodel.Row row = sh.getRow(r);
                if (row == null) continue;
                String party = at(row, partyCol);
                String pCode = cellAt(row, head, "商品编码", fmt);
                if (party.isEmpty() && pCode.isEmpty()) continue;
                if (party.isEmpty() || pCode.isEmpty()) { if (errors.size() < 5) errors.add("第 " + (r + 1) + " 行：" + partyCol + " 或 商品编码 缺失，已跳过"); continue; }
                java.math.BigDecimal qty;
                java.math.BigDecimal price;
                try { qty = new java.math.BigDecimal(cellAt(row, head, "数量", fmt).isEmpty() ? "1" : cellAt(row, head, "数量", fmt)); }
                catch (Exception e) { if (errors.size() < 5) errors.add("第 " + (r + 1) + " 行：数量格式错误，已跳过"); continue; }
                try { price = new java.math.BigDecimal(cellAt(row, head, "单价", fmt).isEmpty() ? "0" : cellAt(row, head, "单价", fmt)); }
                catch (Exception e) { if (errors.size() < 5) errors.add("第 " + (r + 1) + " 行：单价格式错误，已跳过"); continue; }
                if (qty.signum() <= 0) { if (errors.size() < 5) errors.add("第 " + (r + 1) + " 行：数量须大于 0，已跳过"); continue; }
                String pName = cellAt(row, head, "商品名称", fmt);
                if (pName.isEmpty()) {
                    try {
                        List<Map<String,Object>> g = db.queryForList("SELECT product_name FROM trade_goods_main WHERE product_code=?", pCode);
                        if (!g.isEmpty() && g.get(0).get("product_name") != null) pName = String.valueOf(g.get(0).get("product_name"));
                    } catch (Exception ignored) {}
                }
                String unit = cellAt(row, head, "单位", fmt);
                String[] line = { pCode, pName, unit, qty.toPlainString(), price.toPlainString(), qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() };
                groups.computeIfAbsent(party, k -> new ArrayList<>()).add(line);
                groupAmount.merge(party, qty.multiply(price), java.math.BigDecimal::add);
            }
            if (groups.isEmpty()) return Result.error("未解析到有效数据行" + (errors.isEmpty() ? "" : "（" + errors.get(0) + "）"));
            // 逐组建单
            List<String> orderNos = new ArrayList<>();
            int n = 0;
            for (Map.Entry<String, List<String[]>> e : groups.entrySet()) {
                n++;
                String partyName = e.getKey();
                String partyCode = "";
                try {
                    List<Map<String,Object>> ps = db.queryForList(isSales
                        ? "SELECT customer_code FROM cust_customer_main WHERE customer_name=?"
                        : "SELECT supplier_code FROM supp_supplier_main WHERE supplier_name=?", partyName);
                    if (!ps.isEmpty() && ps.get(0).values().iterator().next() != null) partyCode = String.valueOf(ps.get(0).values().iterator().next());
                } catch (Exception ignored) {}
                java.math.BigDecimal total = groupAmount.getOrDefault(partyName, java.math.BigDecimal.ZERO).setScale(2, java.math.RoundingMode.HALF_UP);
                String orderNo = (isSales ? "SO-IMP-" : "PO-IMP-") + System.currentTimeMillis() + "-" + n;
                if (isSales) {
                    db.update("INSERT INTO trade_sales_main(sales_no,customer_code,customer_name,sales_date,total_amount,sales_person,sales_status,shipping_status,warehouse,remark) VALUES(?,?,?,CURDATE(),?,'导入','已审核','未发货','成品仓','Excel批量导入')",
                        orderNo, partyCode, partyName, total);
                } else {
                    db.update("INSERT INTO trade_purchase_main(purchase_no,supplier_code,supplier_name,purchase_date,total_amount,buyer,purchase_status,warehouse,remark) VALUES(?,?,?,CURDATE(),?,'导入','待审批','原料仓','Excel批量导入')",
                        orderNo, partyCode, partyName, total);
                }
                int lineNo = 0;
                for (String[] l : e.getValue()) {
                    lineNo++;
                    if (isSales) {
                        db.update("INSERT INTO trade_sales_detail(sales_no,line_no,product_code,product_name,qty,unit,unit_price,amount) VALUES(?,?,?,?,?,?,?,?)",
                            orderNo, lineNo, l[0], l[1], new java.math.BigDecimal(l[3]), l[2], new java.math.BigDecimal(l[4]), new java.math.BigDecimal(l[5]));
                    } else {
                        db.update("INSERT INTO trade_purchase_detail(purchase_no,line_no,product_code,product_name,qty,unit,unit_price,amount) VALUES(?,?,?,?,?,?,?,?)",
                            orderNo, lineNo, l[0], l[1], new java.math.BigDecimal(l[3]), l[2], new java.math.BigDecimal(l[4]), new java.math.BigDecimal(l[5]));
                    }
                }
                // 业财联动：凭证 + 应收/应付
                try {
                    Long id = db.queryForObject(isSales ? "SELECT id FROM trade_sales_main WHERE sales_no=?" : "SELECT id FROM trade_purchase_main WHERE purchase_no=?", Long.class, orderNo);
                    if (id != null) {
                        if (isSales) finance.generateVoucherFromSale(id); else finance.generateVoucherFromPurchase(id);
                    }
                } catch (Exception ignored) {}
                orderNos.add(orderNo);
            }
            audit.log(user(req), isSales ? "销售" : "采购", "Excel批量导入订单", n + "张:" + String.join(",", orderNos), audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("order_count", orderNos.size());
            ret.put("line_count", groups.values().stream().mapToInt(List::size).sum());
            ret.put("order_nos", orderNos);
            ret.put("errors", errors);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("导入失败: " + e.getMessage()); }
    }

    // ── 采购订单执行跟踪：下单 → 审批 → 入库 → 付款 四段进度 ──
    @GetMapping("/purchase-tracking") public Result purchaseTracking() {
        try {
            List<Map<String,Object>> purchases = db.queryForList("SELECT * FROM trade_purchase_main ORDER BY id DESC LIMIT 25");
            // 应付付款进度（按单号归集，备注格式：采购单:PO-xxx）
            Map<String, java.math.BigDecimal[]> payMap = new LinkedHashMap<>();
            try {
                for (Map<String,Object> r : db.queryForList("SELECT remark, COALESCE(SUM(total_amount),0) t, COALESCE(SUM(remain_amount),0) rm FROM finance_payable_main GROUP BY remark")) {
                    String remark = String.valueOf(r.getOrDefault("remark", ""));
                    int idx = remark.indexOf(':');
                    if (idx >= 0 && idx < remark.length() - 1) {
                        payMap.put(remark.substring(idx + 1), new java.math.BigDecimal[]{ new java.math.BigDecimal(r.get("t").toString()), new java.math.BigDecimal(r.get("rm").toString()) });
                    }
                }
            } catch (Exception ignored) {}
            List<Map<String,Object>> rows = new ArrayList<>();
            for (Map<String,Object> s : purchases) {
                String poNo = String.valueOf(s.get("purchase_no"));
                String status = String.valueOf(s.getOrDefault("purchase_status", ""));
                int stage = 0; // 0 下单
                if ("已审批".equals(status) || "已入库".equals(status) || "已完成".equals(status)) stage = 1;
                if ("已入库".equals(status)) stage = 2;
                java.math.BigDecimal payTotal = java.math.BigDecimal.ZERO, payRemain = java.math.BigDecimal.ZERO;
                java.math.BigDecimal[] pay = payMap.get(poNo);
                boolean paidOff = false;
                if (pay != null) {
                    payTotal = pay[0]; payRemain = pay[1];
                    if (payTotal.signum() > 0 && payRemain.signum() == 0) { paidOff = true; stage = 3; }
                }
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("order_no", poNo);
                row.put("party_name", s.get("supplier_name"));
                row.put("total_amount", s.get("total_amount"));
                row.put("order_date", s.get("purchase_date"));
                row.put("order_status", status);
                row.put("shipping_status", String.valueOf(s.getOrDefault("arrival_status", "")));
                row.put("stage", stage);
                row.put("paid_off", paidOff);
                row.put("rcv_total", payTotal);
                row.put("rcv_remain", payRemain);
                row.put("rcv_progress", payTotal.signum() > 0
                    ? payTotal.subtract(payRemain).multiply(new java.math.BigDecimal("100")).divide(payTotal, 0, java.math.RoundingMode.HALF_UP)
                    : java.math.BigDecimal.ZERO);
                rows.add(row);
            }
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("采购跟踪加载失败: " + e.getMessage()); }
    }

    // ── 库存周转分析：周转率 / 可销天数 / 呆滞料 / 出入库月度趋势 ──
    @GetMapping("/inventory-analysis") public Result inventoryAnalysis() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            java.math.BigDecimal invValue = java.math.BigDecimal.ZERO;
            try {
                java.math.BigDecimal v = db.queryForObject("SELECT COALESCE(SUM(total_value),0) FROM trade_inventory_balance", java.math.BigDecimal.class);
                if (v != null) invValue = v;
            } catch (Exception ignored) {}
            java.math.BigDecimal out90 = java.math.BigDecimal.ZERO;
            try {
                java.math.BigDecimal v = db.queryForObject(
                    "SELECT COALESCE(SUM(d.qty * d.unit_cost),0) FROM trade_stock_out_detail d " +
                    "JOIN trade_stock_out_main m ON m.out_no=d.out_no WHERE m.out_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)", java.math.BigDecimal.class);
                if (v != null) out90 = v;
            } catch (Exception ignored) {}
            ret.put("inventory_value", invValue);
            ret.put("out_90d_cost", out90);
            java.math.BigDecimal turnover = java.math.BigDecimal.ZERO;
            java.math.BigDecimal days = java.math.BigDecimal.ZERO;
            if (invValue.signum() > 0) {
                turnover = out90.divide(invValue, 2, java.math.RoundingMode.HALF_UP);
                if (turnover.signum() > 0) days = new java.math.BigDecimal("90").divide(turnover, 0, java.math.RoundingMode.HALF_UP);
            }
            ret.put("turnover_rate_90d", turnover);
            ret.put("sellable_days", days);
            // 呆滞料：近90天无出库记录的存货（按金额TOP5）
            try {
                ret.put("slow_moving", db.queryForList(
                    "SELECT b.product_code, b.product_name, b.qty, b.total_value FROM trade_inventory_balance b " +
                    "WHERE b.total_value > 0 AND NOT EXISTS (SELECT 1 FROM trade_stock_out_detail d WHERE d.product_code=b.product_code AND d.id IN " +
                    "(SELECT d2.id FROM trade_stock_out_detail d2 JOIN trade_stock_out_main m2 ON m2.out_no=d2.out_no WHERE m2.out_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY))) " +
                    "ORDER BY b.total_value DESC LIMIT 5"));
            } catch (Exception e) { ret.put("slow_moving", new ArrayList<>()); }
            // 近6个月出入库金额趋势
            List<Map<String,Object>> trend = new ArrayList<>();
            try {
                Map<String, Map<String,Object>> byMonth = new LinkedHashMap<>();
                for (Map<String,Object> r : db.queryForList(
                        "SELECT DATE_FORMAT(in_date,'%Y-%m') m, COALESCE(SUM(total_amount),0) v FROM trade_stock_in_main WHERE in_date >= DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(in_date,'%Y-%m')")) {
                    byMonth.computeIfAbsent(String.valueOf(r.get("m")), k -> { Map<String,Object> mm = new LinkedHashMap<>(); mm.put("name", k); mm.put("in_value", java.math.BigDecimal.ZERO); mm.put("out_value", java.math.BigDecimal.ZERO); return mm; })
                        .put("in_value", r.get("v"));
                }
                for (Map<String,Object> r : db.queryForList(
                        "SELECT DATE_FORMAT(out_date,'%Y-%m') m, COALESCE(SUM(total_amount),0) v FROM trade_stock_out_main WHERE out_date >= DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(out_date,'%Y-%m')")) {
                    byMonth.computeIfAbsent(String.valueOf(r.get("m")), k -> { Map<String,Object> mm = new LinkedHashMap<>(); mm.put("name", k); mm.put("in_value", java.math.BigDecimal.ZERO); mm.put("out_value", java.math.BigDecimal.ZERO); return mm; })
                        .put("out_value", r.get("v"));
                }
                List<String> months = new ArrayList<>(byMonth.keySet());
                java.util.Collections.sort(months);
                for (String m : months) trend.add(byMonth.get(m));
            } catch (Exception ignored) {}
            ret.put("trend", trend);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("库存分析加载失败: " + e.getMessage()); }
    }

    // ── 数据库逻辑备份导出（全表 INSERT 语句，管理员专用） ──
    @GetMapping("/backup")
    public ResponseEntity<byte[]> backupSql(HttpServletRequest req) {
        if (!"admin".equals(role(req))) return ResponseEntity.status(403).build();
        try {
            List<String> tables = db.queryForList("SHOW TABLES", String.class);
            StringBuilder sb = new StringBuilder();
            String ts = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new java.util.Date());
            sb.append("-- ERP 数据备份（逻辑备份：全表数据，INSERT 语句）\n");
            sb.append("-- 生成时间: ").append(new java.util.Date()).append("  表数量: ").append(tables.size()).append("\n");
            sb.append("-- 恢复：先按顺序执行 database/init.sql、upgrade*.sql 建库，再导入本文件（INSERT IGNORE 幂等）\n");
            sb.append("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
            for (String t : tables) {
                if (!t.matches("^[a-zA-Z0-9_]+$")) continue;
                List<Map<String,Object>> rows;
                try { rows = db.queryForList("SELECT * FROM `" + t + "`"); } catch (Exception e) { continue; }
                if (rows.isEmpty()) continue;
                sb.append("-- ── ").append(t).append(" (").append(rows.size()).append(" 行) ──\n");
                int n = 0;
                for (Map<String,Object> row : rows) {
                    n++;
                    if (n == 1) sb.append("INSERT IGNORE INTO `").append(t).append("` VALUES ");
                    else sb.append(",");
                    sb.append("(");
                    boolean first = true;
                    for (Object v : row.values()) {
                        if (!first) sb.append(",");
                        first = false;
                        sb.append(sqlLiteral(v));
                    }
                    sb.append(")");
                    if (n % 50 == 0 || n == rows.size()) sb.append(";\n");
                }
                sb.append("\n");
            }
            sb.append("SET FOREIGN_KEY_CHECKS=1;\n");
            byte[] data = sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
            audit.log(user(req), "系统", "数据备份", "全库" + tables.size() + "表/" + data.length + "字节", audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''erp_backup_" + ts + ".sql")
                .contentType(MediaType.parseMediaType("application/sql;charset=UTF-8"))
                .body(data);
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }

    private String sqlLiteral(Object v) {
        if (v == null) return "NULL";
        if (v instanceof Number) return v.toString();
        if (v instanceof byte[]) {
            byte[] b = (byte[]) v;
            StringBuilder hx = new StringBuilder("X'");
            for (byte x : b) hx.append(String.format("%02X", x));
            return hx.append("'").toString();
        }
        String s = v.toString().replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
        return "'" + s + "'";
    }

    // ── 生产工单执行跟踪：创建 → 领料 → 生产 → 完工 四段进度 ──
    @GetMapping("/production-tracking") public Result productionTracking() {
        try {
            List<Map<String,Object>> orders = db.queryForList("SELECT * FROM prod_work_order ORDER BY id DESC LIMIT 25");
            // 各工单领料进度（实领数量合计）
            Map<String, java.math.BigDecimal> reqMap = new LinkedHashMap<>();
            try {
                for (Map<String,Object> r : db.queryForList(
                        "SELECT ref_work_order, COALESCE(SUM(actual_req_qty),0) q FROM prod_material_requisition GROUP BY ref_work_order")) {
                    reqMap.put(String.valueOf(r.get("ref_work_order")), new java.math.BigDecimal(r.get("q").toString()));
                }
            } catch (Exception ignored) {}
            List<Map<String,Object>> rows = new ArrayList<>();
            for (Map<String,Object> o : orders) {
                String woNo = String.valueOf(o.get("work_order_no"));
                java.math.BigDecimal plan = toBig(o.get("plan_qty"));
                java.math.BigDecimal actual = toBig(o.get("actual_qty"));
                java.math.BigDecimal scrap = toBig(o.get("scrap_qty"));
                java.math.BigDecimal issued = reqMap.getOrDefault(woNo, java.math.BigDecimal.ZERO);
                String status = String.valueOf(o.getOrDefault("order_status", ""));
                int stage = 0; // 0 创建
                if (issued.signum() > 0) stage = 1; // 已领料
                if (actual.signum() > 0) stage = 2; // 生产中（有完工入库）
                if ("已完成".equals(status) || (plan.signum() > 0 && actual.compareTo(plan) >= 0)) stage = 3; // 完工
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("work_order_no", woNo);
                row.put("product_name", o.get("product_name"));
                row.put("product_code", o.get("product_code"));
                row.put("plan_qty", plan);
                row.put("actual_qty", actual);
                row.put("scrap_qty", scrap);
                row.put("issued_qty", issued);
                row.put("start_date", o.get("start_date"));
                row.put("order_status", status);
                row.put("stage", stage);
                row.put("progress", plan.signum() > 0
                    ? actual.multiply(new java.math.BigDecimal("100")).divide(plan, 0, java.math.RoundingMode.HALF_UP).min(new java.math.BigDecimal("100"))
                    : java.math.BigDecimal.ZERO);
                rows.add(row);
            }
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("生产跟踪加载失败: " + e.getMessage()); }
    }

    private java.math.BigDecimal toBig(Object v) {
        if (v == null) return java.math.BigDecimal.ZERO;
        try { return new java.math.BigDecimal(v.toString()); } catch (Exception e) { return java.math.BigDecimal.ZERO; }
    }

    // ── 操作日志高级检索：用户/模块/时间范围 + 分页 ──
    @GetMapping("/audit-search") public Result auditSearch(
            @RequestParam(defaultValue = "") String user,
            @RequestParam(defaultValue = "") String module,
            @RequestParam(defaultValue = "") String from,
            @RequestParam(defaultValue = "") String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            StringBuilder where = new StringBuilder(" WHERE 1=1");
            List<Object> params = new ArrayList<>();
            if (!user.trim().isEmpty()) { where.append(" AND username LIKE ?"); params.add("%" + user.trim() + "%"); }
            if (!module.trim().isEmpty() && !"全部".equals(module.trim())) { where.append(" AND module=?"); params.add(module.trim()); }
            if (from.matches("\\d{4}-\\d{2}-\\d{2}")) { where.append(" AND DATE(created_at) >= ?"); params.add(from); }
            if (to.matches("\\d{4}-\\d{2}-\\d{2}")) { where.append(" AND DATE(created_at) <= ?"); params.add(to); }
            Long total = db.queryForObject("SELECT COUNT(*) FROM sys_log_operation" + where, Long.class, params.toArray());
            List<Object> pageParams = new ArrayList<>(params);
            pageParams.add(Math.max(1, size));
            pageParams.add((Math.max(1, page) - 1) * Math.max(1, size));
            List<Map<String,Object>> rows = db.queryForList(
                "SELECT * FROM sys_log_operation" + where + " ORDER BY id DESC LIMIT ? OFFSET ?", pageParams.toArray());
            List<Map<String,Object>> modules = db.queryForList("SELECT DISTINCT module FROM sys_log_operation ORDER BY module");
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("total", total == null ? 0 : total);
            ret.put("rows", rows);
            ret.put("modules", modules);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("检索失败: " + e.getMessage()); }
    }

    // ── 三大财务报表 Excel 工作簿（一个文件三个 Sheet） ──
    @GetMapping("/report/excel-all")
    public ResponseEntity<byte[]> reportExcelAll(@RequestParam String period, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return ResponseEntity.status(403).build();
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            buildStatementSheet(wb.createSheet("资产负债表"), "balance", period);
            buildStatementSheet(wb.createSheet("利润表"), "income", period);
            buildStatementSheet(wb.createSheet("现金流量表"), "cashflow", period);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            wb.write(bos);
            String filename = java.net.URLEncoder.encode("财务报表_" + period + ".xlsx", "UTF-8").replace("+", "%20");
            audit.log(user(req), "财务", "导出报表工作簿", period, audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + filename)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(bos.toByteArray());
        } catch (Exception e) { return ResponseEntity.status(500).build(); }
    }

    /** 把指定报表填入 Sheet（标题行 + 汇总 + 明细） */
    private void buildStatementSheet(org.apache.poi.ss.usermodel.Sheet sh, String type, String period) {
        org.apache.poi.ss.usermodel.CellStyle head = sh.getWorkbook().createCellStyle();
        org.apache.poi.ss.usermodel.Font hf = sh.getWorkbook().createFont();
        hf.setBold(true);
        head.setFont(hf);
        int r = 0;
        org.apache.poi.ss.usermodel.Row t = sh.createRow(r++);
        t.createCell(0).setCellValue(("balance".equals(type) ? "资产负债表" : "income".equals(type) ? "利润表" : "现金流量表") + "　—　会计期间：" + period + "　—　" + com.erp.config.CompanyContext.get());
        r++;
        if ("balance".equals(type)) {
            Map<String,Object> d = report.balanceSheet(period);
            String[] heads = {"科目编码", "科目名称", "期末余额"};
            org.apache.poi.ss.usermodel.Row hr = sh.createRow(r++);
            for (int i = 0; i < heads.length; i++) { org.apache.poi.ss.usermodel.Cell c = hr.createCell(i); c.setCellValue(heads[i]); c.setCellStyle(head); }
            for (Map<String,Object> it : asList(d.get("assetItems"))) {
                org.apache.poi.ss.usermodel.Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(String.valueOf(it.get("code")));
                row.createCell(1).setCellValue(String.valueOf(it.get("name")));
                row.createCell(2).setCellValue(toDouble(it.get("balance")));
            }
            for (Map<String,Object> it : asList(d.get("liabilityItems"))) {
                org.apache.poi.ss.usermodel.Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(String.valueOf(it.get("code")));
                row.createCell(1).setCellValue(String.valueOf(it.get("name")));
                row.createCell(2).setCellValue(toDouble(it.get("balance")));
            }
            r++;
            org.apache.poi.ss.usermodel.Row s1 = sh.createRow(r++);
            s1.createCell(0).setCellValue("资产合计"); s1.createCell(2).setCellValue(toDouble(d.get("assets")));
            org.apache.poi.ss.usermodel.Row s2 = sh.createRow(r++);
            s2.createCell(0).setCellValue("负债合计"); s2.createCell(2).setCellValue(toDouble(d.get("liabilities")));
            org.apache.poi.ss.usermodel.Row s3 = sh.createRow(r++);
            s3.createCell(0).setCellValue("所有者权益合计"); s3.createCell(2).setCellValue(toDouble(d.get("equity")));
            org.apache.poi.ss.usermodel.Row s4 = sh.createRow(r++);
            s4.createCell(0).setCellValue("负债和权益总计"); s4.createCell(2).setCellValue(toDouble(d.get("total_liability_equity")));
        } else if ("income".equals(type)) {
            Map<String,Object> d = report.incomeStatement(period);
            org.apache.poi.ss.usermodel.Row s1 = sh.createRow(r++);
            s1.createCell(0).setCellValue("营业收入"); s1.createCell(1).setCellValue(toDouble(d.get("revenue")));
            org.apache.poi.ss.usermodel.Row s2 = sh.createRow(r++);
            s2.createCell(0).setCellValue("营业成本"); s2.createCell(1).setCellValue(toDouble(d.get("cost")));
            org.apache.poi.ss.usermodel.Row s3 = sh.createRow(r++);
            s3.createCell(0).setCellValue("毛利润"); s3.createCell(1).setCellValue(toDouble(d.get("gross_profit")));
            org.apache.poi.ss.usermodel.Row s4 = sh.createRow(r++);
            s4.createCell(0).setCellValue("净利润"); s4.createCell(1).setCellValue(toDouble(d.get("net_profit")));
            r++;
            String[] heads = {"科目编码", "科目名称", "借方发生", "贷方发生", "期末余额"};
            org.apache.poi.ss.usermodel.Row hr = sh.createRow(r++);
            for (int i = 0; i < heads.length; i++) { org.apache.poi.ss.usermodel.Cell c = hr.createCell(i); c.setCellValue(heads[i]); c.setCellStyle(head); }
            for (Map<String,Object> it : asList(d.get("items"))) {
                org.apache.poi.ss.usermodel.Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(String.valueOf(it.get("subject_code")));
                row.createCell(1).setCellValue(String.valueOf(it.get("subject_name")));
                row.createCell(2).setCellValue(toDouble(it.get("debit_amount")));
                row.createCell(3).setCellValue(toDouble(it.get("credit_amount")));
                row.createCell(4).setCellValue(toDouble(it.get("end_balance")));
            }
        } else {
            Map<String,Object> d = report.cashFlow(period);
            org.apache.poi.ss.usermodel.Row s1 = sh.createRow(r++);
            s1.createCell(0).setCellValue("现金流入"); s1.createCell(1).setCellValue(toDouble(d.get("cash_in")));
            org.apache.poi.ss.usermodel.Row s2 = sh.createRow(r++);
            s2.createCell(0).setCellValue("现金流出"); s2.createCell(1).setCellValue(toDouble(d.get("cash_out")));
            org.apache.poi.ss.usermodel.Row s3 = sh.createRow(r++);
            s3.createCell(0).setCellValue("净现金流"); s3.createCell(1).setCellValue(toDouble(d.get("net_cash")));
            r++;
            org.apache.poi.ss.usermodel.Row h1 = sh.createRow(r++);
            h1.createCell(0).setCellValue("流入项目"); h1.createCell(1).setCellValue("金额");
            h1.getCell(0).setCellStyle(head); h1.getCell(1).setCellStyle(head);
            for (Map<String,Object> it : asList(d.get("inflow_items"))) {
                org.apache.poi.ss.usermodel.Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(String.valueOf(it.get("name")));
                row.createCell(1).setCellValue(toDouble(it.get("value")));
            }
            r++;
            org.apache.poi.ss.usermodel.Row h2 = sh.createRow(r++);
            h2.createCell(0).setCellValue("流出项目"); h2.createCell(1).setCellValue("金额");
            h2.getCell(0).setCellStyle(head); h2.getCell(1).setCellStyle(head);
            for (Map<String,Object> it : asList(d.get("outflow_items"))) {
                org.apache.poi.ss.usermodel.Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(String.valueOf(it.get("name")));
                row.createCell(1).setCellValue(toDouble(it.get("value")));
            }
        }
        for (int i = 0; i < 5; i++) sh.setColumnWidth(i, 18 * 256);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String,Object>> asList(Object o) {
        if (o instanceof List) return (List<Map<String,Object>>) o;
        return new ArrayList<>();
    }

    private double toDouble(Object v) {
        if (v == null) return 0;
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0; }
    }

    // ── 销售目标达成率 ──
    @GetMapping("/target-progress") public Result targetProgress() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            String curMonth = db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m')", String.class);
            ret.put("month", curMonth);
            List<Map<String,Object>> targets = db.queryForList(
                "SELECT salesperson, COALESCE(SUM(target_amount),0) target FROM trade_sales_target WHERE target_month=? GROUP BY salesperson ORDER BY target DESC", curMonth);
            Map<String, Map<String,Object>> actualMap = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList(
                    "SELECT sales_person, COALESCE(SUM(total_amount),0) amt, COUNT(*) cnt FROM trade_sales_main WHERE DATE_FORMAT(sales_date,'%Y-%m')=? GROUP BY sales_person", curMonth)) {
                actualMap.put(String.valueOf(r.get("sales_person")), r);
            }
            List<Map<String,Object>> rows = new ArrayList<>();
            BigDecimal totTarget = BigDecimal.ZERO, totActual = BigDecimal.ZERO;
            for (Map<String,Object> t : targets) {
                String person = String.valueOf(t.get("salesperson"));
                BigDecimal target = new BigDecimal(t.get("target").toString());
                Map<String,Object> a = actualMap.get(person);
                BigDecimal actual = a == null ? BigDecimal.ZERO : new BigDecimal(a.get("amt").toString());
                Long cnt = a == null ? 0L : ((Number)a.get("cnt")).longValue();
                totTarget = totTarget.add(target);
                totActual = totActual.add(actual);
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("salesperson", person);
                row.put("target", target);
                row.put("actual", actual);
                row.put("count", cnt);
                row.put("rate", target.signum() > 0 ? actual.multiply(new BigDecimal("100")).divide(target, 1, java.math.RoundingMode.HALF_UP) : BigDecimal.ZERO);
                rows.add(row);
            }
            // 无目标但有销售的人员也列出
            for (Map.Entry<String, Map<String,Object>> e : actualMap.entrySet()) {
                boolean has = false;
                for (Map<String,Object> row : rows) if (e.getKey().equals(row.get("salesperson"))) { has = true; break; }
                if (!has) {
                    BigDecimal actual = new BigDecimal(e.getValue().get("amt").toString());
                    totActual = totActual.add(actual);
                    Map<String,Object> row = new LinkedHashMap<>();
                    row.put("salesperson", e.getKey());
                    row.put("target", BigDecimal.ZERO);
                    row.put("actual", actual);
                    row.put("count", ((Number)e.getValue().get("cnt")).longValue());
                    row.put("rate", BigDecimal.ZERO);
                    rows.add(row);
                }
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("target", totTarget);
            totals.put("actual", totActual);
            totals.put("rate", totTarget.signum() > 0 ? totActual.multiply(new BigDecimal("100")).divide(totTarget, 1, java.math.RoundingMode.HALF_UP) : BigDecimal.ZERO);
            ret.put("rows", rows);
            ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("目标达成加载失败: " + e.getMessage()); }
    }

    // ── 销售毛利分析 + 安全库存补货建议 ──
    @GetMapping("/profit-analysis") public Result profitAnalysis() {
        try { return Result.ok(report.profitAnalysis()); }
        catch (Exception e) { return Result.error("毛利分析加载失败: " + e.getMessage()); }
    }
    @GetMapping("/replenish") public Result replenish() {
        try { return Result.ok(report.replenishSuggestions()); }
        catch (Exception e) { return Result.error("补货建议加载失败: " + e.getMessage()); }
    }

    // ── 仓间调拨（多仓库管理） ──
    @PostMapping("/transfer") public Result transfer(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = inventory.transfer(
                String.valueOf(body.get("product_code")),
                String.valueOf(body.getOrDefault("from_warehouse", "")),
                String.valueOf(body.getOrDefault("to_warehouse", "")),
                new java.math.BigDecimal(body.getOrDefault("qty", "0").toString()),
                String.valueOf(body.getOrDefault("reason", "")));
            audit.log(user(req), "库存", "仓间调拨", body.get("product_code") + " " + body.get("from_warehouse") + "→" + body.get("to_warehouse") + " qty=" + body.get("qty"), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("调拨失败: " + e.getMessage()); }
    }

    // ── 批次追溯：正向基因图谱 / 反向按销售单追溯 ──
    @GetMapping("/batch-trace/{batchNo}") public Result batchTrace(@PathVariable String batchNo) {
        try { return Result.ok(batchService.trace(batchNo)); }
        catch (Exception e) { return Result.error("批次追溯失败: " + e.getMessage()); }
    }
    @GetMapping("/batch-trace-sale/{salesNo}") public Result batchTraceSale(@PathVariable String salesNo) {
        try { return Result.ok(batchService.traceBySale(salesNo)); }
        catch (Exception e) { return Result.error("追溯失败: " + e.getMessage()); }
    }

    // ── 物料编码规则（行业特色：电子智造 分类前缀+流水号） ──
    @GetMapping("/code-rules") public Result codeRules() {
        try { return Result.ok(db.queryForList("SELECT * FROM sys_code_rule ORDER BY id")); }
        catch (Exception e) { return Result.error("编码规则加载失败（请先执行 database/upgrade3.sql）"); }
    }
    @GetMapping("/next-code/{ruleCode}") public Result nextCode(@PathVariable String ruleCode) {
        try {
            List<Map<String,Object>> rules = db.queryForList("SELECT * FROM sys_code_rule WHERE rule_code=?", ruleCode);
            if (rules.isEmpty()) return Result.error("编码规则不存在: " + ruleCode);
            Map<String,Object> rule = rules.get(0);
            String prefix = String.valueOf(rule.get("prefix"));
            int seqLen = rule.get("seq_length") == null ? 4 : ((Number)rule.get("seq_length")).intValue();
            // 从现有编码扫描最大流水号（无需维护计数器，天然防重）
            int maxSeq = 0;
            List<Map<String,Object>> exist = db.queryForList("SELECT product_code FROM trade_goods_main WHERE product_code LIKE ?", prefix + "%");
            for (Map<String,Object> r : exist) {
                String code = String.valueOf(r.get("product_code"));
                String tail = code.substring(prefix.length());
                try { int n = Integer.parseInt(tail.trim()); if (n > maxSeq) maxSeq = n; } catch (Exception ignored) {}
            }
            String next = prefix + String.format("%0" + seqLen + "d", maxSeq + 1);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("code", next);
            ret.put("rule_name", rule.get("rule_name"));
            ret.put("description", rule.get("description"));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("生成编码失败: " + e.getMessage()); }
    }

    // ── 业财一体化：单据的财务联动全景（凭证/应收应付/出入库/批次） ──
    @GetMapping("/doc-links/{no}") public Result docLinks(@PathVariable String no) {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("vouchers", db.queryForList("SELECT * FROM voucher_main WHERE remark LIKE ? ORDER BY id", "%" + no + "%"));
            ret.put("voucherDetails", db.queryForList("SELECT d.* FROM voucher_detail d JOIN voucher_main m ON m.voucher_no=d.voucher_no WHERE m.remark LIKE ? ORDER BY m.id, d.line_no", "%" + no + "%"));
            ret.put("receivables", db.queryForList("SELECT * FROM finance_receivable_main WHERE remark LIKE ?", "%" + no + "%"));
            ret.put("payables", db.queryForList("SELECT * FROM finance_payable_main WHERE remark LIKE ?", "%" + no + "%"));
            ret.put("stockIn", db.queryForList("SELECT * FROM trade_stock_in_main WHERE ref_no=?", no));
            ret.put("stockOut", db.queryForList("SELECT * FROM trade_stock_out_main WHERE ref_no=?", no));
            ret.put("batches", db.queryForList("SELECT * FROM trade_batch_trace WHERE source_no=?", no));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("联动查询失败: " + e.getMessage()); }
    }

    // ── 凭证 ──
    @PostMapping("/voucher") public Result createVoucher(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            Object linesObj = body.get("lines");
            if (!(linesObj instanceof List)) return Result.error("凭证明细(lines)必须是数组");
            @SuppressWarnings("unchecked")
            List<Map<String,Object>> lines = (List<Map<String,Object>>) linesObj;
            Map<String,Object> r = finance.createVoucher(
                String.valueOf(body.getOrDefault("voucher_word","记")),
                String.valueOf(body.getOrDefault("period","")),
                lines,
                user(req),
                req.getHeader("X-Company-Code"));
            audit.log(user(req), "会计", "新增凭证", String.valueOf(r.get("voucher_no")), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error("凭证生成失败: " + e.getMessage()); }
    }

    @PostMapping("/finance/voucher-from-sale/{id}") public Result voucherFromSale(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { finance.generateVoucherFromSale(id); audit.log(user(req), "会计", "补生成销售凭证", "id="+id, audit.getIp(req)); return Result.ok("ok"); }
        catch (Exception e) { return Result.error("凭证生成失败: " + e.getMessage()); }
    }

    @PostMapping("/finance/voucher-from-purchase/{id}") public Result voucherFromPurchase(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { finance.generateVoucherFromPurchase(id); audit.log(user(req), "会计", "补生成采购凭证", "id="+id, audit.getIp(req)); return Result.ok("ok"); }
        catch (Exception e) { return Result.error("凭证生成失败: " + e.getMessage()); }
    }

    // ── 导出 ──
    @GetMapping("/export/{table}") public byte[] exportCsv(@PathVariable String table, HttpServletRequest req) {
        audit.log(String.valueOf(req.getAttribute("user")), table, "导出", "CSV导出", audit.getIp(req));
        return exportService.exportToCsv(table);
    }

    // ── 应收应付核销 ──
    @PostMapping("/reconciliation") public Result reconcile(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        try {
            String type = val(body.getOrDefault("type","receivable"));
            String no = val(body.get("no"));
            if (no.isEmpty()) return Result.error("单号不能为空");
            java.math.BigDecimal amount = new java.math.BigDecimal(body.getOrDefault("amount","0").toString());
            Map<String,Object> result = reconciliation.reconcile(type, no, amount);
            audit.log(String.valueOf(req.getAttribute("user")), "财务", "核销", type + ":" + no + " 金额=" + amount, audit.getIp(req));
            return Result.ok(result);
        } catch (Exception e) { return Result.error("核销失败: " + e.getMessage()); }
    }

    // ── 财务模版 ──
    @GetMapping("/fin/templates")
    public Result finTemplates(HttpServletRequest req) {
        try {
            return Result.ok(fin.listTemplates(uid(req), role(req)));
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @GetMapping("/fin/templates/{id}")
    public Result finTemplate(@PathVariable Long id, HttpServletRequest req) {
        try {
            fin.checkPerm(uid(req), role(req), id, "view");
            return Result.ok(fin.getTemplate(id));
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @GetMapping("/fin/templates/{id}/blank")
    public ResponseEntity<byte[]> finBlank(@PathVariable Long id, HttpServletRequest req) {
        try {
            byte[] data = fin.getBlankFile(id, uid(req), role(req));
            audit.log(user(req), "财务", "下载空白模版", "template="+id, audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=template-"+id+".xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
        } catch (Exception e) {
            return ResponseEntity.status(403).body(e.getMessage().getBytes(StandardCharsets.UTF_8));
        }
    }

    @PostMapping("/fin/templates")
    public Result finUpload(@RequestParam("file") MultipartFile file,
                            @RequestParam String name,
                            @RequestParam(required = false) String company,
                            @RequestParam(required = false) String category,
                            @RequestParam(required = false, defaultValue = "multi") String instanceMode,
                            HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            Map<String,Object> r = fin.uploadTemplate(file, name, company, category, instanceMode, user(req));
            audit.log(user(req), "财务", "上传模版", name, audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @GetMapping("/fin/instances")
    public Result finInstances(@RequestParam Long template_id, HttpServletRequest req) {
        try { return Result.ok(fin.listInstances(template_id, uid(req), role(req))); }
        catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @GetMapping("/fin/instances/{id}")
    public Result finInstance(@PathVariable Long id, HttpServletRequest req) {
        try { return Result.ok(fin.getInstance(id, uid(req), role(req))); }
        catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @PostMapping("/fin/instances")
    public Result finCreateInstance(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        try {
            Map<String,Object> r = fin.saveInstance(body, uid(req), role(req), user(req));
            audit.log(user(req), "财务", "新建实例", String.valueOf(r.get("title")), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @PutMapping("/fin/instances/{id}")
    public Result finUpdateInstance(@PathVariable Long id, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        try {
            Map<String,Object> r = fin.updateInstance(id, body, uid(req), role(req));
            audit.log(user(req), "财务", "更新实例", String.valueOf(r.get("title")), audit.getIp(req));
            return Result.ok(r);
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @DeleteMapping("/fin/instances/{id}")
    public Result finDeleteInstance(@PathVariable Long id, HttpServletRequest req) {
        try {
            fin.deleteInstance(id, uid(req), role(req), user(req));
            audit.log(user(req), "财务", "删除实例", "id="+id, audit.getIp(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @GetMapping("/fin/instances/{id}/export")
    public ResponseEntity<byte[]> finExport(@PathVariable Long id, HttpServletRequest req) {
        try {
            byte[] data = fin.exportInstance(id, uid(req), role(req));
            String filename = URLEncoder.encode("财务表单-"+id+".xlsx", "UTF-8").replace("+", "%20");
            audit.log(user(req), "财务", "下载", "instance="+id, audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''"+filename)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
        } catch (Exception e) {
            return ResponseEntity.status(403).body(e.getMessage().getBytes(StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/fin/perms")
    public Result finGetPerms(@RequestParam Long user_id, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(fin.getPerms(user_id)); }
        catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @PutMapping("/fin/perms")
    public Result finSavePerms(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            Long userId = Long.valueOf(String.valueOf(body.get("user_id")));
            @SuppressWarnings("unchecked")
            List<Map<String,Object>> perms = (List<Map<String,Object>>) body.get("perms");
            fin.savePerms(userId, perms == null ? Collections.emptyList() : perms);
            audit.log(user(req), "财务", "保存模版权限", "user="+userId, audit.getIp(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    private Long uid(HttpServletRequest req) {
        Object v = req.getAttribute("uid");
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return null; }
    }
    private String user(HttpServletRequest req) { return String.valueOf(req.getAttribute("user")); }
    private String role(HttpServletRequest req) { return String.valueOf(req.getAttribute("role")); }
    private String val(Object v) { String s = v == null ? "" : String.valueOf(v); return "null".equals(s) ? "" : s; }
}
