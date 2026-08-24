package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 业务列表页汇总分析服务：每个业务表自带「汇总卡片 + 月度趋势 + 分布图」数据。
 * 聚合列/分组列全部来自服务端内置配置（非用户输入），无注入面。
 */
@Service
public class SummaryService {

    @Autowired private JdbcTemplate db;
    @Autowired private MetaService meta;

    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");

    private static class Cfg {
        String[][] sums;      // {列, 卡片标签}
        String dateCol;       // 月度趋势（按 sums[0] 列求和，无则计数）
        String groupCol;      // 分布分组列（按计数）
        String extraExpr;     // 附加卡片：固定条件的 COUNT 表达式（仅服务端配置）
        String extraLabel;
        Cfg(String[][] sums, String dateCol, String groupCol) { this.sums = sums; this.dateCol = dateCol; this.groupCol = groupCol; }
        Cfg extra(String expr, String label) { this.extraExpr = expr; this.extraLabel = label; return this; }
    }

    private static final Map<String, Cfg> CONFIGS = new LinkedHashMap<>();
    static {
        CONFIGS.put("trade_sales_main",        new Cfg(new String[][]{{"total_amount","销售金额"}}, "sales_date", "customer_name"));
        CONFIGS.put("trade_purchase_main",     new Cfg(new String[][]{{"total_amount","采购金额"}}, "purchase_date", "supplier_name"));
        CONFIGS.put("trade_inventory_balance", new Cfg(new String[][]{{"total_value","库存总值"}}, null, "stock_status")
            .extra("stock_status='预警'", "预警物料数"));
        CONFIGS.put("finance_receivable_main", new Cfg(new String[][]{{"total_amount","应收总额"},{"received_amount","已回款"},{"remain_amount","未回款"}}, null, "status"));
        CONFIGS.put("finance_payable_main",    new Cfg(new String[][]{{"total_amount","应付总额"},{"paid_amount","已付款"},{"remain_amount","未付款"}}, null, "status"));
        CONFIGS.put("voucher_main",            new Cfg(new String[][]{{"debit_total","凭证借方合计"}}, "voucher_date", "voucher_status"));
        CONFIGS.put("prod_work_order",         new Cfg(new String[][]{{"plan_qty","计划产量"},{"actual_qty","实际产量"}}, "start_date", "order_status"));
        CONFIGS.put("hr_salary_main",          new Cfg(new String[][]{{"net_salary","实发工资合计"},{"base_salary","基本工资合计"}}, null, "department"));
        CONFIGS.put("hr_employee_main",        new Cfg(null, null, "department"));
        CONFIGS.put("quality_inspection_main", new Cfg(new String[][]{{"sample_qty","抽检总数"},{"pass_qty","合格总数"}}, "inspection_date", "result"));
        CONFIGS.put("cust_customer_main",      new Cfg(null, null, "level"));
        CONFIGS.put("supp_supplier_main",      new Cfg(null, null, "level"));
        CONFIGS.put("trade_delivery_main",     new Cfg(null, "delivery_date", "status"));
        CONFIGS.put("trade_batch_trace",       new Cfg(new String[][]{{"qty","批次总量"},{"remain_qty","剩余在库"}}, "in_date", "batch_type"));
        CONFIGS.put("trade_stock_log",         new Cfg(null, "change_date", "change_type"));
        CONFIGS.put("finance_income_main",     new Cfg(new String[][]{{"amount","收入合计"}}, "income_date", "income_type"));
        CONFIGS.put("finance_expense_main",    new Cfg(new String[][]{{"amount","支出合计"}}, "expense_date", "expense_type"));
        CONFIGS.put("oa_approval_main",        new Cfg(new String[][]{{"amount","申请金额合计"}}, "submit_date", "approval_status"));
        CONFIGS.put("prod_material_requisition", new Cfg(new String[][]{{"plan_req_qty","计划领料量"},{"actual_req_qty","实际领料量"}}, "req_date", null));
        CONFIGS.put("trade_goods_main",        new Cfg(null, null, "category"));
        CONFIGS.put("trade_warehouse_main",    new Cfg(null, null, "warehouse_type"));
        CONFIGS.put("sys_log_operation",       new Cfg(null, "created_at", "module")
            .extra("DATE(created_at)=CURDATE()", "今日操作数"));
        CONFIGS.put("sys_login_log",           new Cfg(null, "login_time", "login_status")
            .extra("login_status LIKE '失败%' AND DATE(login_time)=CURDATE()", "今日登录失败"));
    }

    public Map<String,Object> summary(String table) {
        if (!VALID.matcher(table).matches() || !meta.tableExists(table)) throw new IllegalArgumentException("无效表名: " + table);
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> cards = new ArrayList<>();
        Cfg cfg = CONFIGS.get(table);

        Long total = db.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        Map<String,Object> card0 = new LinkedHashMap<>();
        card0.put("label", "记录总数");
        card0.put("value", total == null ? 0 : total);
        card0.put("unit", "条");
        cards.add(card0);

        if (cfg != null && cfg.sums != null) {
            for (String[] s : cfg.sums) {
                try {
                    BigDecimal v = db.queryForObject("SELECT COALESCE(SUM(`" + s[0] + "`),0) FROM " + table, BigDecimal.class);
                    Map<String,Object> c = new LinkedHashMap<>();
                    c.put("label", s[1]);
                    c.put("value", v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP));
                    cards.add(c);
                } catch (Exception ignored) {}
            }
        }
        if (cfg != null && cfg.extraExpr != null) {
            try {
                Long v = db.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + cfg.extraExpr, Long.class);
                Map<String,Object> c = new LinkedHashMap<>();
                c.put("label", cfg.extraLabel);
                c.put("value", v == null ? 0 : v);
                c.put("unit", "条");
                c.put("tone", "warn");
                cards.add(c);
            } catch (Exception ignored) {}
        }
        ret.put("cards", cards);

        // 月度趋势（近 6 个月）
        if (cfg != null && cfg.dateCol != null) {
            try {
                String valueExpr = (cfg.sums != null && cfg.sums.length > 0) ? "COALESCE(SUM(`" + cfg.sums[0][0] + "`),0)" : "COUNT(*)";
                String title = (cfg.sums != null && cfg.sums.length > 0) ? cfg.sums[0][1] + "（近6个月）" : "单量（近6个月）";
                List<Map<String,Object>> trend = db.queryForList(
                    "SELECT DATE_FORMAT(`" + cfg.dateCol + "`, '%Y-%m') name, " + valueExpr + " value FROM " + table +
                    " WHERE `" + cfg.dateCol + "` >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)" +
                    " GROUP BY DATE_FORMAT(`" + cfg.dateCol + "`, '%Y-%m') ORDER BY name ASC");
                ret.put("trend", mapOf("title", title, "points", trend));
            } catch (Exception ignored) {}
        }
        // 分布（按分组列计数，TOP 8）
        if (cfg != null && cfg.groupCol != null) {
            try {
                List<Map<String,Object>> groups = db.queryForList(
                    "SELECT COALESCE(NULLIF(`" + cfg.groupCol + "`,''),'未填写') name, COUNT(*) value FROM " + table +
                    " GROUP BY `" + cfg.groupCol + "` ORDER BY value DESC LIMIT 8");
                ret.put("groups", mapOf("title", "分布统计", "points", groups));
            } catch (Exception ignored) {}
        }
        return ret;
    }

    private Map<String,Object> mapOf(String k1, Object v1, String k2, Object v2) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put(k1, v1); m.put(k2, v2);
        return m;
    }
}
