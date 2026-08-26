package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.mail.internet.MimeMessage;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 报表邮件订阅：
 *   定时任务扫描启用中的订阅 → 生成报表正文 → 写入发件箱 → 尝试发送。
 *   邮件服务器通过 spring.mail.* 配置；未配置时发件箱标记为 simulated（模拟），
 *   管理员可在发件箱手动触发重发，配置好邮件服务后自动真实投递。
 */
@Service
public class ReportMailService {

    @Autowired private JdbcTemplate db;
    @Autowired private ReportService report;
    @Autowired(required = false) private JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailFrom;
    @Value("${app.name:ERP 企业管理系统}")
    private String appName;

    /** 每 10 分钟扫描一次到期订阅 */
    @Scheduled(fixedDelay = 600000, initialDelay = 60000)
    public void scanSubscriptions() {
        try {
            List<Map<String,Object>> subs = db.queryForList(
                "SELECT * FROM sys_report_subscription WHERE enabled=1 AND (last_sent_at IS NULL OR " +
                "(frequency='daily' AND last_sent_at < DATE_SUB(NOW(), INTERVAL 1 DAY)) OR " +
                "(frequency='weekly' AND last_sent_at < DATE_SUB(NOW(), INTERVAL 7 DAY)))");
            for (Map<String,Object> s : subs) {
                try { processSubscription(s); } catch (Exception e) { System.err.println("[report-mail] 订阅 " + s.get("id") + " 处理失败: " + e.getMessage()); }
            }
        } catch (Exception e) { /* 表不存在等静默 */ }
    }

    private void processSubscription(Map<String,Object> sub) {
        Long subId = ((Number) sub.get("id")).longValue();
        String email = String.valueOf(sub.get("email"));
        String type = String.valueOf(sub.get("report_type"));
        String period = new SimpleDateFormat("yyyy-MM").format(new Date());
        String subject;
        String body;
        if ("finance".equals(type)) {
            subject = appName + " 财务报表（" + period + "）";
            body = buildFinanceBody(period);
        } else if ("weekly".equals(type)) {
            subject = appName + " 经营周报（" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + "）";
            body = buildDailyBody();
        } else if ("stocktake".equals(type)) {
            subject = appName + " 盘点盈亏分析（" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + "）";
            body = buildStocktakeBody();
        } else if ("workorder".equals(type)) {
            subject = appName + " 工单成本报告（" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + "）";
            body = buildWorkorderBody();
        } else if ("aging".equals(type)) {
            subject = appName + " 应收账龄报告（" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + "）";
            body = buildAgingBody();
        } else {
            subject = appName + " 经营日报（" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + "）";
            body = buildDailyBody();
        }
        db.update("INSERT INTO sys_report_outbox(subscription_id,email,subject,body,status) VALUES(?,?,?,?,'pending')", subId, email, subject, body);
        Long outboxId = db.queryForObject("SELECT id FROM sys_report_outbox WHERE subscription_id=? ORDER BY id DESC LIMIT 1", Long.class, subId);
        if (outboxId != null) sendOutboxInternal(outboxId);
        db.update("UPDATE sys_report_subscription SET last_sent_at=NOW() WHERE id=?", subId);
    }

    /** 发送指定发件箱条目；未配置邮件服务时标记 simulated */
    public String sendOutbox(Long outboxId) {
        return sendOutboxInternal(outboxId);
    }

    private String sendOutboxInternal(Long outboxId) {
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM sys_report_outbox WHERE id=?", outboxId);
        if (rows.isEmpty()) return "发件箱条目不存在";
        Map<String,Object> o = rows.get(0);
        if (mailSender == null || mailFrom == null || mailFrom.isEmpty()) {
            db.update("UPDATE sys_report_outbox SET status='simulated', error_msg='未配置邮件服务(spring.mail.*)，已模拟生成', sent_at=NOW() WHERE id=?", outboxId);
            return "邮件服务未配置，报表已模拟生成（配置 spring.mail.* 后可真实投递）";
        }
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper h = new MimeMessageHelper(msg, false, "UTF-8");
            h.setFrom(mailFrom);
            h.setTo(String.valueOf(o.get("email")));
            h.setSubject(String.valueOf(o.get("subject")));
            h.setText(String.valueOf(o.get("body")), true);
            mailSender.send(msg);
            db.update("UPDATE sys_report_outbox SET status='sent', error_msg=NULL, sent_at=NOW() WHERE id=?", outboxId);
            return "邮件已发送";
        } catch (Exception e) {
            db.update("UPDATE sys_report_outbox SET status='failed', error_msg=?, sent_at=NOW() WHERE id=?",
                e.getMessage() == null ? e.toString() : e.getMessage(), outboxId);
            return "发送失败: " + e.getMessage();
        }
    }

    private String buildDailyBody() {
        Map<String,Object> d = report.dashboard();
        @SuppressWarnings("unchecked")
        Map<String,Object> stats = (Map<String,Object>) d.getOrDefault("stats", new java.util.HashMap<>());
        StringBuilder sb = new StringBuilder("<html><body style=\"font-family:sans-serif;\">");
        sb.append("<h2>").append(appName).append(" 经营日报</h2>");
        sb.append("<p>生成时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm").format(new Date())).append("</p>");
        sb.append("<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
        sb.append("<tr><th>指标</th><th>数值</th></tr>");
        sb.append("<tr><td>累计销售额</td><td>").append(stats.getOrDefault("totalSales", "")).append("</td></tr>");
        sb.append("<tr><td>销售订单数</td><td>").append(stats.getOrDefault("totalOrders", "")).append("</td></tr>");
        sb.append("<tr><td>客户总数</td><td>").append(stats.getOrDefault("totalCustomers", "")).append("</td></tr>");
        sb.append("<tr><td>累计采购额</td><td>").append(stats.getOrDefault("totalPurchase", "")).append("</td></tr>");
        sb.append("<tr><td>生产产量</td><td>").append(stats.getOrDefault("productionOutput", "")).append("</td></tr>");
        sb.append("<tr><td>本年净利润</td><td>").append(stats.getOrDefault("netProfit", "")).append("</td></tr>");
        sb.append("</table></body></html>");
        return sb.toString();
    }

    private String buildFinanceBody(String period) {
        Map<String,Object> bs = report.balanceSheet(period);
        Map<String,Object> is = report.incomeStatement(period);
        StringBuilder sb = new StringBuilder("<html><body style=\"font-family:sans-serif;\">");
        sb.append("<h2>").append(appName).append(" 财务报表（").append(period).append("）</h2>");
        sb.append("<h3>资产负债表</h3><table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
        sb.append("<tr><td>资产合计</td><td>").append(bs.getOrDefault("assets", "")).append("</td></tr>");
        sb.append("<tr><td>负债合计</td><td>").append(bs.getOrDefault("liabilities", "")).append("</td></tr>");
        sb.append("<tr><td>所有者权益</td><td>").append(bs.getOrDefault("equity", "")).append("</td></tr>");
        sb.append("</table>");
        sb.append("<h3>利润表</h3><table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
        sb.append("<tr><td>营业收入</td><td>").append(is.getOrDefault("revenue", "")).append("</td></tr>");
        sb.append("<tr><td>营业成本</td><td>").append(is.getOrDefault("cost", "")).append("</td></tr>");
        sb.append("<tr><td>净利润</td><td>").append(is.getOrDefault("net_profit", "")).append("</td></tr>");
        sb.append("</table></body></html>");
        return sb.toString();
    }

    /** 盘点盈亏分析报表正文（v5.31 订阅扩展） */
    private String buildStocktakeBody() {
        StringBuilder sb = new StringBuilder("<html><body style=\"font-family:sans-serif;\">");
        sb.append("<h2>").append(appName).append(" 盘点盈亏分析</h2>");
        sb.append("<p>生成时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm").format(new Date())).append("</p>");
        try {
            Map<String,Object> sum = db.queryForList(
                "SELECT COUNT(DISTINCT check_no) docs, COUNT(*) checks, " +
                "COALESCE(SUM(CASE WHEN diff_qty>0 THEN diff_amount ELSE 0 END),0) gain, " +
                "COALESCE(SUM(CASE WHEN diff_qty<0 THEN -diff_amount ELSE 0 END),0) loss FROM trade_stock_check").get(0);
            sb.append("<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
            sb.append("<tr><th>指标</th><th>数值</th></tr>");
            sb.append("<tr><td>盘点单数</td><td>").append(sum.get("docs")).append("</td></tr>");
            sb.append("<tr><td>明细笔数</td><td>").append(sum.get("checks")).append("</td></tr>");
            sb.append("<tr><td>累计盘盈金额</td><td>").append(sum.get("gain")).append("</td></tr>");
            sb.append("<tr><td>累计盘亏金额</td><td>").append(sum.get("loss")).append("</td></tr>");
            sb.append("</table>");
            List<Map<String,Object>> top = db.queryForList(
                "SELECT product_code, MAX(product_name) product_name, COUNT(*) cnt, COALESCE(SUM(ABS(diff_amount)),0) total " +
                "FROM trade_stock_check WHERE diff_qty<>0 GROUP BY product_code ORDER BY total DESC LIMIT 8");
            if (!top.isEmpty()) {
                sb.append("<h3>TOP 差异商品</h3><table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
                sb.append("<tr><th>商品</th><th>次数</th><th>差异总额</th></tr>");
                for (Map<String,Object> t : top) {
                    sb.append("<tr><td>").append(t.get("product_name")).append("</td><td>").append(t.get("cnt")).append("</td><td>").append(t.get("total")).append("</td></tr>");
                }
                sb.append("</table>");
            }
        } catch (Exception e) { sb.append("<p>盘点数据暂不可用：").append(e.getMessage()).append("</p>"); }
        sb.append("</body></html>");
        return sb.toString();
    }

    /** 工单成本报告正文（v5.31 订阅扩展） */
    private String buildWorkorderBody() {
        StringBuilder sb = new StringBuilder("<html><body style=\"font-family:sans-serif;\">");
        sb.append("<h2>").append(appName).append(" 工单成本报告</h2>");
        sb.append("<p>生成时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm").format(new Date())).append("</p>");
        try {
            List<Map<String,Object>> wos = db.queryForList("SELECT work_order_no, product_name, actual_qty, order_status FROM prod_work_order ORDER BY id DESC LIMIT 200");
            // 领料成本聚合
            Map<String, java.math.BigDecimal> matMap = new LinkedHashMap<>();
            for (Map<String,Object> r : db.queryForList(
                    "SELECT r.ref_work_order wo, COALESCE(SUM(r.actual_req_qty * COALESCE(ib.c, g.purchase_price, 0)),0) c " +
                    "FROM prod_material_requisition r " +
                    "LEFT JOIN (SELECT product_code, AVG(unit_cost) c FROM trade_inventory_balance WHERE unit_cost>0 GROUP BY product_code) ib ON ib.product_code=r.product_code " +
                    "LEFT JOIN trade_goods_main g ON g.product_code=r.product_code GROUP BY r.ref_work_order")) {
                matMap.put(String.valueOf(r.get("wo")), new java.math.BigDecimal(r.get("c").toString()));
            }
            double labor = 15, overhead = 8;
            try { labor = Double.parseDouble(db.queryForList("SELECT config_value FROM sys_config WHERE config_key='labor_rate'").get(0).get("config_value").toString()); } catch (Exception ignored) {}
            try { overhead = Double.parseDouble(db.queryForList("SELECT config_value FROM sys_config WHERE config_key='overhead_rate'").get(0).get("config_value").toString()); } catch (Exception ignored) {}
            java.math.BigDecimal totCost = java.math.BigDecimal.ZERO;
            int lossCnt = 0;
            sb.append("<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
            sb.append("<tr><th>工单</th><th>产品</th><th>产量</th><th>总成本</th><th>状态</th></tr>");
            int shown = 0;
            for (Map<String,Object> w : wos) {
                double qty = Double.parseDouble(String.valueOf(w.getOrDefault("actual_qty", "0")));
                java.math.BigDecimal cost = matMap.getOrDefault(String.valueOf(w.get("work_order_no")), java.math.BigDecimal.ZERO)
                    .add(new java.math.BigDecimal(qty * (labor + overhead))).setScale(2, java.math.RoundingMode.HALF_UP);
                totCost = totCost.add(cost);
                if (shown < 10) {
                    sb.append("<tr><td>").append(w.get("work_order_no")).append("</td><td>").append(w.get("product_name")).append("</td><td>").append(w.get("actual_qty")).append("</td><td>").append(cost).append("</td><td>").append(w.get("order_status")).append("</td></tr>");
                    shown++;
                }
            }
            sb.append("</table>");
            sb.append("<p><b>工单数：").append(wos.size()).append(" · 总成本：").append(totCost).append("</b>（人工 ¥").append(labor).append("/件 + 制费 ¥").append(overhead).append("/件，费率见系统参数）</p>");
        } catch (Exception e) { sb.append("<p>工单数据暂不可用：").append(e.getMessage()).append("</p>"); }
        sb.append("</body></html>");
        return sb.toString();
    }

    /** 应收账龄报告正文（v5.31 订阅扩展） */
    private String buildAgingBody() {
        StringBuilder sb = new StringBuilder("<html><body style=\"font-family:sans-serif;\">");
        sb.append("<h2>").append(appName).append(" 应收账龄报告</h2>");
        sb.append("<p>生成时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm").format(new Date())).append("</p>");
        try {
            String bucketSql = "SELECT CASE WHEN DATEDIFF(CURDATE(), due_date) <= 30 THEN '1.逾期≤30天' " +
                "WHEN DATEDIFF(CURDATE(), due_date) <= 60 THEN '2.逾期31-60天' " +
                "WHEN DATEDIFF(CURDATE(), due_date) <= 90 THEN '3.逾期61-90天' " +
                "ELSE '4.逾期90天以上' END bucket, COUNT(*) cnt, COALESCE(SUM(remain_amount),0) amt " +
                "FROM finance_receivable_main WHERE remain_amount>0 AND due_date<CURDATE() GROUP BY bucket ORDER BY bucket";
            sb.append("<h3>逾期账龄分布</h3><table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
            sb.append("<tr><th>账龄段</th><th>笔数</th><th>未收金额</th></tr>");
            for (Map<String,Object> r : db.queryForList(bucketSql)) {
                sb.append("<tr><td>").append(String.valueOf(r.get("bucket")).substring(2)).append("</td><td>").append(r.get("cnt")).append("</td><td>").append(r.get("amt")).append("</td></tr>");
            }
            sb.append("</table>");
            List<Map<String,Object>> top = db.queryForList(
                "SELECT customer_name, COUNT(*) cnt, COALESCE(SUM(remain_amount),0) amt, MAX(DATEDIFF(CURDATE(), due_date)) max_days " +
                "FROM finance_receivable_main WHERE remain_amount>0 AND due_date<CURDATE() GROUP BY customer_name ORDER BY amt DESC LIMIT 8");
            if (!top.isEmpty()) {
                sb.append("<h3>逾期金额 TOP 客户</h3><table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
                sb.append("<tr><th>客户</th><th>笔数</th><th>未收金额</th><th>最长逾期</th></tr>");
                for (Map<String,Object> t : top) {
                    sb.append("<tr><td>").append(t.get("customer_name")).append("</td><td>").append(t.get("cnt")).append("</td><td>").append(t.get("amt")).append("</td><td>").append(t.get("max_days")).append("天</td></tr>");
                }
                sb.append("</table>");
            }
            sb.append("<p>请及时跟进催收（催收管理中心支持登记催收记录与打印催款函）。</p>");
        } catch (Exception e) { sb.append("<p>账龄数据暂不可用：").append(e.getMessage()).append("</p>"); }
        sb.append("</body></html>");
        return sb.toString();
    }
}
