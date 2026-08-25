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
}
