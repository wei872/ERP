package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 单据编号规则：前缀 + yyyyMM + 流水号（按月自动复位）。
 * 规则存 sys_no_rule，可在「单据编号规则」页自定义前缀与位数；
 * 表不存在/规则缺失时调用方自行回退旧编号格式。
 */
@Service
public class NoRuleService {

    @Autowired private JdbcTemplate db;

    /** 生成下一个编号（行锁防并发重号）。 */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String nextNo(String ruleKey) {
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_no_rule WHERE rule_key=? FOR UPDATE", ruleKey);
        String month = new SimpleDateFormat("yyyyMM").format(new Date());
        if (rows.isEmpty()) {
            // 无规则：按默认规则即时创建
            String prefix = defaultPrefix(ruleKey);
            db.update("INSERT INTO sys_no_rule(rule_key,rule_name,prefix,seq_length,current_seq,last_month) VALUES(?,?,?,?,1,?)",
                ruleKey, ruleKey, prefix, 4, month);
            return prefix + month + pad(1, 4);
        }
        Map<String,Object> r = rows.get(0);
        String prefix = String.valueOf(r.getOrDefault("prefix", defaultPrefix(ruleKey)));
        int len = r.get("seq_length") == null ? 4 : ((Number) r.get("seq_length")).intValue();
        if (len < 2) len = 2; if (len > 8) len = 8;
        int seq = r.get("current_seq") == null ? 0 : ((Number) r.get("current_seq")).intValue();
        String lastMonth = r.get("last_month") == null ? "" : String.valueOf(r.get("last_month"));
        if (!month.equals(lastMonth)) seq = 0; // 跨月复位
        seq++;
        db.update("UPDATE sys_no_rule SET current_seq=?, last_month=? WHERE rule_key=?", seq, month, ruleKey);
        return prefix + month + pad(seq, len);
    }

    private String defaultPrefix(String ruleKey) {
        if ("voucher".equals(ruleKey)) return "VZ-";
        if ("sales".equals(ruleKey)) return "SO-";
        if ("purchase".equals(ruleKey)) return "PO-";
        if ("stockcheck".equals(ruleKey)) return "PD-";
        if ("commission".equals(ruleKey)) return "TC-";
        return "DOC-";
    }

    private String pad(int v, int len) {
        String s = String.valueOf(v);
        StringBuilder sb = new StringBuilder();
        for (int i = s.length(); i < len; i++) sb.append('0');
        return sb.append(s).toString();
    }
}
