package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 客户信用控制中枢（v5.25）：额度占用查询 + 下单前置拦截。
 * 口径：信用占用 = 应收台账未收余额（finance_receivable_main.remain_amount 之和）——
 *       销售单开具时即联动生成应收记录（含在途未发货订单），故一处口径即全口径，无重复计算。
 * 拦截点：销售订单新增（DataController）、报价单转订单（BizController.quoteToSale）。
 * 放行：管理员可在下单表单勾选「强制放行」，放行留审计痕迹。
 */
@Service
public class CreditService {

    @Autowired private JdbcTemplate db;

    /** 客户信用占用明细：额度 / 已占用（应收未收）/ 可用额度 / 占用率 */
    public Map<String,Object> usage(String customerCode) {
        Map<String,Object> ret = new LinkedHashMap<>();
        if (customerCode == null || customerCode.trim().isEmpty()) return ret;
        List<Map<String,Object>> cs = db.queryForList(
            "SELECT customer_name, credit_limit FROM cust_customer_main WHERE customer_code=?", customerCode);
        if (cs.isEmpty()) { ret.put("exists", false); return ret; }
        ret.put("exists", true);
        ret.put("customer_code", customerCode);
        ret.put("customer_name", cs.get(0).get("customer_name"));
        BigDecimal limit = toBD(cs.get(0).get("credit_limit"));
        ret.put("credit_limit", limit);
        BigDecimal used = db.queryForObject(
            "SELECT COALESCE(SUM(remain_amount),0) FROM finance_receivable_main WHERE customer_code=?",
            BigDecimal.class, customerCode);
        if (used == null) used = BigDecimal.ZERO;
        BigDecimal openOrders = db.queryForObject(
            "SELECT COALESCE(SUM(total_amount),0) FROM trade_sales_main WHERE customer_code=? AND sales_status IN ('待审核','已审核')",
            BigDecimal.class, customerCode);
        if (openOrders == null) openOrders = BigDecimal.ZERO;
        long rcvCount = db.queryForObject(
            "SELECT COUNT(*) FROM finance_receivable_main WHERE customer_code=? AND remain_amount>0",
            Long.class, customerCode);
        ret.put("used", used);
        ret.put("open_order_amount", openOrders);
        ret.put("open_receivable_count", rcvCount);
        ret.put("available", limit.signum() > 0 ? limit.subtract(used) : BigDecimal.ZERO);
        ret.put("ratio", limit.signum() > 0
            ? used.divide(limit, 4, RoundingMode.HALF_UP).multiply(new BigDecimal(100)).setScale(1, RoundingMode.HALF_UP)
            : BigDecimal.ZERO);
        ret.put("enabled", limit.signum() > 0);
        return ret;
    }

    /**
     * 下单前置校验：额度未启用（=0）或客户不存在 → 放行（返回 null）；
     * 已占用 + 本单金额 > 额度 → 返回中文拦截原因（调用方原样报给前端）。
     */
    public String check(String customerCode, BigDecimal orderAmt) {
        if (customerCode == null || customerCode.trim().isEmpty()) return null;
        if (orderAmt == null || orderAmt.signum() <= 0) return null;
        // 系统参数开关（v5.31）：credit_block_enabled=false 时全局放行（应急逃生门，留痕依赖审计）
        try {
            java.util.List<Map<String,Object>> cfg = db.queryForList("SELECT config_value FROM sys_config WHERE config_key='credit_block_enabled'");
            if (!cfg.isEmpty() && "false".equalsIgnoreCase(String.valueOf(cfg.get(0).get("config_value")).trim())) return null;
        } catch (Exception ignored) {}
        List<Map<String,Object>> cs = db.queryForList(
            "SELECT customer_name, credit_limit FROM cust_customer_main WHERE customer_code=?", customerCode);
        if (cs.isEmpty()) return null;
        BigDecimal limit = toBD(cs.get(0).get("credit_limit"));
        if (limit.signum() <= 0) return null; // 未启用信用额度
        BigDecimal used = db.queryForObject(
            "SELECT COALESCE(SUM(remain_amount),0) FROM finance_receivable_main WHERE customer_code=?",
            BigDecimal.class, customerCode);
        if (used == null) used = BigDecimal.ZERO;
        if (used.add(orderAmt).compareTo(limit) > 0) {
            return "超出客户信用额度：" + cs.get(0).get("customer_name")
                + "（额度 ¥" + limit.setScale(2, RoundingMode.HALF_UP)
                + "，已占用 ¥" + used.setScale(2, RoundingMode.HALF_UP)
                + "，本单 ¥" + orderAmt.setScale(2, RoundingMode.HALF_UP)
                + "，将超出 ¥" + used.add(orderAmt).subtract(limit).setScale(2, RoundingMode.HALF_UP)
                + "）—— 请先催收核销回款或调整信用额度";
        }
        return null;
    }

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
