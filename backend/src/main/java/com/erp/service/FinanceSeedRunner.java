package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class FinanceSeedRunner implements ApplicationRunner {

    @Autowired private JdbcTemplate db;

    private static final Map<String, String> CODE_TO_FILE = new LinkedHashMap<>();
    static {
        CODE_TO_FILE.put("inv_semifinished", "seed-templates/1_inv_semifinished.xlsx");
        CODE_TO_FILE.put("inv_finished", "seed-templates/2_inv_finished.xlsx");
        CODE_TO_FILE.put("inv_material", "seed-templates/3_inv_material.xlsx");
        CODE_TO_FILE.put("pay_chengbo", "seed-templates/4_pay_chengbo.xlsx");
        CODE_TO_FILE.put("pay_chuanrong", "seed-templates/5_pay_chuanrong.xlsx");
        CODE_TO_FILE.put("pay_zhongyiheng", "seed-templates/6_pay_zhongyiheng.xlsx");
        CODE_TO_FILE.put("exp_chengbo", "seed-templates/7_exp_chengbo.xlsx");
        CODE_TO_FILE.put("exp_chuanrong", "seed-templates/8_exp_chuanrong.xlsx");
        CODE_TO_FILE.put("exp_zhongyiheng", "seed-templates/9_exp_zhongyiheng.xlsx");
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM fin_template", Integer.class);
            if (cnt == null || cnt == 0) return;
        } catch (Exception e) {
            return;
        }
        for (Map.Entry<String, String> e : CODE_TO_FILE.entrySet()) {
            try {
                List<Map<String, Object>> rows = db.queryForList(
                    "SELECT id, template_file FROM fin_template WHERE code=?", e.getKey());
                if (rows.isEmpty()) continue;
                if (rows.get(0).get("template_file") != null) continue;
                ClassPathResource res = new ClassPathResource(e.getValue());
                if (!res.exists()) continue;
                try (InputStream in = res.getInputStream()) {
                    byte[] bytes = StreamUtils.copyToByteArray(in);
                    db.update("UPDATE fin_template SET template_file=? WHERE code=?", bytes, e.getKey());
                }
            } catch (Exception ignored) {}
        }
    }
}
