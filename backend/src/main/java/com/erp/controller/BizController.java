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
    @Autowired private ReportMailService reportMail;
    @Autowired private NoRuleService noRule;
    @Autowired private FinanceTemplateService fin;
    @Autowired private ReconciliationService reconciliation;
    @Autowired private FinanceService finance;
    @Autowired private InventoryService inventory;
    @Autowired private ReportService report;
    @Autowired private ProductionService production;
    @Autowired private CreditService credit;
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
        if (!"admin".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
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
        if (!"admin".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
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
            // 合同到期提醒（v5.27）：30 天内到期 + 已过期未完结
            try {
                Map<String,Object> cts = new LinkedHashMap<>();
                cts.put("expiring", db.queryForObject("SELECT COUNT(*) FROM cust_contract_main WHERE status IN ('执行中','草稿') AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)", Long.class));
                cts.put("expired", db.queryForObject("SELECT COUNT(*) FROM cust_contract_main WHERE status='执行中' AND end_date<CURDATE()", Long.class));
                ret.put("expiringContracts", cts);
            } catch (Exception ignored) {}
            // 收款计划逾期提醒（v5.28）
            try {
                ret.put("overduePlans", db.queryForObject("SELECT COUNT(*) FROM cust_contract_payment_plan WHERE due_date<CURDATE() AND status NOT IN ('已收款')", Long.class));
            } catch (Exception ignored) {}
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
            String salesNo;
            try { salesNo = noRule.nextNo("sales"); } catch (Exception e) { salesNo = "SO-Q-" + System.currentTimeMillis(); }
            java.math.BigDecimal qty = new java.math.BigDecimal(String.valueOf(q.getOrDefault("qty", "1")));
            java.math.BigDecimal price = new java.math.BigDecimal(String.valueOf(q.getOrDefault("quote_price", "0")));
            java.math.BigDecimal amount = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
            String customerCode = String.valueOf(q.getOrDefault("customer_code", ""));
            String customerName = String.valueOf(q.getOrDefault("customer_name", ""));
            // 信用前置拦截（v5.25 信用中枢）：报价转订单与新建销售单同一口径
            String creditErr = credit.check(customerCode, amount);
            if (creditErr != null) return Result.error("转单被信用管控拦截：" + creditErr);
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

    /** 整仓账面库存清单（批量盘点的底表） */
    @GetMapping("/stock-check/book-list") public Result stockCheckBookList(@RequestParam String warehouse) {
        try {
            List<Map<String,Object>> rows = db.queryForList(
                "SELECT product_code, product_name, spec_model, qty, unit_cost, total_value, min_stock " +
                "FROM trade_inventory_balance WHERE warehouse=? ORDER BY product_code LIMIT 500", warehouse);
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("账面库存加载失败: " + e.getMessage()); }
    }

    /**
     * 批量盘点差异自动调账（v5.25）：
     * 1) 按仓库拉账面 → 前端录实盘 → 提交差异项；
     * 2) 盘盈自动入库 / 盘亏自动出库（库存真源联动，硬失败回滚）；
     * 3) 整单共用一个盘点单号 PD-xxxx；
     * 4) 可选生成「盘盈亏」会计凭证：盘盈 借1405库存商品/贷1901待处理财产损溢，盘亏反向；凭证进待审核留痕。
     */
    @PostMapping("/stock-check/batch-confirm")
    @Transactional
    @SuppressWarnings("unchecked")
    public Result stockCheckBatch(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"warehouse".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String wh = String.valueOf(body.getOrDefault("warehouse", "默认仓"));
            List<Map<String,Object>> items = (List<Map<String,Object>>) body.get("items");
            boolean makeVoucher = !"false".equalsIgnoreCase(String.valueOf(body.getOrDefault("make_voucher", "true")));
            if (items == null || items.isEmpty()) return Result.error("盘点明细为空");
            if (items.size() > 500) return Result.error("单次批量盘点不能超过 500 项");
            // 前置全量校验（先校验后落库：避免中途报错导致部分调账无法回滚）
            for (Map<String,Object> it : items) {
                String c = String.valueOf(it.getOrDefault("product_code", "")).trim();
                if (c.isEmpty()) continue;
                try {
                    java.math.BigDecimal a = new java.math.BigDecimal(String.valueOf(it.getOrDefault("actual_qty", "0")));
                    if (a.signum() < 0) return Result.error("实盘数量不能为负：" + c);
                } catch (NumberFormatException e) { return Result.error("实盘数量格式无效：" + c); }
            }
            String checkNo;
            try { checkNo = noRule.nextNo("stockcheck"); } catch (Exception e) { checkNo = "PD-" + System.currentTimeMillis(); }
            int diffItems = 0;
            java.math.BigDecimal gainAmt = java.math.BigDecimal.ZERO, lossAmt = java.math.BigDecimal.ZERO;
            for (Map<String,Object> it : items) {
                String code = String.valueOf(it.getOrDefault("product_code", "")).trim();
                if (code.isEmpty()) continue;
                java.math.BigDecimal actual = new java.math.BigDecimal(String.valueOf(it.getOrDefault("actual_qty", "0")));
                List<Map<String,Object>> rows = db.queryForList("SELECT qty, unit_cost, product_name FROM trade_inventory_balance WHERE product_code=? AND warehouse=?", code, wh);
                java.math.BigDecimal system = rows.isEmpty() ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(rows.get(0).get("qty").toString());
                java.math.BigDecimal unitCost = (rows.isEmpty() || rows.get(0).get("unit_cost") == null) ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(rows.get(0).get("unit_cost").toString());
                String pName = rows.isEmpty() ? String.valueOf(it.getOrDefault("product_name", code)) : String.valueOf(rows.get(0).get("product_name"));
                java.math.BigDecimal diff = actual.subtract(system);
                if (diff.signum() == 0) continue;
                // 差异自动调账：盘盈入库 / 盘亏出库（与单笔盘点同一入口，保证批次与流水一致）
                if (diff.signum() > 0) inventory.stockIn(code, pName, "", wh, "", diff, unitCost, checkNo);
                else inventory.stockOut(code, wh, diff.abs(), checkNo);
                java.math.BigDecimal amt = diff.abs().multiply(unitCost).setScale(2, java.math.RoundingMode.HALF_UP);
                if (diff.signum() > 0) gainAmt = gainAmt.add(amt); else lossAmt = lossAmt.add(amt);
                try {
                    db.update("INSERT INTO trade_stock_check(check_no,warehouse,product_code,product_name,check_date,system_qty,actual_qty,diff_qty,diff_amount,checker,status,remark) VALUES(?,?,?,?,CURDATE(),?,?,?,?,?,'已盘点',?)",
                        checkNo, wh, code, pName, system, actual, diff, diff.multiply(unitCost), user(req), String.valueOf(it.getOrDefault("reason", "批量盘点")));
                } catch (Exception ignored) {} // 未执行 upgrade3 补列时不阻断调账
                diffItems++;
            }
            if (diffItems == 0) return Result.error("所有品项账实一致，无需调账");
            // 盘盈亏凭证：盘盈 借1405/贷1901，盘亏 借1901/贷1405（借贷各自平衡，进待审核）
            String voucherNo = null;
            if (makeVoucher && gainAmt.add(lossAmt).signum() > 0) {
                List<Map<String,Object>> lines = new ArrayList<>();
                if (gainAmt.signum() > 0) {
                    lines.add(line("1405", "库存商品", gainAmt, java.math.BigDecimal.ZERO, "盘盈入库-" + checkNo));
                    lines.add(line("1901", "待处理财产损溢", java.math.BigDecimal.ZERO, gainAmt, "盘盈入库-" + checkNo));
                }
                if (lossAmt.signum() > 0) {
                    lines.add(line("1901", "待处理财产损溢", lossAmt, java.math.BigDecimal.ZERO, "盘亏出库-" + checkNo));
                    lines.add(line("1405", "库存商品", java.math.BigDecimal.ZERO, lossAmt, "盘亏出库-" + checkNo));
                }
                Map<String,Object> vz = finance.createVoucher("记", null, lines, user(req), com.erp.config.CompanyContext.get());
                voucherNo = String.valueOf(vz.get("voucher_no"));
            }
            audit.log(user(req), "库存", "批量盘点", checkNo + " " + wh + " 差异项=" + diffItems + " 盘盈¥" + gainAmt + " 盘亏¥" + lossAmt, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("check_no", checkNo);
            ret.put("warehouse", wh);
            ret.put("diff_items", diffItems);
            ret.put("gain_amount", gainAmt);
            ret.put("loss_amount", lossAmt);
            ret.put("voucher_no", voucherNo);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("批量盘点失败: " + e.getMessage()); }
    }

    private Map<String,Object> line(String code, String name, java.math.BigDecimal debit, java.math.BigDecimal credit, String summary) {
        Map<String,Object> l = new LinkedHashMap<>();
        l.put("subject_code", code); l.put("subject_name", name);
        l.put("debit_amount", debit); l.put("credit_amount", credit); l.put("summary", summary);
        return l;
    }

    // ── 客户信用占用查询（下单前可视化校验，v5.25）──
    @GetMapping("/credit-usage/{customerCode}") public Result creditUsage(@PathVariable String customerCode) {
        try { return Result.ok(credit.usage(customerCode)); }
        catch (Exception e) { return Result.error("信用占用查询失败: " + e.getMessage()); }
    }

    // ── 盘点盈亏分析（v5.26）：月度趋势 / 仓库分布 / TOP 差异商品 ──
    @GetMapping("/stocktake-analysis") public Result stocktakeAnalysis() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            List<Map<String,Object>> summary = db.queryForList(
                "SELECT COUNT(*) checks, COUNT(DISTINCT check_no) docs, " +
                "COALESCE(SUM(CASE WHEN diff_qty>0 THEN diff_amount ELSE 0 END),0) gain_amount, " +
                "COALESCE(SUM(CASE WHEN diff_qty<0 THEN -diff_amount ELSE 0 END),0) loss_amount " +
                "FROM trade_stock_check");
            ret.put("summary", summary.isEmpty() ? new LinkedHashMap<>() : summary.get(0));
            ret.put("monthly", db.queryForList(
                "SELECT DATE_FORMAT(check_date,'%Y-%m') month, COUNT(*) cnt, " +
                "COALESCE(SUM(CASE WHEN diff_qty>0 THEN diff_amount ELSE 0 END),0) gain, " +
                "COALESCE(SUM(CASE WHEN diff_qty<0 THEN -diff_amount ELSE 0 END),0) loss " +
                "FROM trade_stock_check GROUP BY DATE_FORMAT(check_date,'%Y-%m') ORDER BY month DESC LIMIT 6"));
            ret.put("byWarehouse", db.queryForList(
                "SELECT warehouse, COUNT(*) cnt, " +
                "COALESCE(SUM(CASE WHEN diff_qty>0 THEN diff_amount ELSE 0 END),0) gain, " +
                "COALESCE(SUM(CASE WHEN diff_qty<0 THEN -diff_amount ELSE 0 END),0) loss " +
                "FROM trade_stock_check GROUP BY warehouse ORDER BY loss DESC, gain DESC LIMIT 10"));
            ret.put("topProducts", db.queryForList(
                "SELECT product_code, MAX(product_name) product_name, COUNT(*) cnt, " +
                "COALESCE(SUM(CASE WHEN diff_qty>0 THEN diff_amount ELSE 0 END),0) gain, " +
                "COALESCE(SUM(CASE WHEN diff_qty<0 THEN -diff_amount ELSE 0 END),0) loss, " +
                "COALESCE(SUM(ABS(diff_amount)),0) total " +
                "FROM trade_stock_check WHERE diff_qty<>0 GROUP BY product_code ORDER BY total DESC LIMIT 8"));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("盘点分析加载失败: " + e.getMessage()); }
    }

    // ── 采购比价（v5.26）：同物料多供应商历史价格对比 + 最优推荐 + 潜在节省 ──
    @GetMapping("/price-compare") public Result priceCompare(@RequestParam(required = false, defaultValue = "") String q) {
        try {
            String where = ""; Object[] params = new Object[0];
            if (q != null && !q.trim().isEmpty()) {
                where = " AND (d.product_code LIKE ? OR d.product_name LIKE ?)";
                params = new Object[]{ "%" + q.trim() + "%", "%" + q.trim() + "%" };
            }
            List<Map<String,Object>> agg = db.queryForList(
                "SELECT d.product_code, MAX(d.product_name) product_name, m.supplier_code, MAX(m.supplier_name) supplier_name, " +
                "COUNT(DISTINCT m.purchase_no) order_cnt, COALESCE(SUM(d.qty),0) total_qty, " +
                "MIN(d.unit_price) min_price, AVG(d.unit_price) avg_price " +
                "FROM trade_purchase_detail d JOIN trade_purchase_main m ON d.purchase_no=m.purchase_no " +
                "WHERE d.unit_price>0" + where + " GROUP BY d.product_code, m.supplier_code ORDER BY d.product_code LIMIT 2000", params);
            List<Map<String,Object>> last = db.queryForList(
                "SELECT t.product_code, m.supplier_code, t.unit_price last_price, m.purchase_date last_date " +
                "FROM trade_purchase_detail t JOIN trade_purchase_main m ON t.purchase_no=m.purchase_no " +
                "JOIN (SELECT d.product_code pc, m2.supplier_code sc, MAX(m2.purchase_date) md " +
                "FROM trade_purchase_detail d JOIN trade_purchase_main m2 ON d.purchase_no=m2.purchase_no " +
                "WHERE d.unit_price>0 GROUP BY d.product_code, m2.supplier_code) x " +
                "ON t.product_code=x.pc AND m.supplier_code=x.sc AND m.purchase_date=x.md");
            Map<String, Map<String,Object>> lastMap = new LinkedHashMap<>();
            for (Map<String,Object> r : last) lastMap.put(r.get("product_code") + "::" + r.get("supplier_code"), r);
            // 按商品分组组装比价行
            Map<String, List<Map<String,Object>>> byProduct = new LinkedHashMap<>();
            for (Map<String,Object> r : agg) {
                Map<String,Object> lp = lastMap.get(r.get("product_code") + "::" + r.get("supplier_code"));
                if (lp != null) { r.put("last_price", lp.get("last_price")); r.put("last_date", String.valueOf(lp.get("last_date")).substring(0, Math.min(10, String.valueOf(lp.get("last_date")).length()))); }
                byProduct.computeIfAbsent(String.valueOf(r.get("product_code")), k -> new ArrayList<>()).add(r);
            }
            List<Map<String,Object>> rows = new ArrayList<>();
            java.math.BigDecimal totalSaving = java.math.BigDecimal.ZERO;
            Set<String> suppliers = new HashSet<>();
            for (Map.Entry<String, List<Map<String,Object>>> e : byProduct.entrySet()) {
                List<Map<String,Object>> sups = e.getValue();
                for (Map<String,Object> s : sups) suppliers.add(String.valueOf(s.get("supplier_code")));
                Map<String,Object> best = null, worst = null;
                for (Map<String,Object> s : sups) {
                    java.math.BigDecimal avg = new java.math.BigDecimal(s.get("avg_price").toString());
                    if (best == null || avg.compareTo(new java.math.BigDecimal(best.get("avg_price").toString())) < 0) best = s;
                    if (worst == null || avg.compareTo(new java.math.BigDecimal(worst.get("avg_price").toString())) > 0) worst = s;
                }
                java.math.BigDecimal saving = java.math.BigDecimal.ZERO;
                if (best != null && worst != null && best != worst) {
                    java.math.BigDecimal diff = new java.math.BigDecimal(worst.get("avg_price").toString()).subtract(new java.math.BigDecimal(best.get("avg_price").toString()));
                    saving = diff.multiply(new java.math.BigDecimal(worst.get("total_qty").toString())).setScale(2, java.math.RoundingMode.HALF_UP);
                    totalSaving = totalSaving.add(saving);
                }
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("product_code", e.getKey());
                row.put("product_name", sups.get(0).get("product_name"));
                row.put("supplier_count", sups.size());
                row.put("best_supplier", best == null ? "" : best.get("supplier_name"));
                row.put("best_avg_price", best == null ? null : best.get("avg_price"));
                row.put("saving", saving);
                row.put("suppliers", sups);
                rows.add(row);
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("products", rows.size());
            totals.put("suppliers", suppliers.size());
            totals.put("saving", totalSaving);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", rows); ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("采购比价加载失败: " + e.getMessage()); }
    }

    // ── 销售提成（v5.26）：目标达成率阶梯计提 → 审批 → 联动工资表 ──
    /** 阶梯提成率：<60%→1.0%，60~80%→1.5%，80~100%→2.0%，≥100%→2.5% 且超额部分加计 1% */
    private java.math.BigDecimal commissionRate(java.math.BigDecimal ratePct) {
        double r = ratePct.doubleValue();
        if (r < 60) return new java.math.BigDecimal("1.0");
        if (r < 80) return new java.math.BigDecimal("1.5");
        if (r < 100) return new java.math.BigDecimal("2.0");
        return new java.math.BigDecimal("2.5");
    }

    @PostMapping("/commission-calc") public Result commissionCalc(@RequestBody(required = false) Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"hr".equals(role(req))) return Result.error("权限不足");
        try {
            String period = body == null || body.get("period") == null || String.valueOf(body.get("period")).trim().isEmpty()
                ? db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m')", String.class)
                : String.valueOf(body.get("period")).trim();
            if (!period.matches("\\d{4}-\\d{2}")) return Result.error("期间格式须为 yyyy-MM");
            Map<String, java.math.BigDecimal> targets = new LinkedHashMap<>();
            for (Map<String,Object> t : db.queryForList("SELECT salesperson, COALESCE(SUM(target_amount),0) target FROM trade_sales_target WHERE target_month=? GROUP BY salesperson", period))
                targets.put(String.valueOf(t.get("salesperson")), new java.math.BigDecimal(t.get("target").toString()));
            Map<String, Map<String,Object>> actuals = new LinkedHashMap<>();
            for (Map<String,Object> a : db.queryForList("SELECT sales_person, COALESCE(SUM(total_amount),0) amt, COUNT(*) cnt FROM trade_sales_main WHERE DATE_FORMAT(sales_date,'%Y-%m')=? GROUP BY sales_person", period))
                actuals.put(String.valueOf(a.get("sales_person")), a);
            Set<String> persons = new LinkedHashSet<>(targets.keySet()); persons.addAll(actuals.keySet());
            if (persons.isEmpty()) return Result.error(period + " 无销售目标也无销售记录，无法计算提成");
            int calc = 0, skipped = 0;
            for (String person : persons) {
                java.math.BigDecimal target = targets.getOrDefault(person, java.math.BigDecimal.ZERO);
                Map<String,Object> a = actuals.get(person);
                java.math.BigDecimal actual = a == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(a.get("amt").toString());
                java.math.BigDecimal rate = target.signum() > 0
                    ? actual.multiply(new java.math.BigDecimal("100")).divide(target, 2, java.math.RoundingMode.HALF_UP)
                    : java.math.BigDecimal.ZERO;
                java.math.BigDecimal pct = commissionRate(rate);
                java.math.BigDecimal commission = actual.multiply(pct).divide(new java.math.BigDecimal("100"), 2, java.math.RoundingMode.HALF_UP);
                String note = "";
                if (rate.compareTo(new java.math.BigDecimal("100")) >= 0 && target.signum() > 0) {
                    java.math.BigDecimal extra = actual.subtract(target).divide(new java.math.BigDecimal("100"), 2, java.math.RoundingMode.HALF_UP);
                    commission = commission.add(extra);
                    note = "达标，超额部分加计1%";
                } else { note = "阶梯率 " + pct + "%"; }
                // 仅覆盖「待审核」行；已审批/已同步的行不被重算污染
                String cno;
                try { cno = noRule.nextNo("commission"); } catch (Exception e2) { cno = "TC-" + System.currentTimeMillis(); }
                int n = db.update("INSERT INTO hr_sales_commission(commission_no,period,salesperson,target_amount,actual_amount,achieve_rate,rate_pct,commission,status,remark) " +
                    "VALUES(?,?,?,?,?,?,?,?, '待审核', ?) " +
                    "ON DUPLICATE KEY UPDATE commission_no=IF(status='待审核',VALUES(commission_no),commission_no), " +
                    "target_amount=IF(status='待审核',VALUES(target_amount),target_amount), " +
                    "actual_amount=IF(status='待审核',VALUES(actual_amount),actual_amount), " +
                    "achieve_rate=IF(status='待审核',VALUES(achieve_rate),achieve_rate), " +
                    "rate_pct=IF(status='待审核',VALUES(rate_pct),rate_pct), " +
                    "commission=IF(status='待审核',VALUES(commission),commission), " +
                    "remark=IF(status='待审核',VALUES(remark),remark)",
                    cno, period, person, target, actual, rate, pct, commission, note);
                if (n >= 2) calc++; else skipped++;
            }
            audit.log(user(req), "提成", "计算提成", period + " 人员=" + persons.size(), audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("period", period); ret.put("persons", persons.size()); ret.put("calc", calc); ret.put("skipped", skipped);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("提成计算失败: " + e.getMessage()); }
    }

    @GetMapping("/commission-list") public Result commissionList(@RequestParam(required = false, defaultValue = "") String period) {
        try {
            String p = period.trim().isEmpty() ? db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m')", String.class) : period.trim();
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("period", p);
            ret.put("rows", db.queryForList("SELECT * FROM hr_sales_commission WHERE period=? ORDER BY commission DESC", p));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("提成列表加载失败: " + e.getMessage()); }
    }

    @PostMapping("/commission-approve/{id}") public Result commissionApprove(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"hr".equals(role(req))) return Result.error("权限不足");
        try {
            int n = db.update("UPDATE hr_sales_commission SET status='已通过' WHERE id=? AND status='待审核'", id);
            if (n == 0) return Result.error("记录不存在或不是「待审核」状态");
            audit.log(user(req), "提成", "审批通过", "id=" + id, audit.getIp(req));
            return Result.ok("已审批通过");
        } catch (Exception e) { return Result.error("审批失败: " + e.getMessage()); }
    }

    /** 提成同步工资表：叠加到当月工资奖金列并重算实发；无工资行则自动生成 */
    @PostMapping("/commission-sync/{id}")
    @Transactional
    public Result commissionSync(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"hr".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM hr_sales_commission WHERE id=?", id);
            if (rows.isEmpty()) return Result.error("提成记录不存在");
            Map<String,Object> c = rows.get(0);
            if (!"已通过".equals(String.valueOf(c.get("status")))) return Result.error("仅「已通过」的提成可同步工资，当前状态：" + c.get("status"));
            String person = String.valueOf(c.get("salesperson"));
            String period = String.valueOf(c.get("period"));
            java.math.BigDecimal amt = new java.math.BigDecimal(c.get("commission").toString());
            List<Map<String,Object>> sal = db.queryForList("SELECT * FROM hr_salary_main WHERE emp_name=? AND salary_month=? LIMIT 1", person, period);
            String salaryNo;
            if (!sal.isEmpty()) {
                Map<String,Object> s = sal.get(0);
                java.math.BigDecimal bonus = bd(s.get("bonus")).add(amt);
                java.math.BigDecimal net = bd(s.get("base_salary")).add(bonus).subtract(bd(s.get("deduction"))).subtract(bd(s.get("insurance"))).subtract(bd(s.get("tax"))).setScale(2, java.math.RoundingMode.HALF_UP);
                db.update("UPDATE hr_salary_main SET bonus=?, net_salary=?, remark=CONCAT(COALESCE(remark,''),' 含销售提成',?) WHERE id=?", bonus, net, String.valueOf(c.get("commission_no")), s.get("id"));
                salaryNo = String.valueOf(s.get("salary_no"));
            } else {
                salaryNo = "SAL-" + period.replace("-", "") + "-" + Math.abs(person.hashCode() % 10000);
                db.update("INSERT INTO hr_salary_main(salary_no,emp_no,emp_name,department,base_salary,bonus,deduction,insurance,tax,net_salary,salary_month,status,remark) VALUES(?,?,?,?,0,?,0,0,0,?,?,'待发放',?)",
                    salaryNo, "", person, "销售部", amt, amt, period, "销售提成自动生成:" + c.get("commission_no"));
            }
            db.update("UPDATE hr_sales_commission SET status='已同步工资', remark=CONCAT(COALESCE(remark,''),' 已同步:',?) WHERE id=?", salaryNo, id);
            audit.log(user(req), "提成", "同步工资", c.get("commission_no") + "→" + salaryNo + " ¥" + amt, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("salary_no", salaryNo); ret.put("commission_no", c.get("commission_no")); ret.put("amount", amt);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("同步工资失败: " + e.getMessage()); }
    }

    private java.math.BigDecimal bd(Object v) {
        if (v == null) return java.math.BigDecimal.ZERO;
        try { return new java.math.BigDecimal(v.toString()); } catch (Exception e) { return java.math.BigDecimal.ZERO; }
    }

    // ── 合同执行跟踪（v5.27）：合同 ↔ 订单 ↔ 收付款 三单关联 + 到期预警 ──
    @GetMapping("/contract-tracking") public Result contractTracking() {
        try {
            List<Map<String,Object>> contracts = db.queryForList("SELECT * FROM cust_contract_main ORDER BY end_date ASC LIMIT 200");
            List<Map<String,Object>> rows = new ArrayList<>();
            java.math.BigDecimal totAmount = java.math.BigDecimal.ZERO, totOrdered = java.math.BigDecimal.ZERO;
            int inProgress = 0, finished = 0, expiring = 0, expired = 0;
            for (Map<String,Object> c : contracts) {
                String no = String.valueOf(c.get("contract_no"));
                String type = String.valueOf(c.getOrDefault("contract_type", ""));
                boolean isSales = type.contains("销售");
                Map<String,Object> row = new LinkedHashMap<>(c);
                List<Map<String,Object>> orders;
                java.math.BigDecimal ordered = java.math.BigDecimal.ZERO, deliveredAmt = java.math.BigDecimal.ZERO, settled = java.math.BigDecimal.ZERO;
                if (isSales) {
                    orders = db.queryForList("SELECT sales_no doc_no, sales_date doc_date, total_amount, sales_status doc_status, shipping_status ship FROM trade_sales_main WHERE contract_no=? ORDER BY sales_date DESC", no);
                    for (Map<String,Object> o : orders) {
                        ordered = ordered.add(bd(o.get("total_amount")));
                        if ("已出库".equals(String.valueOf(o.get("ship")))) deliveredAmt = deliveredAmt.add(bd(o.get("total_amount")));
                    }
                    if (!orders.isEmpty()) {
                        settled = db.queryForObject("SELECT COALESCE(SUM(r.received_amount),0) FROM finance_receivable_main r JOIN trade_sales_main s ON r.remark LIKE CONCAT('%', s.sales_no, '%') WHERE s.contract_no=?", java.math.BigDecimal.class, no);
                        if (settled == null) settled = java.math.BigDecimal.ZERO;
                    }
                } else {
                    orders = db.queryForList("SELECT purchase_no doc_no, purchase_date doc_date, total_amount, purchase_status doc_status, arrival_status ship FROM trade_purchase_main WHERE contract_no=? ORDER BY purchase_date DESC", no);
                    for (Map<String,Object> o : orders) {
                        ordered = ordered.add(bd(o.get("total_amount")));
                        if ("已入库".equals(String.valueOf(o.get("ship")))) deliveredAmt = deliveredAmt.add(bd(o.get("total_amount")));
                    }
                    if (!orders.isEmpty()) {
                        settled = db.queryForObject("SELECT COALESCE(SUM(p.paid_amount),0) FROM finance_payable_main p JOIN trade_purchase_main m ON p.remark LIKE CONCAT('%', m.purchase_no, '%') WHERE m.contract_no=?", java.math.BigDecimal.class, no);
                        if (settled == null) settled = java.math.BigDecimal.ZERO;
                    }
                }
                java.math.BigDecimal amount = bd(c.get("amount"));
                row.put("order_count", orders.size());
                row.put("ordered_amount", ordered);
                row.put("delivered_amount", deliveredAmt);
                row.put("settled_amount", settled);
                row.put("exec_rate", amount.signum() > 0 ? ordered.multiply(new java.math.BigDecimal("100")).divide(amount, 1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
                row.put("settle_rate", ordered.signum() > 0 ? settled.multiply(new java.math.BigDecimal("100")).divide(ordered, 1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
                // 到期状态
                long daysLeft = 0;
                Object endObj = c.get("end_date");
                if (endObj != null) {
                    try {
                        java.time.LocalDate end = java.time.LocalDate.parse(String.valueOf(endObj).substring(0, 10));
                        daysLeft = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(), end);
                    } catch (Exception ignored) {}
                }
                row.put("days_left", daysLeft);
                String cStatus = String.valueOf(c.getOrDefault("status", ""));
                if ("执行中".equals(cStatus)) {
                    inProgress++;
                    if (daysLeft < 0) expired++;
                    else if (daysLeft <= 30) expiring++;
                } else if ("已完结".equals(cStatus)) finished++;
                totAmount = totAmount.add(amount);
                totOrdered = totOrdered.add(ordered);
                row.put("orders", orders);
                rows.add(row);
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("count", rows.size());
            totals.put("amount", totAmount);
            totals.put("ordered", totOrdered);
            totals.put("in_progress", inProgress);
            totals.put("finished", finished);
            totals.put("expiring", expiring);
            totals.put("expired", expired);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", rows); ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("合同跟踪加载失败: " + e.getMessage()); }
    }

    // ── 质量异常闭环 NCR（v5.27）：发起 → 处置 → 复检 → 关闭，联动批次冻结/出库 ──
    @GetMapping("/ncr/list") public Result ncrList() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", db.queryForList("SELECT * FROM quality_ncr ORDER BY id DESC LIMIT 200"));
            ret.put("summary", db.queryForList("SELECT status, COUNT(*) cnt FROM quality_ncr GROUP BY status"));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("质量异常加载失败: " + e.getMessage()); }
    }

    @PostMapping("/ncr/create") public Result ncrCreate(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            String title = String.valueOf(body.getOrDefault("title", "")).trim();
            String source = String.valueOf(body.getOrDefault("source", "过程检验"));
            String productCode = String.valueOf(body.getOrDefault("product_code", "")).trim();
            String batchNo = String.valueOf(body.getOrDefault("batch_no", "")).trim();
            java.math.BigDecimal qty = body.get("qty") == null ? java.math.BigDecimal.ONE : new java.math.BigDecimal(String.valueOf(body.get("qty")));
            String severity = String.valueOf(body.getOrDefault("severity", "一般"));
            if (title.isEmpty() || productCode.isEmpty()) return Result.error("异常标题与商品编码必填");
            if (qty.signum() <= 0) return Result.error("异常数量必须大于 0");
            String pName = "";
            try {
                List<Map<String,Object>> g = db.queryForList("SELECT product_name FROM trade_goods_main WHERE product_code=? LIMIT 1", productCode);
                if (!g.isEmpty()) pName = String.valueOf(g.get(0).get("product_name"));
            } catch (Exception ignored) {}
            String ncrNo;
            try { ncrNo = noRule.nextNo("ncr"); } catch (Exception e) { ncrNo = "NCR-" + System.currentTimeMillis(); }
            boolean freeze = "true".equalsIgnoreCase(String.valueOf(body.getOrDefault("freeze", "false"))) && !batchNo.isEmpty();
            db.update("INSERT INTO quality_ncr(ncr_no,title,source,product_code,product_name,batch_no,qty,severity,status,frozen,reporter,report_date,remark) VALUES(?,?,?,?,?,?,?,?, '待处置', ?,?,CURDATE(),?)",
                ncrNo, title, source, productCode, pName, batchNo, qty, severity, freeze ? "是" : "否", user(req), String.valueOf(body.getOrDefault("remark", "")));
            // 库存冻结：批次状态置「已冻结」，阻断领料/出库
            if (freeze) {
                int n = db.update("UPDATE trade_batch_trace SET status='已冻结' WHERE batch_no=? AND status='在库'", batchNo);
                if (n == 0) return Result.error("异常单已创建（" + ncrNo + "），但批次 " + batchNo + " 不存在或不在库，冻结未生效");
            }
            audit.log(user(req), "质量", "NCR发起", ncrNo + " " + productCode + " ×" + qty + " " + severity + (freeze ? " 已冻结批次" + batchNo : ""), audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("ncr_no", ncrNo); ret.put("frozen", freeze);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("NCR 发起失败: " + e.getMessage()); }
    }

    @PostMapping("/ncr/handle/{id}")
    @Transactional
    public Result ncrHandle(@PathVariable Long id, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req)) && !"warehouse".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM quality_ncr WHERE id=?", id);
            if (rows.isEmpty()) return Result.error("异常单不存在");
            Map<String,Object> n = rows.get(0);
            if (!"待处置".equals(String.valueOf(n.get("status"))) && !"处置中".equals(String.valueOf(n.get("status"))))
                return Result.error("当前状态「" + n.get("status") + "」不可处置");
            String handling = String.valueOf(body.getOrDefault("handling", ""));
            if (!"让步接收".equals(handling) && !"返工".equals(handling) && !"报废".equals(handling) && !"退货".equals(handling))
                return Result.error("处置方式须为：让步接收 / 返工 / 报废 / 退货");
            String note = String.valueOf(body.getOrDefault("handle_note", ""));
            java.math.BigDecimal qty = bd(n.get("qty"));
            // 报废：联动库存出库（硬失败回滚），出库流水可追溯到 NCR 单
            if ("报废".equals(handling) && qty.signum() > 0) {
                inventory.stockOut(String.valueOf(n.get("product_code")), String.valueOf(body.getOrDefault("warehouse", "默认仓")), qty, String.valueOf(n.get("ncr_no")));
            }
            if ("让步接收".equals(handling)) {
                db.update("UPDATE quality_ncr SET status='已关闭', handling=?, handle_note=?, handler=?, recheck_result='让步放行', recheck_note=?, closed_at=NOW() WHERE id=?",
                    handling, note, user(req), "让步接收，免复检直接放行", id);
            } else {
                db.update("UPDATE quality_ncr SET status='待复检', handling=?, handle_note=?, handler=? WHERE id=?", handling, note, user(req), id);
            }
            audit.log(user(req), "质量", "NCR处置", n.get("ncr_no") + " " + handling, audit.getIp(req));
            return Result.ok("让步接收".equals(handling) ? "已让步接收并关闭" : "已处置，等待复检");
        } catch (Exception e) { return Result.error("处置失败: " + e.getMessage()); }
    }

    @PostMapping("/ncr/recheck/{id}")
    @Transactional
    public Result ncrRecheck(@PathVariable Long id, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"production".equals(role(req))) return Result.error("权限不足");
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM quality_ncr WHERE id=?", id);
            if (rows.isEmpty()) return Result.error("异常单不存在");
            Map<String,Object> n = rows.get(0);
            if (!"待复检".equals(String.valueOf(n.get("status")))) return Result.error("当前状态「" + n.get("status") + "」不可复检");
            String result = String.valueOf(body.getOrDefault("result", ""));
            if (!"合格".equals(result) && !"不合格".equals(result)) return Result.error("复检结论须为：合格 / 不合格");
            String note = String.valueOf(body.getOrDefault("recheck_note", ""));
            String batchNo = String.valueOf(n.getOrDefault("batch_no", ""));
            if ("合格".equals(result)) {
                db.update("UPDATE quality_ncr SET status='已关闭', recheck_result=?, recheck_note=?, closed_at=NOW() WHERE id=?", result, note, id);
                if (!batchNo.isEmpty()) db.update("UPDATE trade_batch_trace SET status='在库' WHERE batch_no=? AND status='已冻结'", batchNo); // 复检通过解冻
                audit.log(user(req), "质量", "NCR复检关闭", n.get("ncr_no") + " 合格" + (batchNo.isEmpty() ? "" : " 解冻批次" + batchNo), audit.getIp(req));
                return Result.ok("复检合格，异常单已关闭" + (batchNo.isEmpty() ? "" : "，批次已解冻"));
            } else {
                db.update("UPDATE quality_ncr SET status='处置中', recheck_result=?, recheck_note=? WHERE id=?", result, note, id);
                audit.log(user(req), "质量", "NCR复检驳回", n.get("ncr_no") + " 不合格，回到处置中", audit.getIp(req));
                return Result.ok("复检不合格，异常单回到「处置中」重新处置");
            }
        } catch (Exception e) { return Result.error("复检失败: " + e.getMessage()); }
    }

    // ── 供应商记分卡（v5.28）：交期 40% + 质量 40% + 价格 20%，星级榜单 ──
    @GetMapping("/supplier-scorecard") public Result supplierScorecard() {
        try {
            List<Map<String,Object>> suppliers = db.queryForList("SELECT supplier_code, supplier_name, supplier_type, level FROM supp_supplier_main ORDER BY supplier_code LIMIT 200");
            // 质量合格率（来料检验）
            Map<String, Map<String,Object>> quality = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList("SELECT supplier_name, COALESCE(SUM(sample_qty),0) s, COALESCE(SUM(pass_qty),0) p FROM quality_incoming GROUP BY supplier_name"))
                quality.put(String.valueOf(r.get("supplier_name")), r);
            // 价格竞争力：每个商品各供应商均价，与最低价比较
            List<Map<String,Object>> priceAgg = db.queryForList(
                "SELECT d.product_code, m.supplier_code, AVG(d.unit_price) avgp FROM trade_purchase_detail d " +
                "JOIN trade_purchase_main m ON d.purchase_no=m.purchase_no WHERE d.unit_price>0 GROUP BY d.product_code, m.supplier_code");
            Map<String, java.math.BigDecimal> bestByProduct = new LinkedHashMap<>();
            for (Map<String,Object> r : priceAgg) {
                java.math.BigDecimal avg = bd(r.get("avgp"));
                bestByProduct.merge(String.valueOf(r.get("product_code")), avg, java.math.BigDecimal::min);
            }
            Map<String, List<java.math.BigDecimal>> ratios = new LinkedHashMap<>();
            for (Map<String,Object> r : priceAgg) {
                java.math.BigDecimal best = bestByProduct.get(String.valueOf(r.get("product_code")));
                java.math.BigDecimal avg = bd(r.get("avgp"));
                if (best != null && avg.signum() > 0) {
                    ratios.computeIfAbsent(String.valueOf(r.get("supplier_code")), k -> new ArrayList<>())
                        .add(best.divide(avg, 4, java.math.RoundingMode.HALF_UP));
                }
            }
            List<Map<String,Object>> rows = new ArrayList<>();
            for (Map<String,Object> s : suppliers) {
                String code = String.valueOf(s.get("supplier_code"));
                String name = String.valueOf(s.get("supplier_name"));
                Map<String,Object> row = new LinkedHashMap<>(s);
                Map<String,Object> o = db.queryForList("SELECT COUNT(*) cnt, COALESCE(SUM(total_amount),0) amt, " +
                    "SUM(CASE WHEN arrival_status='全部到货' THEN 1 ELSE 0 END) arrived FROM trade_purchase_main WHERE supplier_code=?", code).get(0);
                long cnt = ((Number) o.get("cnt")).longValue();
                row.put("order_cnt", cnt);
                row.put("order_amount", bd(o.get("amt")));
                java.math.BigDecimal delivery = null, qualityRate = null, priceScore = null;
                if (cnt > 0) delivery = new java.math.BigDecimal(((Number) o.get("arrived")).longValue())
                    .multiply(new java.math.BigDecimal("100")).divide(new java.math.BigDecimal(cnt), 1, java.math.RoundingMode.HALF_UP);
                Map<String,Object> qr = quality.get(name);
                if (qr != null && ((Number) qr.get("s")).longValue() > 0)
                    qualityRate = new java.math.BigDecimal(((Number) qr.get("p")).longValue())
                        .multiply(new java.math.BigDecimal("100")).divide(new java.math.BigDecimal(((Number) qr.get("s")).longValue()), 1, java.math.RoundingMode.HALF_UP);
                List<java.math.BigDecimal> rs = ratios.get(code);
                if (rs != null && !rs.isEmpty()) {
                    java.math.BigDecimal sum = java.math.BigDecimal.ZERO;
                    for (java.math.BigDecimal b : rs) sum = sum.add(b);
                    priceScore = sum.divide(new java.math.BigDecimal(rs.size()), 4, java.math.RoundingMode.HALF_UP)
                        .multiply(new java.math.BigDecimal("100")).setScale(1, java.math.RoundingMode.HALF_UP);
                    if (priceScore.compareTo(new java.math.BigDecimal("100")) > 0) priceScore = new java.math.BigDecimal("100.0");
                }
                // 加权总分（仅对可用维度归一化，避免缺数据被低估）
                double wSum = 0, vSum = 0;
                if (delivery != null) { wSum += 0.4; vSum += 0.4 * delivery.doubleValue(); }
                if (qualityRate != null) { wSum += 0.4; vSum += 0.4 * qualityRate.doubleValue(); }
                if (priceScore != null) { wSum += 0.2; vSum += 0.2 * priceScore.doubleValue(); }
                java.math.BigDecimal total = wSum > 0
                    ? new java.math.BigDecimal(vSum / wSum).setScale(1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO;
                int stars = total.doubleValue() >= 90 ? 5 : total.doubleValue() >= 80 ? 4 : total.doubleValue() >= 70 ? 3 : total.doubleValue() >= 60 ? 2 : 1;
                row.put("delivery_rate", delivery);
                row.put("quality_rate", qualityRate);
                row.put("price_score", priceScore);
                row.put("total_score", cnt == 0 && qualityRate == null && priceScore == null ? null : total);
                row.put("stars", cnt == 0 && qualityRate == null && priceScore == null ? 0 : stars);
                row.put("grade", stars == 5 ? "A" : stars == 4 ? "B" : stars == 3 ? "C" : stars >= 1 ? "D" : "—");
                rows.add(row);
            }
            rows.sort((a, b) -> bd(b.get("total_score")).compareTo(bd(a.get("total_score"))));
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("供应商记分卡加载失败: " + e.getMessage()); }
    }

    // ── 质量成本分析 COQ（v5.28）：报废/检验失败/异常单损失按月与来源聚合 ──
    @GetMapping("/coq-analysis") public Result coqAnalysis() {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            // 单价参照：库存余额单位成本，缺失回退商品采购价
            Map<String, java.math.BigDecimal> costMap = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList("SELECT product_code, AVG(unit_cost) c FROM trade_inventory_balance WHERE unit_cost>0 GROUP BY product_code"))
                costMap.put(String.valueOf(r.get("product_code")), bd(r.get("c")));
            for (Map<String,Object> r : db.queryForList("SELECT product_code, purchase_price c FROM trade_goods_main WHERE purchase_price>0"))
                costMap.putIfAbsent(String.valueOf(r.get("product_code")), bd(r.get("c")));
            // 生产报废损失（按月）
            List<Map<String,Object>> scrap = db.queryForList("SELECT DATE_FORMAT(scrap_date,'%Y-%m') month, product_code, scrap_qty FROM prod_scrap_main WHERE scrap_qty>0");
            // 检验失败损失（按月）
            List<Map<String,Object>> insp = db.queryForList("SELECT DATE_FORMAT(inspection_date,'%Y-%m') month, product_code, (sample_qty-pass_qty) fq FROM quality_inspection_main WHERE sample_qty>pass_qty");
            // NCR 报废损失（按月）
            List<Map<String,Object>> ncrScrap = db.queryForList("SELECT DATE_FORMAT(report_date,'%Y-%m') month, product_code, qty FROM quality_ncr WHERE handling='报废' AND qty>0");
            Map<String, java.math.BigDecimal> monthly = new LinkedHashMap<>();
            java.math.BigDecimal scrapLoss = java.math.BigDecimal.ZERO, inspLoss = java.math.BigDecimal.ZERO, ncrLoss = java.math.BigDecimal.ZERO;
            Map<String, java.math.BigDecimal> byProduct = new LinkedHashMap<>();
            for (List<Map<String,Object>> src : java.util.Arrays.asList(scrap, insp, ncrScrap)) {
                boolean isScrap = src == scrap, isInsp = src == insp;
                for (Map<String,Object> r : src) {
                    String code = String.valueOf(r.get("product_code"));
                    java.math.BigDecimal qty = bd(r.get(isInsp ? "fq" : (isScrap ? "scrap_qty" : "qty")));
                    java.math.BigDecimal unit = costMap.getOrDefault(code, java.math.BigDecimal.ZERO);
                    java.math.BigDecimal loss = qty.multiply(unit).setScale(2, java.math.RoundingMode.HALF_UP);
                    monthly.merge(String.valueOf(r.get("month")), loss, java.math.BigDecimal::add);
                    byProduct.merge(code, loss, java.math.BigDecimal::add);
                    if (isScrap) scrapLoss = scrapLoss.add(loss);
                    else if (isInsp) inspLoss = inspLoss.add(loss);
                    else ncrLoss = ncrLoss.add(loss);
                }
            }
            List<Map<String,Object>> monthlyRows = new ArrayList<>();
            for (Map.Entry<String, java.math.BigDecimal> e : monthly.entrySet()) {
                Map<String,Object> m = new LinkedHashMap<>();
                m.put("month", e.getKey()); m.put("loss", e.getValue());
                monthlyRows.add(m);
            }
            monthlyRows.sort((a, b) -> String.valueOf(a.get("month")).compareTo(String.valueOf(b.get("month"))));
            if (monthlyRows.size() > 8) monthlyRows = monthlyRows.subList(monthlyRows.size() - 8, monthlyRows.size());
            List<Map.Entry<String, java.math.BigDecimal>> top = new ArrayList<>(byProduct.entrySet());
            top.sort((a, b) -> b.getValue().compareTo(a.getValue()));
            List<Map<String,Object>> topRows = new ArrayList<>();
            for (int i = 0; i < Math.min(8, top.size()); i++) {
                Map<String,Object> t = new LinkedHashMap<>();
                t.put("product_code", top.get(i).getKey());
                t.put("loss", top.get(i).getValue());
                topRows.add(t);
            }
            // 报废率：报废数量 / 生产产量
            java.math.BigDecimal scrapQty = db.queryForObject("SELECT COALESCE(SUM(scrap_qty),0) FROM prod_scrap_main", java.math.BigDecimal.class);
            java.math.BigDecimal output = db.queryForObject("SELECT COALESCE(SUM(actual_qty),0) FROM prod_work_order", java.math.BigDecimal.class);
            java.math.BigDecimal sales = db.queryForObject("SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main", java.math.BigDecimal.class);
            java.math.BigDecimal totalLoss = scrapLoss.add(inspLoss).add(ncrLoss);
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("total_loss", totalLoss);
            totals.put("scrap_loss", scrapLoss);
            totals.put("inspection_loss", inspLoss);
            totals.put("ncr_scrap_loss", ncrLoss);
            totals.put("scrap_rate", scrapQty != null && output != null && output.signum() > 0
                ? scrapQty.multiply(new java.math.BigDecimal("100")).divide(output, 2, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
            totals.put("loss_to_sales", sales != null && sales.signum() > 0
                ? totalLoss.multiply(new java.math.BigDecimal("100")).divide(sales, 2, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
            totals.put("ncr_count", db.queryForObject("SELECT COUNT(*) FROM quality_ncr", Long.class));
            totals.put("rework_count", db.queryForObject("SELECT COUNT(*) FROM quality_ncr WHERE handling='返工'", Long.class));
            totals.put("concession_count", db.queryForObject("SELECT COUNT(*) FROM quality_ncr WHERE handling='让步接收'", Long.class));
            ret.put("totals", totals);
            ret.put("monthly", monthlyRows);
            ret.put("topProducts", topRows);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("质量成本分析加载失败: " + e.getMessage()); }
    }

    // ── 合同收款计划（v5.28）：生成/追加/收款，逾期自动进待办 ──
    @GetMapping("/contract-plan/list") public Result contractPlanList(@RequestParam String contract_no) {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("plans", db.queryForList("SELECT * FROM cust_contract_payment_plan WHERE contract_no=? ORDER BY term_no", contract_no));
            ret.put("invoices", db.queryForList("SELECT * FROM cust_contract_invoice WHERE contract_no=? ORDER BY invoice_date DESC, id DESC", contract_no));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("收款计划加载失败: " + e.getMessage()); }
    }

    @PostMapping("/contract-plan/generate")
    @Transactional
    public Result contractPlanGenerate(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String no = String.valueOf(body.getOrDefault("contract_no", "")).trim();
            int terms = body.get("terms") == null ? 3 : Integer.parseInt(String.valueOf(body.get("terms")));
            String firstDate = String.valueOf(body.getOrDefault("first_date", "")).trim();
            if (no.isEmpty() || terms < 1 || terms > 24) return Result.error("合同号必填，期数须为 1~24");
            List<Map<String,Object>> cs = db.queryForList("SELECT amount, party_name, contract_type FROM cust_contract_main WHERE contract_no=?", no);
            if (cs.isEmpty()) return Result.error("合同不存在: " + no);
            if (!String.valueOf(cs.get(0).getOrDefault("contract_type", "")).contains("销售")) return Result.error("收款计划仅支持销售合同");
            Long exists = db.queryForObject("SELECT COUNT(*) FROM cust_contract_payment_plan WHERE contract_no=?", Long.class, no);
            if (exists != null && exists > 0) return Result.error("该合同已有收款计划，请使用「追加期数」");
            java.math.BigDecimal amount = bd(cs.get(0).get("amount"));
            if (amount.signum() <= 0) return Result.error("合同金额无效，无法拆分");
            java.math.BigDecimal per = amount.divide(new java.math.BigDecimal(terms), 2, java.math.RoundingMode.DOWN);
            java.math.BigDecimal allocated = per.multiply(new java.math.BigDecimal(terms - 1));
            String base = firstDate.isEmpty() ? db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d')", String.class) : firstDate;
            for (int i = 1; i <= terms; i++) {
                java.math.BigDecimal amt = i == terms ? amount.subtract(allocated) : per;
                db.update("INSERT INTO cust_contract_payment_plan(contract_no,term_no,due_date,plan_amount,received_amount,status,remark) VALUES(?,?,DATE_ADD(?,INTERVAL ? MONTH),?,0,'未收款',?)",
                    no, i, base, (i - 1) * 3, amt, "自动生成" + terms + "期均摊");
            }
            audit.log(user(req), "合同", "生成收款计划", no + " " + terms + "期 ¥" + amount, audit.getIp(req));
            return Result.ok("已生成 " + terms + " 期收款计划");
        } catch (Exception e) { return Result.error("生成收款计划失败: " + e.getMessage()); }
    }

    @PostMapping("/contract-plan/add") public Result contractPlanAdd(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String no = String.valueOf(body.getOrDefault("contract_no", "")).trim();
            String due = String.valueOf(body.getOrDefault("due_date", "")).trim();
            java.math.BigDecimal amt = body.get("plan_amount") == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf(body.get("plan_amount")));
            if (no.isEmpty() || due.isEmpty() || amt.signum() <= 0) return Result.error("合同号/应收日期/金额必填");
            Integer maxTerm = db.queryForObject("SELECT COALESCE(MAX(term_no),0) FROM cust_contract_payment_plan WHERE contract_no=?", Integer.class, no);
            db.update("INSERT INTO cust_contract_payment_plan(contract_no,term_no,due_date,plan_amount,received_amount,status,remark) VALUES(?,?,?,?,0,'未收款',?)",
                no, (maxTerm == null ? 0 : maxTerm) + 1, due, amt, String.valueOf(body.getOrDefault("remark", "手动追加")));
            audit.log(user(req), "合同", "追加收款期数", no + " 第" + ((maxTerm == null ? 0 : maxTerm) + 1) + "期 ¥" + amt, audit.getIp(req));
            return Result.ok("已追加一期收款计划");
        } catch (Exception e) { return Result.error("追加期数失败: " + e.getMessage()); }
    }

    /** 收款登记：更新计划进度 + 同步生成收款流水（finance_income_main），业财一致 */
    @PostMapping("/contract-plan/collect")
    @Transactional
    public Result contractPlanCollect(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req)) && !"sales".equals(role(req))) return Result.error("权限不足");
        try {
            long id = Long.parseLong(String.valueOf(body.get("id")));
            java.math.BigDecimal amt = body.get("amount") == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf(body.get("amount")));
            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM cust_contract_payment_plan WHERE id=?", id);
            if (rows.isEmpty()) return Result.error("收款计划不存在");
            Map<String,Object> p = rows.get(0);
            java.math.BigDecimal remain = bd(p.get("plan_amount")).subtract(bd(p.get("received_amount")));
            if (amt.signum() <= 0 || amt.compareTo(remain) > 0) return Result.error("收款金额须在 0.01 ~ " + remain + "（本期未收余额）之间");
            java.math.BigDecimal received = bd(p.get("received_amount")).add(amt);
            String status = received.compareTo(bd(p.get("plan_amount"))) >= 0 ? "已收款" : "部分收款";
            db.update("UPDATE cust_contract_payment_plan SET received_amount=?, status=? WHERE id=?", received, status, id);
            // 业财联动：收款流水入账
            String contractNo = String.valueOf(p.get("contract_no"));
            String party = "";
            try { party = String.valueOf(db.queryForList("SELECT party_name FROM cust_contract_main WHERE contract_no=?", contractNo).get(0).get("party_name")); } catch (Exception ignored) {}
            String incomeNo = "RCV-" + System.currentTimeMillis();
            db.update("INSERT INTO finance_income_main(income_no,income_type,customer_code,customer_name,amount,account,income_date,handler,status,remark) VALUES(?,'合同回款',?,?,?, '银行转账',CURDATE(),?,'已到账',?)",
                incomeNo, "", party, amt, user(req), "合同" + contractNo + "第" + p.get("term_no") + "期回款");
            audit.log(user(req), "合同", "收款登记", contractNo + "第" + p.get("term_no") + "期 ¥" + amt, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("status", status); ret.put("income_no", incomeNo);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("收款登记失败: " + e.getMessage()); }
    }

    // ── 合同开票登记（v5.28）──
    @PostMapping("/invoice/create") public Result invoiceCreate(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req)) && !"sales".equals(role(req))) return Result.error("权限不足");
        try {
            String no = String.valueOf(body.getOrDefault("contract_no", "")).trim();
            java.math.BigDecimal amt = body.get("amount") == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf(body.get("amount")));
            if (no.isEmpty() || amt.signum() <= 0) return Result.error("合同号与开票金额必填");
            String invoiceNo;
            try { invoiceNo = noRule.nextNo("invoice"); } catch (Exception e) { invoiceNo = "INV-" + System.currentTimeMillis(); }
            String date = String.valueOf(body.getOrDefault("invoice_date", "")).trim();
            db.update("INSERT INTO cust_contract_invoice(invoice_no,contract_no,invoice_type,invoice_date,amount,tax_rate,status,remark) VALUES(?,?,?,?,?,?,'已开具',?)",
                invoiceNo, no, String.valueOf(body.getOrDefault("invoice_type", "增值税专票")), date.isEmpty() ? new java.sql.Date(System.currentTimeMillis()) : date,
                amt, body.get("tax_rate") == null ? new java.math.BigDecimal("13") : new java.math.BigDecimal(String.valueOf(body.get("tax_rate"))), String.valueOf(body.getOrDefault("remark", "")));
            audit.log(user(req), "合同", "开票登记", invoiceNo + " " + no + " ¥" + amt, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("invoice_no", invoiceNo);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("开票登记失败: " + e.getMessage()); }
    }

    @PostMapping("/invoice/void/{id}") public Result invoiceVoid(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            int n = db.update("UPDATE cust_contract_invoice SET status='已作废' WHERE id=? AND status='已开具'", id);
            if (n == 0) return Result.error("发票不存在或已作废");
            audit.log(user(req), "合同", "发票作废", "id=" + id, audit.getIp(req));
            return Result.ok("发票已作废");
        } catch (Exception e) { return Result.error("作废失败: " + e.getMessage()); }
    }

    // ── 催收管理中心（v5.29）：逾期应收看板 + 催收记录台账 ──
    @GetMapping("/collection/board") public Result collectionBoard() {
        try {
            List<Map<String,Object>> rows = db.queryForList(
                "SELECT r.*, DATEDIFF(CURDATE(), r.due_date) overdue_days_calc, " +
                "(SELECT COUNT(*) FROM finance_collection_record c WHERE c.receivable_no=r.receivable_no) follow_cnt " +
                "FROM finance_receivable_main r WHERE r.remain_amount>0 AND r.due_date<CURDATE() ORDER BY r.due_date ASC LIMIT 300");
            long b30 = 0, b60 = 0, b90 = 0, b90p = 0;
            java.math.BigDecimal a30 = java.math.BigDecimal.ZERO, a60 = java.math.BigDecimal.ZERO, a90 = java.math.BigDecimal.ZERO, a90p = java.math.BigDecimal.ZERO, total = java.math.BigDecimal.ZERO;
            for (Map<String,Object> r : rows) {
                long d = ((Number) r.get("overdue_days_calc")).longValue();
                java.math.BigDecimal amt = bd(r.get("remain_amount"));
                total = total.add(amt);
                if (d <= 30) { b30++; a30 = a30.add(amt); }
                else if (d <= 60) { b60++; a60 = a60.add(amt); }
                else if (d <= 90) { b90++; a90 = a90.add(amt); }
                else { b90p++; a90p = a90p.add(amt); }
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("count", rows.size());
            totals.put("amount", total);
            totals.put("b30", map2("count", b30, "amount", a30));
            totals.put("b60", map2("count", b60, "amount", a60));
            totals.put("b90", map2("count", b90, "amount", a90));
            totals.put("b90p", map2("count", b90p, "amount", a90p));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", rows);
            ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("催收看板加载失败: " + e.getMessage()); }
    }

    private Map<String,Object> map2(String k1, Object v1, String k2, Object v2) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put(k1, v1); m.put(k2, v2);
        return m;
    }

    @PostMapping("/collection/add") public Result collectionAdd(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"sales".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String rcvNo = String.valueOf(body.getOrDefault("receivable_no", "")).trim();
            if (rcvNo.isEmpty()) return Result.error("应收单号必填");
            List<Map<String,Object>> rcv = db.queryForList("SELECT customer_code, customer_name FROM finance_receivable_main WHERE receivable_no=?", rcvNo);
            if (rcv.isEmpty()) return Result.error("应收单不存在: " + rcvNo);
            String result = String.valueOf(body.getOrDefault("result", "需再跟进"));
            if (!"承诺付款".equals(result) && !"需再跟进".equals(result) && !"无回应".equals(result) && !"已回款".equals(result))
                return Result.error("催收结果无效");
            String nextDate = String.valueOf(body.getOrDefault("next_follow_date", "")).trim();
            db.update("INSERT INTO finance_collection_record(receivable_no,customer_code,customer_name,method,contact_person,content,result,next_follow_date,collector,collect_date) VALUES(?,?,?,?,?,?,?,?,?,CURDATE())",
                rcvNo, rcv.get(0).get("customer_code"), rcv.get(0).get("customer_name"),
                String.valueOf(body.getOrDefault("method", "电话")), String.valueOf(body.getOrDefault("contact_person", "")),
                String.valueOf(body.getOrDefault("content", "")), result, nextDate.isEmpty() ? null : nextDate, user(req));
            audit.log(user(req), "催收", "催收记录", rcvNo + " " + body.getOrDefault("method", "电话") + " " + result, audit.getIp(req));
            return Result.ok("催收记录已登记");
        } catch (Exception e) { return Result.error("催收登记失败: " + e.getMessage()); }
    }

    @GetMapping("/collection/records") public Result collectionRecords(@RequestParam String receivable_no) {
        try {
            return Result.ok(db.queryForList("SELECT * FROM finance_collection_record WHERE receivable_no=? ORDER BY id DESC LIMIT 50", receivable_no));
        } catch (Exception e) { return Result.error("催收记录加载失败: " + e.getMessage()); }
    }

    // ── 工单成本分析（v5.29）：领料实际成本 + 人工/制费标准费率 → 工单损益 ──
    @GetMapping("/workorder-cost") public Result workorderCost() {
        try {
            final java.math.BigDecimal LABOR_RATE = new java.math.BigDecimal("15");   // 人工费标准费率（元/件）
            final java.math.BigDecimal OVERHEAD_RATE = new java.math.BigDecimal("8"); // 制造费用标准费率（元/件）
            // 物料成本单价：库存加权均价，缺失回退商品采购价
            Map<String, java.math.BigDecimal> costMap = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList("SELECT product_code, AVG(unit_cost) c FROM trade_inventory_balance WHERE unit_cost>0 GROUP BY product_code"))
                costMap.put(String.valueOf(r.get("product_code")), bd(r.get("c")));
            Map<String, java.math.BigDecimal> priceMap = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList("SELECT product_code, purchase_price, sale_price FROM trade_goods_main")) {
                String c = String.valueOf(r.get("product_code"));
                if (!costMap.containsKey(c)) costMap.put(c, bd(r.get("purchase_price")));
                priceMap.put(c, bd(r.get("sale_price")));
            }
            List<Map<String,Object>> wos = db.queryForList("SELECT work_order_no, product_code, product_name, plan_qty, actual_qty, order_status FROM prod_work_order ORDER BY id DESC LIMIT 60");
            // 领料聚合：按计划领料与实际领料分别计算金额
            Map<String, java.math.BigDecimal[]> reqMap = new LinkedHashMap<>(); // [planCost, actualCost]
            for (Map<String,Object> r : db.queryForList("SELECT ref_work_order, product_code, COALESCE(SUM(plan_req_qty),0) pq, COALESCE(SUM(actual_req_qty),0) aq FROM prod_material_requisition GROUP BY ref_work_order, product_code")) {
                java.math.BigDecimal unit = costMap.getOrDefault(String.valueOf(r.get("product_code")), java.math.BigDecimal.ZERO);
                java.math.BigDecimal[] v = reqMap.computeIfAbsent(String.valueOf(r.get("ref_work_order")), k -> new java.math.BigDecimal[]{ java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO });
                v[0] = v[0].add(bd(r.get("pq")).multiply(unit));
                v[1] = v[1].add(bd(r.get("aq")).multiply(unit));
            }
            List<Map<String,Object>> rows = new ArrayList<>();
            java.math.BigDecimal totCost = java.math.BigDecimal.ZERO, totRevenue = java.math.BigDecimal.ZERO;
            int profitCnt = 0;
            for (Map<String,Object> w : wos) {
                String no = String.valueOf(w.get("work_order_no"));
                java.math.BigDecimal actualQty = bd(w.get("actual_qty"));
                java.math.BigDecimal[] req = reqMap.getOrDefault(no, new java.math.BigDecimal[]{ java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO });
                java.math.BigDecimal materialCost = req[1].setScale(2, java.math.RoundingMode.HALF_UP);
                java.math.BigDecimal laborCost = actualQty.multiply(LABOR_RATE).setScale(2, java.math.RoundingMode.HALF_UP);
                java.math.BigDecimal overheadCost = actualQty.multiply(OVERHEAD_RATE).setScale(2, java.math.RoundingMode.HALF_UP);
                java.math.BigDecimal totalCost = materialCost.add(laborCost).add(overheadCost);
                java.math.BigDecimal estRevenue = actualQty.multiply(priceMap.getOrDefault(String.valueOf(w.get("product_code")), java.math.BigDecimal.ZERO)).setScale(2, java.math.RoundingMode.HALF_UP);
                java.math.BigDecimal profit = estRevenue.subtract(totalCost);
                java.math.BigDecimal unitCost = actualQty.signum() > 0 ? totalCost.divide(actualQty, 2, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO;
                Map<String,Object> row = new LinkedHashMap<>(w);
                row.put("material_cost", materialCost);
                row.put("plan_material_cost", req[0].setScale(2, java.math.RoundingMode.HALF_UP));
                row.put("labor_cost", laborCost);
                row.put("overhead_cost", overheadCost);
                row.put("total_cost", totalCost);
                row.put("est_revenue", estRevenue);
                row.put("profit", profit);
                row.put("unit_cost", unitCost);
                totCost = totCost.add(totalCost);
                totRevenue = totRevenue.add(estRevenue);
                if (actualQty.signum() > 0 && profit.signum() > 0) profitCnt++;
                rows.add(row);
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("count", rows.size());
            totals.put("cost", totCost);
            totals.put("revenue", totRevenue);
            totals.put("profit", totRevenue.subtract(totCost));
            totals.put("profit_cnt", profitCnt);
            totals.put("labor_rate", LABOR_RATE);
            totals.put("overhead_rate", OVERHEAD_RATE);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", rows); ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("工单成本分析加载失败: " + e.getMessage()); }
    }

    // ── 经营预测（v5.29）：近 9 月销售 → 加权均值+线性趋势 → 下月预测 vs 目标 ──
    @GetMapping("/sales-forecast") public Result salesForecast() {
        try {
            List<Map<String,Object>> hist = db.queryForList(
                "SELECT DATE_FORMAT(sales_date,'%Y-%m') month, COALESCE(SUM(total_amount),0) amt FROM trade_sales_main GROUP BY DATE_FORMAT(sales_date,'%Y-%m') ORDER BY month DESC LIMIT 9");
            java.util.Collections.reverse(hist); // 升序
            List<Map<String,Object>> history = new ArrayList<>();
            int n = hist.size();
            double[] ys = new double[n];
            for (int i = 0; i < n; i++) {
                ys[i] = bd(hist.get(i).get("amt")).doubleValue();
                Map<String,Object> h = new LinkedHashMap<>();
                h.put("month", hist.get(i).get("month"));
                h.put("amount", bd(hist.get(i).get("amt")));
                history.add(h);
            }
            // 加权移动均值（近3月权重 1/2/3）
            double weighted = 0;
            if (n >= 3) weighted = (ys[n - 3] * 1 + ys[n - 2] * 2 + ys[n - 1] * 3) / 6.0;
            else if (n > 0) { double s = 0; for (double y : ys) s += y; weighted = s / n; }
            // 线性回归趋势外推
            double trendNext = weighted;
            if (n >= 4) {
                double sx = 0, sy = 0, sxx = 0, sxy = 0;
                for (int i = 0; i < n; i++) { sx += i; sy += ys[i]; sxx += (double) i * i; sxy += i * ys[i]; }
                double denom = n * sxx - sx * sx;
                double slope = denom == 0 ? 0 : (n * sxy - sx * sy) / denom;
                double intercept = (sy - slope * sx) / n;
                trendNext = intercept + slope * n;
            }
            double blended = Math.max(0, 0.5 * weighted + 0.5 * trendNext);
            // 下个月与目标
            String nextMonth = db.queryForObject("SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH),'%Y-%m')", String.class);
            java.math.BigDecimal target = db.queryForObject("SELECT COALESCE(SUM(target_amount),0) FROM trade_sales_target WHERE target_month=?", java.math.BigDecimal.class, nextMonth);
            if (target == null) target = java.math.BigDecimal.ZERO;
            java.math.BigDecimal forecast = new java.math.BigDecimal(blended).setScale(2, java.math.RoundingMode.HALF_UP);
            java.math.BigDecimal rate = target.signum() > 0
                ? forecast.multiply(new java.math.BigDecimal("100")).divide(target, 1, java.math.RoundingMode.HALF_UP)
                : java.math.BigDecimal.ZERO;
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("history", history);
            ret.put("next_month", nextMonth);
            ret.put("forecast", forecast);
            ret.put("weighted", new java.math.BigDecimal(weighted).setScale(2, java.math.RoundingMode.HALF_UP));
            ret.put("trend", new java.math.BigDecimal(trendNext).setScale(2, java.math.RoundingMode.HALF_UP));
            ret.put("target", target);
            ret.put("rate", rate);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("销售预测加载失败: " + e.getMessage()); }
    }

    // ── 客户 360 视图（v5.30）：档案 + 信用 + 订单 + 应收 + 合同 + 催收 一屏聚合 ──
    @GetMapping("/customer-360/{code}") public Result customer360(@PathVariable String code) {
        try {
            Map<String,Object> ret = new LinkedHashMap<>();
            List<Map<String,Object>> cust = db.queryForList("SELECT * FROM cust_customer_main WHERE customer_code=?", code);
            if (cust.isEmpty()) return Result.error("客户不存在: " + code);
            ret.put("customer", cust.get(0));
            ret.put("credit", credit.usage(code));
            String name = String.valueOf(cust.get(0).getOrDefault("customer_name", ""));
            ret.put("orders", db.queryForList("SELECT sales_no, sales_date, total_amount, sales_status, shipping_status, sales_person, contract_no FROM trade_sales_main WHERE customer_code=? ORDER BY sales_date DESC LIMIT 30", code));
            ret.put("orderStats", db.queryForList("SELECT COUNT(*) cnt, COALESCE(SUM(total_amount),0) amount FROM trade_sales_main WHERE customer_code=?", code).get(0));
            ret.put("receivables", db.queryForList("SELECT receivable_no, total_amount, received_amount, remain_amount, due_date, status FROM finance_receivable_main WHERE customer_code=? AND remain_amount>0 ORDER BY due_date ASC LIMIT 20", code));
            ret.put("receivableStats", db.queryForList("SELECT COUNT(*) cnt, COALESCE(SUM(remain_amount),0) remain FROM finance_receivable_main WHERE customer_code=? AND remain_amount>0", code).get(0));
            try { ret.put("contracts", db.queryForList("SELECT contract_no, contract_name, contract_type, amount, end_date, status FROM cust_contract_main WHERE party_name=? ORDER BY end_date DESC LIMIT 10", name)); }
            catch (Exception e) { ret.put("contracts", new ArrayList<>()); }
            try { ret.put("collections", db.queryForList("SELECT method, result, content, collector, collect_date, next_follow_date FROM finance_collection_record WHERE customer_code=? ORDER BY id DESC LIMIT 20", code)); }
            catch (Exception e) { ret.put("collections", new ArrayList<>()); }
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("客户 360 加载失败: " + e.getMessage()); }
    }

    // ── 生产排程看板（v5.30）：工单排程条 + 逾期预警 + 车间负载 ──
    @GetMapping("/production-schedule") public Result productionSchedule() {
        try {
            List<Map<String,Object>> wos = db.queryForList(
                "SELECT work_order_no, product_code, product_name, plan_qty, actual_qty, complete_qty, workshop, leader, " +
                "start_date, plan_end_date, order_status, priority FROM prod_work_order ORDER BY start_date DESC LIMIT 100");
            java.time.LocalDate today = java.time.LocalDate.now();
            java.time.LocalDate min = null, max = null;
            int inProgress = 0, overdue = 0, finished = 0;
            Map<String, Map<String,Object>> workshops = new LinkedHashMap<>();
            for (Map<String,Object> w : wos) {
                java.time.LocalDate s = null, e = null;
                try { s = java.time.LocalDate.parse(String.valueOf(w.get("start_date")).substring(0, 10)); } catch (Exception ignored) {}
                try { e = java.time.LocalDate.parse(String.valueOf(w.get("plan_end_date")).substring(0, 10)); } catch (Exception ignored) {}
                String status = String.valueOf(w.getOrDefault("order_status", ""));
                long overdueDays = 0;
                if (e != null && !"已完成".equals(status) && e.isBefore(today)) { overdueDays = java.time.temporal.ChronoUnit.DAYS.between(e, today); overdue++; }
                if ("已完成".equals(status)) finished++;
                else if ("进行中".equals(status) || "待排产".equals(status) || "已下达".equals(status)) inProgress++;
                java.math.BigDecimal plan = bd(w.get("plan_qty")), act = bd(w.get("actual_qty"));
                w.put("progress", plan.signum() > 0 ? act.multiply(new java.math.BigDecimal("100")).divide(plan, 1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
                w.put("overdue_days", overdueDays);
                if (s != null && (min == null || s.isBefore(min))) min = s;
                java.time.LocalDate endRef = e != null ? e : (s != null ? s.plusDays(7) : today);
                if (max == null || endRef.isAfter(max)) max = endRef;
                // 车间负载
                String shop = String.valueOf(w.getOrDefault("workshop", "未指派"));
                Map<String,Object> load = workshops.computeIfAbsent(shop, k -> {
                    Map<String,Object> m = new LinkedHashMap<>();
                    m.put("workshop", k); m.put("active_orders", 0L); m.put("active_qty", java.math.BigDecimal.ZERO); m.put("overdue_orders", 0L);
                    return m;
                });
                if (!"已完成".equals(status)) {
                    load.put("active_orders", ((Number) load.get("active_orders")).longValue() + 1);
                    load.put("active_qty", bd(load.get("active_qty")).add(plan));
                    if (overdueDays > 0) load.put("overdue_orders", ((Number) load.get("overdue_orders")).longValue() + 1);
                }
            }
            if (min == null) min = today.minusDays(30);
            if (max == null || !max.isAfter(min)) max = min.plusDays(30);
            if (today.plusDays(7).isAfter(max)) max = today.plusDays(7);
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("count", wos.size());
            totals.put("in_progress", inProgress);
            totals.put("overdue", overdue);
            totals.put("finished", finished);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", wos);
            ret.put("totals", totals);
            ret.put("range_start", min.toString());
            ret.put("range_end", max.toString());
            ret.put("today", today.toString());
            ret.put("workshops", new ArrayList<>(workshops.values()));
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("生产排程加载失败: " + e.getMessage()); }
    }

    // ── 部门预算编制与执行看板（v5.30）──
    @GetMapping("/budget-dashboard") public Result budgetDashboard(@RequestParam(required = false, defaultValue = "") String month) {
        try {
            String m = month.trim().isEmpty() ? db.queryForObject("SELECT DATE_FORMAT(CURDATE(),'%Y-%m')", String.class) : month.trim();
            if (!m.matches("\\d{4}-\\d{2}")) return Result.error("月份格式须为 yyyy-MM");
            List<Map<String,Object>> budgets = db.queryForList("SELECT department, budget_amount, remark FROM oa_budget WHERE budget_month=? ORDER BY budget_amount DESC", m);
            List<Map<String,Object>> spent = db.queryForList(
                "SELECT department, COALESCE(SUM(amount),0) used FROM oa_approval_main WHERE approval_type='费用审批' " +
                "AND approval_status IN ('待审批','已通过') AND DATE_FORMAT(submit_date,'%Y-%m')=? GROUP BY department", m);
            Map<String, java.math.BigDecimal> usedMap = new LinkedHashMap<>();
            for (Map<String,Object> s : spent) usedMap.put(String.valueOf(s.get("department")), bd(s.get("used")));
            List<Map<String,Object>> rows = new ArrayList<>();
            java.math.BigDecimal totBudget = java.math.BigDecimal.ZERO, totUsed = java.math.BigDecimal.ZERO;
            int overCnt = 0;
            for (Map<String,Object> b : budgets) {
                String dept = String.valueOf(b.get("department"));
                java.math.BigDecimal budget = bd(b.get("budget_amount"));
                java.math.BigDecimal used = usedMap.getOrDefault(dept, java.math.BigDecimal.ZERO);
                java.math.BigDecimal rate = budget.signum() > 0
                    ? used.multiply(new java.math.BigDecimal("100")).divide(budget, 1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO;
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("department", dept);
                row.put("budget", budget);
                row.put("used", used);
                row.put("available", budget.subtract(used));
                row.put("rate", rate);
                row.put("remark", b.get("remark"));
                if (rate.compareTo(new java.math.BigDecimal("100")) > 0) overCnt++;
                totBudget = totBudget.add(budget);
                totUsed = totUsed.add(used);
                rows.add(row);
            }
            Map<String,Object> totals = new LinkedHashMap<>();
            totals.put("month", m);
            totals.put("budget", totBudget);
            totals.put("used", totUsed);
            totals.put("rate", totBudget.signum() > 0 ? totUsed.multiply(new java.math.BigDecimal("100")).divide(totBudget, 1, java.math.RoundingMode.HALF_UP) : java.math.BigDecimal.ZERO);
            totals.put("over_count", overCnt);
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("rows", rows); ret.put("totals", totals);
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("预算看板加载失败: " + e.getMessage()); }
    }

    @PostMapping("/budget-set") public Result budgetSet(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req)) && !"hr".equals(role(req))) return Result.error("权限不足");
        try {
            String dept = String.valueOf(body.getOrDefault("department", "")).trim();
            String m = String.valueOf(body.getOrDefault("budget_month", "")).trim();
            java.math.BigDecimal amt = body.get("budget_amount") == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf(body.get("budget_amount")));
            if (dept.isEmpty() || !m.matches("\\d{4}-\\d{2}") || amt.signum() <= 0) return Result.error("部门/月份/预算金额必填（金额须大于 0）");
            db.update("INSERT INTO oa_budget(department,budget_month,budget_amount,remark) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE budget_amount=VALUES(budget_amount), remark=VALUES(remark)",
                dept, m, amt, String.valueOf(body.getOrDefault("remark", "预算编制")));
            audit.log(user(req), "预算", "编制预算", dept + " " + m + " ¥" + amt, audit.getIp(req));
            return Result.ok("预算已保存");
        } catch (Exception e) { return Result.error("预算编制失败: " + e.getMessage()); }
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

    // ── 回收站批量恢复 ──
    @PostMapping("/restore-batch")
    @SuppressWarnings("unchecked")
    public Result restoreBatch(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        Object idsObj = body.get("ids");
        if (!(idsObj instanceof List) || ((List<?>) idsObj).isEmpty()) return Result.error("请选择要恢复的记录");
        int ok = 0, fail = 0;
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        for (Object idObj : (List<?>) idsObj) {
            long bid;
            try { bid = Long.parseLong(String.valueOf(idObj)); } catch (Exception e) { fail++; continue; }
            try {
                List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_deleted_backup WHERE id=?", bid);
                if (rows.isEmpty()) { fail++; continue; }
                String table = String.valueOf(rows.get(0).get("table_name"));
                if (!table.matches("^[a-z][a-z0-9_]{2,60}$")) { fail++; continue; }
                Map<String,Object> data = om.readValue(String.valueOf(rows.get(0).get("row_data")), Map.class);
                data.remove("id");
                if (data.isEmpty()) { fail++; continue; }
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
                db.update("DELETE FROM sys_deleted_backup WHERE id=?", bid);
                ok++;
            } catch (Exception e) { fail++; }
        }
        audit.log(user(req), "系统", "回收站批量恢复", "成功" + ok + "/失败" + fail, audit.getIp(req));
        Map<String,Object> ret = new LinkedHashMap<>();
        ret.put("ok", ok);
        ret.put("fail", fail);
        return Result.ok(ret);
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
                String poNo;
                try { poNo = noRule.nextNo("purchase"); } catch (Exception e) { poNo = "PO-SUG-" + System.currentTimeMillis() + "-" + (poNos.size() + 1); }
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
            // ABC 分析（v5.30）：按库存金额降序累计占比 → A(≤70%)/B(≤90%)/C
            try {
                List<Map<String,Object>> items = db.queryForList(
                    "SELECT product_code, MAX(product_name) product_name, SUM(qty) qty, SUM(total_value) value " +
                    "FROM trade_inventory_balance WHERE total_value>0 GROUP BY product_code ORDER BY value DESC LIMIT 500");
                java.math.BigDecimal totalValue = java.math.BigDecimal.ZERO;
                for (Map<String,Object> it : items) totalValue = totalValue.add(bd(it.get("value")));
                java.math.BigDecimal cum = java.math.BigDecimal.ZERO;
                long aCnt = 0, bCnt = 0, cCnt = 0;
                java.math.BigDecimal aVal = java.math.BigDecimal.ZERO, bVal = java.math.BigDecimal.ZERO, cVal = java.math.BigDecimal.ZERO;
                List<Map<String,Object>> abcItems = new ArrayList<>();
                for (Map<String,Object> it : items) {
                    java.math.BigDecimal val = bd(it.get("value"));
                    cum = cum.add(val);
                    double pct = totalValue.signum() > 0 ? cum.divide(totalValue, 4, java.math.RoundingMode.HALF_UP).doubleValue() * 100 : 100;
                    String cls = pct <= 70 ? "A" : pct <= 90 ? "B" : "C";
                    if ("A".equals(cls)) { aCnt++; aVal = aVal.add(val); }
                    else if ("B".equals(cls)) { bCnt++; bVal = bVal.add(val); }
                    else { cCnt++; cVal = cVal.add(val); }
                    if (abcItems.size() < 30) {
                        Map<String,Object> r = new LinkedHashMap<>(it);
                        r.put("class", cls);
                        r.put("cum_pct", new java.math.BigDecimal(pct).setScale(1, java.math.RoundingMode.HALF_UP));
                        abcItems.add(r);
                    }
                }
                Map<String,Object> abc = new LinkedHashMap<>();
                abc.put("items", abcItems);
                List<Map<String,Object>> classes = new ArrayList<>();
                String[] clsNames = { "A", "B", "C" };
                long[] clsCnt = { aCnt, bCnt, cCnt };
                java.math.BigDecimal[] clsVal = { aVal, bVal, cVal };
                for (int i = 0; i < 3; i++) {
                    Map<String,Object> cm = new LinkedHashMap<>();
                    cm.put("class", clsNames[i]); cm.put("count", clsCnt[i]); cm.put("value", clsVal[i]);
                    classes.add(cm);
                }
                abc.put("classes", classes);
                abc.put("total_value", totalValue);
                ret.put("abc", abc);
            } catch (Exception e) { ret.put("abc", null); }
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

    // ── 附件管理：任意业务单据挂载附件（上传/列表/下载/删除） ──
    @PostMapping("/attachment/upload")
    public Result attachmentUpload(@RequestParam("file") MultipartFile file,
                                   @RequestParam("ref_table") String refTable,
                                   @RequestParam("ref_no") String refNo,
                                   HttpServletRequest req) {
        if (file == null || file.isEmpty()) return Result.error("请选择文件");
        if (!refTable.matches("^[a-z][a-z0-9_]{2,60}$")) return Result.error("无效业务表名");
        if (file.getSize() > 5 * 1024 * 1024) return Result.error("附件不能超过 5MB");
        String name = file.getOriginalFilename() == null ? "attachment" : file.getOriginalFilename();
        if (name.length() > 200) name = name.substring(name.length() - 200);
        try {
            db.update("INSERT INTO sys_attachment(ref_table,ref_no,file_name,file_type,file_size,file_data,uploaded_by) VALUES(?,?,?,?,?,?,?)",
                refTable, refNo, name, file.getContentType(), file.getSize(), file.getBytes(), user(req));
            audit.log(user(req), "附件", "上传附件", refTable + "/" + refNo + " " + name, audit.getIp(req));
            Map<String,Object> ret = new LinkedHashMap<>();
            ret.put("file_name", name);
            ret.put("file_size", file.getSize());
            return Result.ok(ret);
        } catch (Exception e) { return Result.error("上传失败: " + e.getMessage()); }
    }

    @GetMapping("/attachment/list")
    public Result attachmentList(@RequestParam("ref_table") String refTable, @RequestParam("ref_no") String refNo) {
        try {
            List<Map<String,Object>> rows = db.queryForList(
                "SELECT id, ref_table, ref_no, file_name, file_type, file_size, uploaded_by, created_at FROM sys_attachment WHERE ref_table=? AND ref_no=? ORDER BY id DESC", refTable, refNo);
            return Result.ok(rows);
        } catch (Exception e) { return Result.error("附件列表加载失败: " + e.getMessage()); }
    }

    @GetMapping("/attachment/download/{id}")
    public ResponseEntity<byte[]> attachmentDownload(@PathVariable Long id, HttpServletRequest req) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT file_name, file_type, file_data FROM sys_attachment WHERE id=?", id);
            if (rows.isEmpty()) return ResponseEntity.status(404).build();
            Map<String,Object> r = rows.get(0);
            byte[] data = (byte[]) r.get("file_data");
            if (data == null) data = new byte[0];
            String filename = java.net.URLEncoder.encode(String.valueOf(r.get("file_name")), "UTF-8").replace("+", "%20");
            String type = r.get("file_type") == null ? "application/octet-stream" : String.valueOf(r.get("file_type"));
            audit.log(user(req), "附件", "下载附件", "id=" + id, audit.getIp(req));
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + filename)
                .contentType(MediaType.parseMediaType(type.startsWith("application/") || type.startsWith("image/") || type.startsWith("text/") ? type : "application/octet-stream"))
                .body(data);
        } catch (Exception e) { return ResponseEntity.status(500).build(); }
    }

    @DeleteMapping("/attachment/{id}")
    public Result attachmentDelete(@PathVariable Long id, HttpServletRequest req) {
        try {
            int n = db.update("DELETE FROM sys_attachment WHERE id=?", id);
            if (n > 0) audit.log(user(req), "附件", "删除附件", "id=" + id, audit.getIp(req));
            return n > 0 ? Result.ok("已删除") : Result.error("附件不存在");
        } catch (Exception e) { return Result.error("删除失败: " + e.getMessage()); }
    }

    // ── 消息已读状态（按用户持久化） ──
    @PostMapping("/message/read")
    public Result messageRead(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        try {
            String key = String.valueOf(body.getOrDefault("msg_key", ""));
            if (key.isEmpty()) return Result.error("消息标识不能为空");
            db.update("INSERT INTO sys_message_state(msg_key,username,state) VALUES(?,?,'read') ON DUPLICATE KEY UPDATE state='read'", key, user(req));
            return Result.ok("ok");
        } catch (Exception e) { return Result.error("标记失败: " + e.getMessage()); }
    }

    @GetMapping("/message/read-list")
    public Result messageReadList(HttpServletRequest req) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT msg_key FROM sys_message_state WHERE username=? AND state='read'", user(req));
            List<String> keys = new ArrayList<>();
            for (Map<String,Object> r : rows) keys.add(String.valueOf(r.get("msg_key")));
            return Result.ok(keys);
        } catch (Exception e) { return Result.ok(new ArrayList<>()); }
    }

    // ── 报表邮件订阅管理 ──
    @GetMapping("/report-subscription")
    public Result reportSubList(HttpServletRequest req) {
        try { return Result.ok(db.queryForList("SELECT * FROM sys_report_subscription WHERE username=? ORDER BY id DESC", user(req))); }
        catch (Exception e) { return Result.error("订阅列表加载失败: " + e.getMessage()); }
    }

    @PostMapping("/report-subscription")
    public Result reportSubSave(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        try {
            String email = String.valueOf(body.getOrDefault("email", "")).trim();
            String type = String.valueOf(body.getOrDefault("report_type", "daily"));
            String freq = String.valueOf(body.getOrDefault("frequency", "daily"));
            if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) return Result.error("邮箱格式不正确");
            if (!"daily".equals(type) && !"weekly".equals(type) && !"finance".equals(type)) return Result.error("报表类型无效");
            db.update("INSERT INTO sys_report_subscription(username,email,report_type,frequency,enabled) VALUES(?,?,?,?,1) ON DUPLICATE KEY UPDATE email=VALUES(email), frequency=VALUES(frequency), enabled=1",
                user(req), email, type, freq);
            audit.log(user(req), "报表", "订阅报表", type + "->" + email, audit.getIp(req));
            return Result.ok("订阅成功");
        } catch (Exception e) { return Result.error("订阅失败: " + e.getMessage()); }
    }

    @PostMapping("/report-subscription/toggle/{id}")
    public Result reportSubToggle(@PathVariable Long id, HttpServletRequest req) {
        try {
            int n = db.update("UPDATE sys_report_subscription SET enabled=1-enabled WHERE id=? AND username=?", id, user(req));
            return n > 0 ? Result.ok("ok") : Result.error("订阅不存在");
        } catch (Exception e) { return Result.error("操作失败: " + e.getMessage()); }
    }

    @DeleteMapping("/report-subscription/{id}")
    public Result reportSubDelete(@PathVariable Long id, HttpServletRequest req) {
        try {
            int n = db.update("DELETE FROM sys_report_subscription WHERE id=? AND username=?", id, user(req));
            return n > 0 ? Result.ok("已退订") : Result.error("订阅不存在");
        } catch (Exception e) { return Result.error("退订失败: " + e.getMessage()); }
    }

    @GetMapping("/report-outbox")
    public Result reportOutbox(HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(db.queryForList("SELECT id,subscription_id,email,subject,status,error_msg,created_at,sent_at FROM sys_report_outbox ORDER BY id DESC LIMIT 50")); }
        catch (Exception e) { return Result.error("发件箱加载失败: " + e.getMessage()); }
    }

    @PostMapping("/report-outbox/send/{id}")
    public Result reportOutboxSend(@PathVariable Long id, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String msg = reportMail.sendOutbox(id);
            return Result.ok(msg);
        } catch (Exception e) { return Result.error("发送失败: " + e.getMessage()); }
    }

    // ── 打印模板自定义 ──
    @GetMapping("/print-template/{key}")
    public Result printTemplateGet(@PathVariable String key) {
        try {
            List<Map<String,Object>> rows = db.queryForList("SELECT template_key,title,company_line,footer,fields_json,updated_by,updated_at FROM sys_print_template WHERE template_key=?", key);
            if (rows.isEmpty()) return Result.ok(null);
            return Result.ok(rows.get(0));
        } catch (Exception e) { return Result.ok(null); }
    }

    @PostMapping("/print-template/{key}")
    public Result printTemplateSave(@PathVariable String key, @RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req)) && !"accounting".equals(role(req))) return Result.error("权限不足");
        try {
            String title = String.valueOf(body.getOrDefault("title", ""));
            String companyLine = String.valueOf(body.getOrDefault("company_line", ""));
            String footer = String.valueOf(body.getOrDefault("footer", ""));
            String fieldsJson = body.get("fields") == null ? "[]" : new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body.get("fields"));
            db.update("INSERT INTO sys_print_template(template_key,title,company_line,footer,fields_json,updated_by) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),company_line=VALUES(company_line),footer=VALUES(footer),fields_json=VALUES(fields_json),updated_by=VALUES(updated_by)",
                key, title, companyLine, footer, fieldsJson, user(req));
            audit.log(user(req), "打印", "保存打印模板", key, audit.getIp(req));
            return Result.ok("模板已保存");
        } catch (Exception e) { return Result.error("保存失败: " + e.getMessage()); }
    }

    // ── 单据编号规则管理 ──
    @GetMapping("/no-rules")
    public Result noRuleList(HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try { return Result.ok(db.queryForList("SELECT * FROM sys_no_rule ORDER BY id")); }
        catch (Exception e) { return Result.ok(new ArrayList<>()); }
    }

    @PostMapping("/no-rule")
    public Result noRuleSave(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            String key = String.valueOf(body.getOrDefault("rule_key", ""));
            String prefix = String.valueOf(body.getOrDefault("prefix", ""));
            int len = body.get("seq_length") == null ? 4 : Integer.parseInt(String.valueOf(body.get("seq_length")));
            if (key.isEmpty()) return Result.error("规则键不能为空");
            if (prefix.isEmpty() || prefix.length() > 20) return Result.error("前缀须为 1-20 个字符");
            if (len < 2 || len > 8) return Result.error("流水位数须在 2-8 之间");
            int n = db.update("UPDATE sys_no_rule SET prefix=?, seq_length=? WHERE rule_key=?", prefix, len, key);
            if (n == 0) db.update("INSERT INTO sys_no_rule(rule_key,rule_name,prefix,seq_length) VALUES(?,?,?,?)", key, key, prefix, len);
            audit.log(user(req), "编号", "修改编号规则", key + "->" + prefix, audit.getIp(req));
            return Result.ok("规则已保存");
        } catch (Exception e) { return Result.error("保存失败: " + e.getMessage()); }
    }

    @PostMapping("/no-rule/reset/{key}")
    public Result noRuleReset(@PathVariable String key, HttpServletRequest req) {
        if (!"admin".equals(role(req))) return Result.error("权限不足");
        try {
            int n = db.update("UPDATE sys_no_rule SET current_seq=0, last_month='' WHERE rule_key=?", key);
            if (n > 0) audit.log(user(req), "编号", "重置流水", key, audit.getIp(req));
            return n > 0 ? Result.ok("流水已重置") : Result.error("规则不存在");
        } catch (Exception e) { return Result.error("重置失败: " + e.getMessage()); }
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
