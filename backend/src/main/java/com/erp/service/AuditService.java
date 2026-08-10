package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import javax.servlet.http.HttpServletRequest;

@Service
public class AuditService {

    @Autowired private JdbcTemplate db;

    public void log(String username, String opModule, String action, String detail, String ip) {
        try {
            db.update("INSERT INTO sys_log_operation(username,module,action,detail,ip,status,created_at) VALUES(?,?,?,?,?,'成功',NOW())",
                username, opModule, action, detail, ip);
        } catch (Exception e) {
            System.err.println("Audit log failed: " + e.getMessage());
        }
    }

    public void logLogin(String username, String ip, String status) {
        try {
            db.update("INSERT INTO sys_login_log(user_name,login_time,login_ip,login_status) VALUES(?,NOW(),?,?)",
                username, ip, status);
        } catch (Exception ignored) {}
    }

    public String getIp(HttpServletRequest req) {
        String ip = req.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) ip = req.getRemoteAddr();
        return ip != null ? ip : "unknown";
    }
}
