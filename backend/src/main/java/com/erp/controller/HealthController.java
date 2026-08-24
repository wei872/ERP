package com.erp.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import javax.servlet.http.HttpServletRequest;
import java.lang.management.ManagementFactory;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查端点（公开，供 Docker / 负载均衡探活）。
 * 返回应用存活 + 数据库连通性，不暴露任何业务数据。
 */
@RestController
public class HealthController {

    @Autowired private JdbcTemplate db;

    @GetMapping("/health")
    public Map<String,Object> health(HttpServletRequest req) {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("status", "UP");
        r.put("app", "erp-system");
        r.put("version", "5.1.0");
        boolean dbUp;
        try {
            db.queryForObject("SELECT 1", Integer.class);
            dbUp = true;
        } catch (Exception e) {
            dbUp = false;
            r.put("status", "DEGRADED");
            r.put("dbError", "数据库不可达");
        }
        r.put("database", dbUp ? "UP" : "DOWN");
        r.put("uptimeSeconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        return r;
    }
}
