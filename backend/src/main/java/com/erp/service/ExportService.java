package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class ExportService {

    @Autowired private JdbcTemplate db;
    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");

    private static final Map<String, String> COL_CN_MAP = new HashMap<>();
    static {
        COL_CN_MAP.put("id", "序号ID");
        COL_CN_MAP.put("sales_no", "销售单号");
        COL_CN_MAP.put("purchase_no", "采购单号");
        COL_CN_MAP.put("in_no", "入库单号");
        COL_CN_MAP.put("out_no", "出库单号");
        COL_CN_MAP.put("work_order_no", "加工单号");
        COL_CN_MAP.put("req_no", "领料单号");
        COL_CN_MAP.put("settle_no", "结算单号");
        COL_CN_MAP.put("approval_no", "审批编号");
        COL_CN_MAP.put("voucher_no", "凭证字号");
        COL_CN_MAP.put("customer_code", "客户编号");
        COL_CN_MAP.put("customer_name", "客户名称");
        COL_CN_MAP.put("supplier_code", "供应商编号");
        COL_CN_MAP.put("supplier_name", "供应商名称");
        COL_CN_MAP.put("product_code", "商品编码");
        COL_CN_MAP.put("product_name", "商品名称");
        COL_CN_MAP.put("spec_model", "规格型号");
        COL_CN_MAP.put("spec", "规格");
        COL_CN_MAP.put("qty", "数量");
        COL_CN_MAP.put("unit", "单位");
        COL_CN_MAP.put("unit_price", "单价");
        COL_CN_MAP.put("amount", "金额");
        COL_CN_MAP.put("total_amount", "总金额");
        COL_CN_MAP.put("unit_cost", "单位成本");
        COL_CN_MAP.put("total_value", "总价值");
        COL_CN_MAP.put("sales_date", "销售日期");
        COL_CN_MAP.put("purchase_date", "采购日期");
        COL_CN_MAP.put("in_date", "入库日期");
        COL_CN_MAP.put("out_date", "出库日期");
        COL_CN_MAP.put("start_date", "开始日期");
        COL_CN_MAP.put("end_date", "结束日期");
        COL_CN_MAP.put("create_date", "创建日期");
        COL_CN_MAP.put("sales_person", "业务员");
        COL_CN_MAP.put("buyer", "采购员");
        COL_CN_MAP.put("handler", "经办人");
        COL_CN_MAP.put("operator", "操作员");
        COL_CN_MAP.put("status", "状态");
        COL_CN_MAP.put("sales_status", "销售状态");
        COL_CN_MAP.put("purchase_status", "采购状态");
        COL_CN_MAP.put("shipping_status", "发货状态");
        COL_CN_MAP.put("approval_status", "审批状态");
        COL_CN_MAP.put("warehouse", "仓库");
        COL_CN_MAP.put("location", "库位");
        COL_CN_MAP.put("remark", "备注");
        COL_CN_MAP.put("subject_code", "科目编码");
        COL_CN_MAP.put("subject_name", "科目名称");
        COL_CN_MAP.put("debit_amount", "借方金额");
        COL_CN_MAP.put("credit_amount", "贷方金额");
        COL_CN_MAP.put("begin_balance", "期初余额");
        COL_CN_MAP.put("end_balance", "期末余额");
        COL_CN_MAP.put("period", "会计期间");
        COL_CN_MAP.put("emp_no", "工号");
        COL_CN_MAP.put("emp_name", "姓名");
        COL_CN_MAP.put("department", "部门");
        COL_CN_MAP.put("position", "岗位");
        COL_CN_MAP.put("base_salary", "基本工资");
        COL_CN_MAP.put("net_salary", "实发工资");
        COL_CN_MAP.put("receivable_no", "应收单号");
        COL_CN_MAP.put("payable_no", "应付单号");
        COL_CN_MAP.put("received_amount", "已收金额");
        COL_CN_MAP.put("paid_amount", "已付金额");
        COL_CN_MAP.put("remain_amount", "剩余金额");
    }

    /** 导出表数据为 CSV（支持中文列名与 UTF-8 BOM） */
    public byte[] exportToCsv(String tableName) {
        // 🔒 SQL 注入防护
        if (!VALID.matcher(tableName).matches()) {
            return ("无效数据表名: " + tableName).getBytes(StandardCharsets.UTF_8);
        }
        try {
            db.queryForObject("SELECT COUNT(*) FROM " + tableName, Integer.class);

            List<String> cols = new ArrayList<>();
            List<String> cnHeaderCols = new ArrayList<>();

            try {
                List<Map<String,Object>> fullMeta = db.queryForList("SHOW FULL COLUMNS FROM " + tableName);
                for (Map<String,Object> m : fullMeta) {
                    String field = String.valueOf(m.get("Field"));
                    cols.add(field);
                    String comment = m.get("Comment") != null ? String.valueOf(m.get("Comment")).trim() : "";
                    if (!comment.isEmpty()) {
                        cnHeaderCols.add(comment + " (" + field + ")");
                    } else {
                        String mappedCn = COL_CN_MAP.getOrDefault(field, field);
                        cnHeaderCols.add(mappedCn.equals(field) ? field : mappedCn + " (" + field + ")");
                    }
                }
            } catch (Exception e) {
                List<Map<String,Object>> meta = db.queryForList("SHOW COLUMNS FROM " + tableName);
                for (Map<String,Object> m : meta) {
                    String field = String.valueOf(m.get("Field"));
                    cols.add(field);
                    String mappedCn = COL_CN_MAP.getOrDefault(field, field);
                    cnHeaderCols.add(mappedCn.equals(field) ? field : mappedCn + " (" + field + ")");
                }
            }

            List<Map<String,Object>> rows = db.queryForList("SELECT * FROM " + tableName + " LIMIT 10000");

            StringBuilder csv = new StringBuilder();
            String nowStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            csv.append("ERP企业管理系统数据导出 - 数据表: ").append(tableName).append(" | 导出时间: ").append(nowStr).append("\n");
            csv.append(String.join(",", cnHeaderCols)).append("\n");

            for (Map<String,Object> row : rows) {
                List<String> vals = new ArrayList<>();
                for (String c : cols) {
                    Object v = row.get(c);
                    vals.add(v != null ? "\"" + v.toString().replace("\"", "\"\"") + "\"" : "");
                }
                csv.append(String.join(",", vals)).append("\n");
            }

            // UTF-8 BOM (\uFEFF) 保证 Windows Excel 打开 CSV 时中文编码正常无乱码
            byte[] bom = new byte[] { (byte)0xEF, (byte)0xBB, (byte)0xBF };
            byte[] contentBytes = csv.toString().getBytes(StandardCharsets.UTF_8);
            byte[] result = new byte[bom.length + contentBytes.length];
            System.arraycopy(bom, 0, result, 0, bom.length);
            System.arraycopy(contentBytes, 0, result, bom.length, contentBytes.length);
            return result;
        } catch (Exception e) {
            return ("导出数据失败: " + e.getMessage()).getBytes(StandardCharsets.UTF_8);
        }
    }
}
