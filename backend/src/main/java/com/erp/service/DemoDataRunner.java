package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 演示数据装载器：开关开启且业务表为空时，加载一套 9 个月跨度、全链路自洽的
 * 演示数据集（销售/采购/库存/生产/凭证/应收应付/审批/工资/质检），
 * 让仪表盘、报表、工作流等页面开箱即有清晰直观的数据。
 *
 * - 幂等安全：全部 INSERT IGNORE，且仅在 trade_goods_main 为空时执行，绝不覆盖真实数据；
 * - 生产环境：设置 SEED_DEMO_DATA=false 关闭；
 * - 容错：单条语句失败只记录跳过，不影响应用启动。
 */
@Component
@Order(20)
public class DemoDataRunner implements ApplicationRunner {

    @Autowired private JdbcTemplate db;

    @Value("${app.seed-demo-data:true}")
    private boolean enabled;

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        try {
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM trade_goods_main", Integer.class);
            if (cnt != null && cnt > 0) return; // 已有业务数据 → 不装演示数据
        } catch (Exception e) {
            return; // 表不存在等异常 → 跳过
        }
        try {
            ClassPathResource res = new ClassPathResource("demo-data/demo_data.sql");
            if (!res.exists()) return;
            String sql;
            try (InputStream in = res.getInputStream()) {
                sql = StreamUtils.copyToString(in, StandardCharsets.UTF_8);
            }
            int ok = 0, fail = 0;
            for (String raw : splitStatements(sql)) {
                String s = stripComments(raw).trim();
                if (s.isEmpty()) continue;
                try {
                    db.execute(s);
                    ok++;
                } catch (Exception e) {
                    fail++;
                    System.err.println("[demo-data] 语句执行失败(已跳过): " + e.getMessage());
                }
            }
            System.out.println("[demo-data] 演示数据装载完成：成功 " + ok + " 条语句，失败 " + fail + " 条"
                + (fail > 0 ? "（失败项多为缺表/缺列，可执行 database/ 下全部升级脚本后重启修复）" : ""));
        } catch (Exception e) {
            System.err.println("[demo-data] 装载失败(不影响应用启动): " + e.getMessage());
        }
    }

    /** 去除 '--' 注释行 */
    private String stripComments(String stmt) {
        StringBuilder sb = new StringBuilder();
        for (String line : stmt.split("\n")) {
            String t = line.trim();
            if (t.startsWith("--")) continue;
            sb.append(line).append('\n');
        }
        return sb.toString();
    }

    /** 顶层分号分割（感知字符串与括号，避免切开 DATE_SUB(...) 等表达式） */
    private List<String> splitStatements(String sql) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inStr = false;
        int depth = 0;
        for (int i = 0; i < sql.length(); i++) {
            char ch = sql.charAt(i);
            if (inStr) {
                cur.append(ch);
                if (ch == '\'') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '\'') { cur.append('\''); i++; }
                    else inStr = false;
                }
                continue;
            }
            if (ch == '\'') { inStr = true; cur.append(ch); continue; }
            if (ch == '(') depth++;
            if (ch == ')') depth--;
            if (ch == ';' && depth == 0) { out.add(cur.toString()); cur.setLength(0); continue; }
            cur.append(ch);
        }
        if (cur.toString().trim().length() > 0) out.add(cur.toString());
        return out;
    }
}
