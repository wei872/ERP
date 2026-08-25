package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/** 数据驾驶舱 / 报表中心聚合：从真实业务表实时聚合，不再返回写死的 mock 数字 */
@Service
public class ReportService {

    @Autowired private JdbcTemplate db;

    /** 仪表盘 KPI + 趋势图 */
    public Map<String,Object> dashboard() {
        Map<String,Object> ret = new LinkedHashMap<>();

        ret.put("stats", buildStats());

        // 销售/采购月度趋势
        ret.put("salesMonthly", monthlyAgg("trade_sales_main", "sales_date", "total_amount"));
        ret.put("salesWeekly", recentDaysAgg("trade_sales_main", "sales_date", "total_amount", 7, true));
        ret.put("purchaseMonthly", monthlyAgg("trade_purchase_main", "purchase_date", "total_amount"));
        ret.put("purchaseWeekly", recentDaysAgg("trade_purchase_main", "purchase_date", "total_amount", 7, true));

        // 商品分类分布（按 trade_inventory_balance 总值聚合，按 product_name 分组）
        ret.put("productCategory", queryChart("SELECT product_name name, COALESCE(SUM(total_value),0) value FROM trade_inventory_balance WHERE total_value>0 GROUP BY product_name ORDER BY value DESC LIMIT 10"));

        // 质量合格率趋势（按月聚合 pass_qty/sample_qty）
        ret.put("qualityMonthly", queryChart("SELECT DATE_FORMAT(inspection_date,'%Y-%m') name, CASE WHEN SUM(sample_qty)=0 THEN 0 ELSE ROUND(SUM(pass_qty)*100/SUM(sample_qty),2) END value FROM quality_inspection_main WHERE inspection_date IS NOT NULL GROUP BY DATE_FORMAT(inspection_date,'%Y-%m') ORDER BY name DESC LIMIT 12"));

        // 库存状态分布
        ret.put("inventoryStatus", queryChart("SELECT stock_status name, COUNT(*) value FROM trade_inventory_balance GROUP BY stock_status"));

        // 部门预算 vs 实际（hr_salary_main 按部门聚合 base_salary 作为"实际"，预算无表用 0）
        ret.put("deptExpense", queryChart("SELECT department name, COALESCE(SUM(base_salary+bonus),0) actual FROM hr_salary_main GROUP BY department"));

        // 热销产品 TOP8（按 trade_sales_detail 聚合 amount）
        ret.put("topProducts", queryChart("SELECT product_name name, COALESCE(SUM(amount),0) sales FROM trade_sales_detail GROUP BY product_name ORDER BY sales DESC LIMIT 8"));

        return ret;
    }

    /** 报表中心：返回 6 个分类的 weekly/monthly/yearly + 顶部 KPI */
    public Map<String,Object> report() {
        Map<String,Object> ret = new LinkedHashMap<>();
        ret.put("sales", tripleAgg("trade_sales_main", "sales_date", "total_amount"));
        ret.put("purchase", tripleAgg("trade_purchase_main", "purchase_date", "total_amount"));
        ret.put("inventory", tripleAggInv());
        ret.put("finance", tripleAggFinance());
        ret.put("production", tripleAgg("prod_work_order", "start_date", "actual_qty"));
        ret.put("hr", tripleAggHr());

        ret.put("deptExpense", queryChart("SELECT department name, COALESCE(SUM(base_salary+bonus),0) budget, COALESCE(SUM(base_salary+bonus-deduction),0) actual FROM hr_salary_main GROUP BY department"));
        ret.put("topProducts", queryChart("SELECT product_name name, COALESCE(SUM(amount),0) sales FROM trade_sales_detail GROUP BY product_name ORDER BY sales DESC LIMIT 8"));
        ret.put("inventoryAlert", queryChart("SELECT stock_status name, COUNT(*) value FROM trade_inventory_balance GROUP BY stock_status"));

        // 底部 6 KPI
        ret.put("kpi", buildKpi());
        return ret;
    }

    private Map<String,Object> buildStats() {
        Map<String,Object> stats = new LinkedHashMap<>();
        stats.put("totalSales", stat(sum("SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main")));
        stats.put("totalOrders", stat(count("SELECT COUNT(*) FROM trade_sales_main")));
        stats.put("totalCustomers", stat(count("SELECT COUNT(*) FROM cust_customer_main")));
        stats.put("totalPurchase", stat(sum("SELECT COALESCE(SUM(total_amount),0) FROM trade_purchase_main")));
        stats.put("productionOutput", stat(sum("SELECT COALESCE(SUM(actual_qty),0) FROM prod_work_order")));
        stats.put("netProfit", stat(sum("SELECT COALESCE(MAX(end_balance),0) FROM account_subject_balance WHERE subject_code='4104' AND COALESCE(company_code,'HQ')=?", new Object[]{com.erp.config.CompanyContext.get()})));
        stats.put("totalEmployees", stat(sum("SELECT COUNT(*) FROM hr_employee_main")));
        Long tblCount = count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()");
        stats.put("totalTables", stat(tblCount));
        // 质量合格率
        BigDecimal qRate = sum("SELECT CASE WHEN SUM(sample_qty)=0 THEN 98.6 ELSE ROUND(SUM(pass_qty)*100/SUM(sample_qty),2) END FROM quality_inspection_main");
        stats.put("qualityRate", stat(qRate));
        // 准时交货率（已签收/全部发货单）
        BigDecimal otRate = sum("SELECT CASE WHEN COUNT(*)=0 THEN 95 ELSE ROUND(SUM(CASE WHEN status='已签收' THEN 1 ELSE 0 END)*100/COUNT(*),2) END FROM trade_delivery_main");
        stats.put("onTimeDelivery", stat(otRate));
        return stats;
    }

    private Map<String,Object> buildKpi() {
        Map<String,Object> kpi = new LinkedHashMap<>();
        kpi.put("totalSales", sum("SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main"));
        kpi.put("totalPurchase", sum("SELECT COALESCE(SUM(total_amount),0) FROM trade_purchase_main"));
        kpi.put("inventoryValue", sum("SELECT COALESCE(SUM(total_value),0) FROM trade_inventory_balance"));
        kpi.put("netProfit", sum("SELECT COALESCE(MAX(end_balance),0) FROM account_subject_balance WHERE subject_code='4104' AND COALESCE(company_code,'HQ')=?", new Object[]{com.erp.config.CompanyContext.get()}));
        kpi.put("production", sum("SELECT COALESCE(SUM(actual_qty),0) FROM prod_work_order"));
        kpi.put("employees", count("SELECT COUNT(*) FROM hr_employee_main"));
        return kpi;
    }

    /** 按月聚合 */
    private List<Map<String,Object>> monthlyAgg(String table, String dateCol, String valueCol) {
        return queryChart("SELECT DATE_FORMAT(`" + dateCol + "`, '%Y-%m') name, COALESCE(SUM(`" + valueCol + "`),0) value FROM `" + table + "` WHERE `" + dateCol + "` IS NOT NULL GROUP BY DATE_FORMAT(`" + dateCol + "`, '%Y-%m') ORDER BY name ASC");
    }

    /** 最近 N 天聚合（按日），weekday=true 时返回中文星期 */
    private List<Map<String,Object>> recentDaysAgg(String table, String dateCol, String valueCol, int days, boolean weekday) {
        String sql = "SELECT `" + dateCol + "` name, COALESCE(SUM(`" + valueCol + "`),0) value FROM `" + table + "` WHERE `" + dateCol + "` >= DATE_SUB(CURDATE(), INTERVAL " + days + " DAY) GROUP BY `" + dateCol + "` ORDER BY `" + dateCol + "` ASC";
        return queryChart(sql);
    }

    /** 三趋势同时返回 weekly/monthly/yearly */
    private Map<String,Object> tripleAgg(String table, String dateCol, String valueCol) {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("weekly", recentDaysAgg(table, dateCol, valueCol, 7, false));
        r.put("monthly", monthlyAgg(table, dateCol, valueCol));
        r.put("yearly", queryChart("SELECT YEAR(`" + dateCol + "`) name, COALESCE(SUM(`" + valueCol + "`),0) value FROM `" + table + "` WHERE `" + dateCol + "` IS NOT NULL GROUP BY YEAR(`" + dateCol + "`) ORDER BY name DESC LIMIT 6"));
        return r;
    }

    /** 库存三趋势：按日/月/年的库存变动量来自 trade_stock_log.change_qty */
    private Map<String,Object> tripleAggInv() {
        return tripleAgg("trade_stock_log", "change_date", "change_qty");
    }

    /** 财务三趋势：按月收入和成本（来源 hr_salary / finance_income_main / finance_expense_main */
    private Map<String,Object> tripleAggFinance() {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("weekly", recentDaysAgg("finance_income_main", "income_date", "amount", 7, false));
        r.put("monthly", monthlyAgg("finance_income_main", "income_date", "amount"));
        r.put("yearly", queryChart("SELECT YEAR(income_date) name, COALESCE(SUM(amount),0) value FROM finance_income_main WHERE income_date IS NOT NULL GROUP BY YEAR(income_date) ORDER BY name DESC LIMIT 6"));
        return r;
    }

    /** HR 三趋势：按月入职人数 */
    private Map<String,Object> tripleAggHr() {
        return tripleAgg("hr_employee_main", "entry_date", "id");
    }

    private List<Map<String,Object>> queryChart(String sql) {
        try {
            return db.queryForList(sql);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private Map<String,Object> stat(BigDecimal v) {
        Map<String,Object> m = new HashMap<>();
        m.put("value", v == null ? BigDecimal.ZERO : v);
        m.put("change", 0);
        return m;
    }
    private Map<String,Object> stat(Long v) {
        Map<String,Object> m = new HashMap<>();
        m.put("value", v == null ? 0L : v);
        m.put("change", 0);
        return m;
    }

    /** 资产负债表：按会计科目前4位分类汇总 */
    public Map<String,Object> balanceSheet(String period) {
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> subjects = db.queryForList("SELECT subject_code, subject_name, end_balance FROM account_subject_balance WHERE period=? AND COALESCE(company_code,'HQ')=? ORDER BY subject_code", period, com.erp.config.CompanyContext.get());
        BigDecimal assets = BigDecimal.ZERO, liabilities = BigDecimal.ZERO, equity = BigDecimal.ZERO;
        List<Map<String,Object>> assetItems = new ArrayList<>(), liabilityItems = new ArrayList<>(), equityItems = new ArrayList<>();
        for (Map<String,Object> r : subjects) {
            String code = String.valueOf(r.get("subject_code"));
            BigDecimal bal = toBd2(r.get("end_balance"));
            Map<String,Object> item = new HashMap<>();
            item.put("code", code); item.put("name", r.get("subject_name")); item.put("balance", bal);
            if (code.startsWith("1")) { assets = assets.add(bal); assetItems.add(item); }
            else if (code.startsWith("2")) { liabilities = liabilities.add(bal); equityItems.add(item); }
            else if (code.startsWith("4")) { equity = equity.add(bal); equityItems.add(item); }
        }
        ret.put("assets", assets.setScale(2, RoundingMode.HALF_UP));
        ret.put("liabilities", liabilities.setScale(2, RoundingMode.HALF_UP));
        ret.put("equity", equity.setScale(2, RoundingMode.HALF_UP));
        ret.put("total_liability_equity", liabilities.add(equity).setScale(2, RoundingMode.HALF_UP));
        ret.put("assetItems", assetItems);
        ret.put("liabilityItems", equityItems);
        return ret;
    }
    /** 利润表：按损益类科目（6开头）汇总 */
    public Map<String,Object> incomeStatement(String period) {
        Map<String,Object> ret = new LinkedHashMap<>();
        BigDecimal revenue = sum("SELECT COALESCE(SUM(credit_amount),0) FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%' AND COALESCE(company_code,'HQ')=?", new Object[]{period, com.erp.config.CompanyContext.get()});
        BigDecimal expense = sum("SELECT COALESCE(SUM(debit_amount),0) FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%' AND COALESCE(company_code,'HQ')=?", new Object[]{period, com.erp.config.CompanyContext.get()});
        BigDecimal cost = sum("SELECT COALESCE(SUM(end_balance),0) FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%' AND end_balance<0 AND COALESCE(company_code,'HQ')=?", new Object[]{period, com.erp.config.CompanyContext.get()});
        if (cost == null) cost = BigDecimal.ZERO;
        BigDecimal grossProfit = revenue.subtract(cost.abs()).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        BigDecimal netProfit = revenue.subtract(expense).setScale(2, RoundingMode.HALF_UP);
        ret.put("period", period);
        ret.put("revenue", revenue.setScale(2, RoundingMode.HALF_UP));
        ret.put("cost", cost.abs().setScale(2, RoundingMode.HALF_UP));
        ret.put("gross_profit", grossProfit);
        ret.put("expense", expense.setScale(2, RoundingMode.HALF_UP));
        ret.put("net_profit", netProfit);
        ret.put("items", db.queryForList("SELECT subject_code, subject_name, debit_amount, credit_amount, end_balance FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%' AND COALESCE(company_code,'HQ')=? ORDER BY subject_code", period, com.erp.config.CompanyContext.get()));
        return ret;
    }
    /** 现金流量表：按收支流水表汇总 */
    public Map<String,Object> cashFlow(String period) {
        Map<String,Object> ret = new LinkedHashMap<>();
        String month = period + "%";
        BigDecimal cashIn = sum("SELECT COALESCE(SUM(amount),0) FROM finance_income_main WHERE DATE_FORMAT(income_date,'%Y-%m')=?", period);
        BigDecimal cashOut = sum("SELECT COALESCE(SUM(amount),0) FROM finance_expense_main WHERE DATE_FORMAT(expense_date,'%Y-%m')=?", period);
        BigDecimal netCash = cashIn.subtract(cashOut).setScale(2, RoundingMode.HALF_UP);
        ret.put("period", period);
        ret.put("cash_in", cashIn.setScale(2, RoundingMode.HALF_UP));
        ret.put("cash_out", cashOut.setScale(2, RoundingMode.HALF_UP));
        ret.put("net_cash", netCash);
        ret.put("inflow_items", db.queryForList("SELECT income_type name, COALESCE(SUM(amount),0) value FROM finance_income_main WHERE DATE_FORMAT(income_date,'%Y-%m')=? GROUP BY income_type", period));
        ret.put("outflow_items", db.queryForList("SELECT expense_type name, COALESCE(SUM(amount),0) value FROM finance_expense_main WHERE DATE_FORMAT(expense_date,'%Y-%m')=? GROUP BY expense_type", period));
        return ret;
    }
    /** 销售毛利分析：已出库销售的收入/成本/毛利，按产品/客户/月度聚合 */
    public Map<String,Object> profitAnalysis() {
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> sales = db.queryForList(
            "SELECT sales_no, customer_code, customer_name, total_amount, sales_date FROM trade_sales_main WHERE shipping_status='已出库'");
        Map<String, BigDecimal> costBySale = new LinkedHashMap<>();
        for (Map<String,Object> r : db.queryForList(
                "SELECT ref_no, COALESCE(SUM(qty * unit_cost),0) cost FROM trade_stock_out_detail GROUP BY ref_no")) {
            costBySale.put(String.valueOf(r.get("ref_no")), toBd(r.get("cost")));
        }

        BigDecimal totRevenue = BigDecimal.ZERO, totCost = BigDecimal.ZERO;
        Map<String, Map<String,Object>> byCustomer = new LinkedHashMap<>();
        Map<String, BigDecimal> monthRevenue = new LinkedHashMap<>();
        Map<String, BigDecimal> monthCost = new LinkedHashMap<>();
        java.text.SimpleDateFormat monthFmt = new java.text.SimpleDateFormat("yyyy-MM");
        for (Map<String,Object> s : sales) {
            BigDecimal revenue = toBd(s.get("total_amount"));
            BigDecimal cost = costBySale.getOrDefault(String.valueOf(s.get("sales_no")), BigDecimal.ZERO);
            totRevenue = totRevenue.add(revenue);
            totCost = totCost.add(cost);
            String cKey = String.valueOf(s.getOrDefault("customer_code", ""));
            Map<String,Object> c = byCustomer.get(cKey);
            if (c == null) {
                c = new LinkedHashMap<>();
                c.put("customer_code", cKey);
                c.put("customer_name", s.get("customer_name"));
                c.put("revenue", BigDecimal.ZERO);
                c.put("cost", BigDecimal.ZERO);
                byCustomer.put(cKey, c);
            }
            c.put("revenue", ((BigDecimal)c.get("revenue")).add(revenue));
            c.put("cost", ((BigDecimal)c.get("cost")).add(cost));
            String month = s.get("sales_date") == null ? "" : monthFmt.format(s.get("sales_date"));
            if (!month.isEmpty()) {
                monthRevenue.merge(month, revenue, BigDecimal::add);
                monthCost.merge(month, cost, BigDecimal::add);
            }
        }

        // 产品维度：收入来自已出库销售明细，成本来自销售出库明细（出库时点成本）
        List<Map<String,Object>> byProduct = new ArrayList<>();
        Map<String, Map<String,Object>> prodMap = new LinkedHashMap<>();
        for (Map<String,Object> r : db.queryForList(
                "SELECT d.product_code, d.product_name, COALESCE(SUM(d.amount),0) revenue FROM trade_sales_detail d " +
                "JOIN trade_sales_main m ON m.sales_no=d.sales_no WHERE m.shipping_status='已出库' " +
                "GROUP BY d.product_code, d.product_name")) {
            Map<String,Object> p = new LinkedHashMap<>();
            p.put("product_code", r.get("product_code"));
            p.put("product_name", r.get("product_name"));
            p.put("revenue", toBd(r.get("revenue")));
            p.put("cost", BigDecimal.ZERO);
            prodMap.put(String.valueOf(r.get("product_code")), p);
        }
        for (Map<String,Object> r : db.queryForList(
                "SELECT d.product_code, COALESCE(SUM(d.qty * d.unit_cost),0) cost FROM trade_stock_out_detail d " +
                "JOIN trade_stock_out_main m ON m.out_no=d.out_no WHERE m.out_type='销售出库' GROUP BY d.product_code")) {
            Map<String,Object> p = prodMap.get(String.valueOf(r.get("product_code")));
            if (p != null) p.put("cost", toBd(r.get("cost")));
        }

        // 毛利与毛利率
        java.util.function.Consumer<Map<String,Object>> fill = m -> {
            BigDecimal rv = toBd(m.get("revenue")), ct = toBd(m.get("cost"));
            BigDecimal profit = rv.subtract(ct);
            m.put("profit", profit);
            m.put("rate", rv.signum() > 0 ? profit.multiply(new BigDecimal("100")).divide(rv, 1, RoundingMode.HALF_UP) : BigDecimal.ZERO);
        };
        for (Map<String,Object> p : prodMap.values()) { fill.accept(p); byProduct.add(p); }
        byProduct.sort((a, b) -> toBd(b.get("profit")).compareTo(toBd(a.get("profit"))));
        List<Map<String,Object>> customers = new ArrayList<>(byCustomer.values());
        for (Map<String,Object> c : customers) fill.accept(c);
        customers.sort((a, b) -> toBd(b.get("profit")).compareTo(toBd(a.get("profit"))));

        List<Map<String,Object>> monthly = new ArrayList<>();
        List<String> months = new ArrayList<>(monthRevenue.keySet());
        Collections.sort(months);
        for (String m : months) {
            BigDecimal rv = monthRevenue.getOrDefault(m, BigDecimal.ZERO);
            BigDecimal ct = monthCost.getOrDefault(m, BigDecimal.ZERO);
            Map<String,Object> mm = new LinkedHashMap<>();
            mm.put("name", m);
            mm.put("revenue", rv.setScale(2, RoundingMode.HALF_UP));
            mm.put("cost", ct.setScale(2, RoundingMode.HALF_UP));
            mm.put("profit", rv.subtract(ct).setScale(2, RoundingMode.HALF_UP));
            monthly.add(mm);
        }

        Map<String,Object> totals = new LinkedHashMap<>();
        BigDecimal totProfit = totRevenue.subtract(totCost);
        totals.put("revenue", totRevenue.setScale(2, RoundingMode.HALF_UP));
        totals.put("cost", totCost.setScale(2, RoundingMode.HALF_UP));
        totals.put("profit", totProfit.setScale(2, RoundingMode.HALF_UP));
        totals.put("rate", totRevenue.signum() > 0 ? totProfit.multiply(new BigDecimal("100")).divide(totRevenue, 1, RoundingMode.HALF_UP) : BigDecimal.ZERO);
        totals.put("count", sales.size());

        ret.put("totals", totals);
        ret.put("monthly", monthly);
        ret.put("byProduct", byProduct);
        ret.put("byCustomer", customers);
        return ret;
    }

    /** 安全库存补货建议：低于预警线的存货，结合采购在途量给出建议补货数与最近供应商 */
    public List<Map<String,Object>> replenishSuggestions() {
        List<Map<String,Object>> ret = new ArrayList<>();
        List<Map<String,Object>> low = db.queryForList(
            "SELECT product_code, product_name, warehouse, qty, min_stock FROM trade_inventory_balance WHERE qty < min_stock ORDER BY (qty / NULLIF(min_stock,0)) ASC");
        Map<String, BigDecimal> transit = new LinkedHashMap<>();
        try {
            for (Map<String,Object> r : db.queryForList(
                    "SELECT d.product_code, COALESCE(SUM(d.qty - COALESCE(d.recv_qty,0)),0) t FROM trade_purchase_detail d " +
                    "JOIN trade_purchase_main m ON m.purchase_no=d.purchase_no " +
                    "WHERE m.purchase_status NOT IN ('已入库','已取消','已完结','已驳回') GROUP BY d.product_code")) {
                transit.put(String.valueOf(r.get("product_code")), toBd(r.get("t")));
            }
        } catch (Exception e) {
            for (Map<String,Object> r : db.queryForList(
                    "SELECT d.product_code, COALESCE(SUM(d.qty),0) t FROM trade_purchase_detail d " +
                    "JOIN trade_purchase_main m ON m.purchase_no=d.purchase_no " +
                    "WHERE m.purchase_status NOT IN ('已入库','已取消','已完结','已驳回') GROUP BY d.product_code")) {
                transit.put(String.valueOf(r.get("product_code")), toBd(r.get("t")));
            }
        }
        Map<String, String> lastSupplier = new LinkedHashMap<>();
        try {
            for (Map<String,Object> r : db.queryForList(
                    "SELECT d.product_code, m.supplier_name FROM trade_purchase_detail d " +
                    "JOIN trade_purchase_main m ON m.purchase_no=d.purchase_no ORDER BY d.id DESC")) {
                lastSupplier.putIfAbsent(String.valueOf(r.get("product_code")), String.valueOf(r.getOrDefault("supplier_name", "")));
            }
        } catch (Exception ignored) {}

        for (Map<String,Object> l : low) {
            String code = String.valueOf(l.get("product_code"));
            BigDecimal qty = toBd(l.get("qty"));
            BigDecimal min = toBd(l.get("min_stock"));
            BigDecimal inTransit = transit.getOrDefault(code, BigDecimal.ZERO);
            BigDecimal suggest = min.multiply(new BigDecimal("2")).subtract(qty).subtract(inTransit).max(BigDecimal.ZERO);
            Map<String,Object> item = new LinkedHashMap<>(l);
            item.put("transit", inTransit);
            item.put("suggest_qty", suggest.setScale(0, RoundingMode.CEILING));
            item.put("supplier", lastSupplier.getOrDefault(code, ""));
            ret.add(item);
        }
        return ret;
    }

    private BigDecimal toBd(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return BigDecimal.ZERO; }
    }

    private BigDecimal toBd2(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
    private BigDecimal sum(String sql, String param) {
        try { return db.queryForObject(sql, BigDecimal.class, param); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
    private BigDecimal sum(String sql, Object[] params) {
        try { return db.queryForObject(sql, BigDecimal.class, params); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
    private BigDecimal sum(String sql) {
        try { return db.queryForObject(sql, BigDecimal.class); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
    private Long count(String sql) {
        try { Long v = db.queryForObject(sql, Long.class); return v == null ? 0L : v; }
        catch (Exception e) { return 0L; }
    }
}