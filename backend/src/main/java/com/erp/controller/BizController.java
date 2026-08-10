package com.erp.controller;

import com.erp.model.Result;
import com.erp.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.servlet.http.HttpServletRequest;
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
        workflow.submit(type, String.valueOf(req.getAttribute("user")), String.valueOf(body.getOrDefault("dept","")), String.valueOf(body.getOrDefault("refNo","")), new java.math.BigDecimal(body.getOrDefault("amount","0").toString()), String.valueOf(body.getOrDefault("remark","")));
        audit.log(String.valueOf(req.getAttribute("user")), "协同", "提交审批", String.valueOf(body.get("type")), audit.getIp(req));
        return Result.ok("已提交审批");
    }

    // ── 工作流：任务列表 / 详情 ──
    @GetMapping("/my-tasks") public Result myTasks(HttpServletRequest req) {
        return Result.ok(workflow.myTasks(String.valueOf(req.getAttribute("user"))));
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
                user(req));
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
