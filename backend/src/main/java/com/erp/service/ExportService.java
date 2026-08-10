package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class ExportService {

    @Autowired private JdbcTemplate db;
    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");

    /** 导出表数据为 CSV，使用与 DataController 相同的安全校验 */
    public byte[] exportToCsv(String tableName) {
        // 🔒 SQL 注入防护
        if (!VALID.matcher(tableName).matches()) {
            return ("Invalid table name").getBytes(StandardCharsets.UTF_8);
        }
        try {
            // 验证表是否存在
            db.queryForObject("SELECT COUNT(*) FROM " + tableName, Integer.class);

            List<Map<String,Object>> meta = db.queryForList("SHOW COLUMNS FROM " + tableName);
            List<String> cols = new ArrayList<>();
            for (Map<String,Object> m : meta) cols.add(String.valueOf(m.get("Field")));

            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM " + tableName + " LIMIT 10000");

            StringBuilder csv = new StringBuilder();
            csv.append("ERP Export: ").append(tableName).append(" | ").append(LocalDateTime.now()).append("\n");
            csv.append(String.join(",", cols)).append("\n");

            for (Map<String,Object> row : rows) {
                List<String> vals = new ArrayList<>();
                for (String c : cols) {
                    Object v = row.get(c);
                    vals.add(v != null ? "\"" + v.toString().replace("\"", "\"\"") + "\"" : "");
                }
                csv.append(String.join(",", vals)).append("\n");
            }
            return csv.toString().getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            return ("Export error: " + e.getMessage()).getBytes(StandardCharsets.UTF_8);
        }
    }
}
