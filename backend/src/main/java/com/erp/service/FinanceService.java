package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class FinanceService {
    @Autowired private JdbcTemplate db;
    @Autowired private NoRuleService noRule;

    private static final Set<String> CREDIT_SUBJECTS = new HashSet<>(Arrays.asList(
        "2001","2201","2202","2203","2241","2501","2502","2701","4001","4002","4101","4103","4104","6001","6051","6301"
    ));

    @Transactional
    public void generateVoucherFromSale(Long saleId) throws Exception {
        Map<String,Object> sale = db.queryForMap("SELECT * FROM trade_sales_main WHERE id=?", saleId);
        Object amtObj = sale.get("total_amount");
        if (amtObj == null) return;
        BigDecimal amt = toBD(amtObj);
        if (amt.compareTo(BigDecimal.ZERO) <= 0) return;
        String vn = "VZ-" + System.currentTimeMillis();
        String period = new SimpleDateFormat("yyyy-MM").format(new Date());
        db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,company_code) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)", vn, period, amt, amt, com.erp.config.CompanyContext.get());
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'1122','应收账款',?,0,?)", vn, amt, "销售-" + sale.get("sales_no"));
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'6001','主营业务收入',0,?,?)", vn, amt, "销售-" + sale.get("sales_no"));
        updateBalance("1122", "应收账款", amt, BigDecimal.ZERO);
        updateBalance("6001", "主营业务收入", BigDecimal.ZERO, amt);
        // 自动创建应收主表（核销基表）
        String customerCode = String.valueOf(sale.getOrDefault("customer_code",""));
        String customerName = String.valueOf(sale.getOrDefault("customer_name",""));
        String saleNo = String.valueOf(sale.getOrDefault("sales_no",""));
        String rcvNo = "RCV-" + System.currentTimeMillis();
        db.update("INSERT IGNORE INTO finance_receivable_main(receivable_no,customer_code,customer_name,total_amount,received_amount,remain_amount,due_date,status,remark) VALUES(?,?,?,?,0,?,DATE_ADD(CURDATE(),INTERVAL 30 DAY),'应收',?)",
            rcvNo, customerCode, customerName, amt, amt, "销售单:" + saleNo);
    }

    @Transactional
    public void generateVoucherFromPurchase(Long purchaseId) throws Exception {
        Map<String,Object> po = db.queryForMap("SELECT * FROM trade_purchase_main WHERE id=?", purchaseId);
        Object amtObj = po.get("total_amount");
        if (amtObj == null) return;
        BigDecimal amt = toBD(amtObj);
        if (amt.compareTo(BigDecimal.ZERO) <= 0) return;
        String vn = "VZ-" + System.currentTimeMillis();
        String period = new SimpleDateFormat("yyyy-MM").format(new Date());
        db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,company_code) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)", vn, period, amt, amt, com.erp.config.CompanyContext.get());
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'1403','原材料',?,0,?)", vn, amt, "采购-" + po.get("purchase_no"));
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'2202','应付账款',0,?,?)", vn, amt, "采购-" + po.get("purchase_no"));
        updateBalance("1403", "原材料", amt, BigDecimal.ZERO);
        updateBalance("2202", "应付账款", BigDecimal.ZERO, amt);
        // 自动创建应付主表（核销基表）
        String supplierCode = String.valueOf(po.getOrDefault("supplier_code",""));
        String supplierName = String.valueOf(po.getOrDefault("supplier_name",""));
        String purchaseNo = String.valueOf(po.getOrDefault("purchase_no",""));
        String payNo = "PAY-" + System.currentTimeMillis();
        db.update("INSERT IGNORE INTO finance_payable_main(payable_no,supplier_code,supplier_name,total_amount,paid_amount,remain_amount,due_date,status,remark) VALUES(?,?,?,?,0,?,DATE_ADD(CURDATE(),INTERVAL 30 DAY),'应付',?)",
            payNo, supplierCode, supplierName, amt, amt, "采购单:" + purchaseNo);
    }

    /** 手动录入凭证：主表+明细，并更新各科目余额（借贷必须平衡），按公司账套归档 */
    @Transactional
    public Map<String,Object> createVoucher(String voucherWord, String period, List<Map<String,Object>> lines, String preparedBy, String companyCode) throws Exception {
        if (lines == null || lines.isEmpty()) throw new RuntimeException("凭证明细不能为空");
        // 单据编号规则：优先取自定义规则（前缀+年月+流水），缺失时回退旧格式
        String vn;
        try { vn = noRule.nextNo("voucher"); } catch (Exception e) { vn = "V-" + System.currentTimeMillis(); }
        BigDecimal debitTotal = BigDecimal.ZERO, creditTotal = BigDecimal.ZERO;
        List<Object[]> detailBatch = new ArrayList<>();
        int lineNo = 0;
        for (Map<String,Object> line : lines) {
            String code = String.valueOf(line.get("subject_code"));
            String name = String.valueOf(line.get("subject_name"));
            BigDecimal d = toBD(line.get("debit_amount"));
            BigDecimal c = toBD(line.get("credit_amount"));
            debitTotal = debitTotal.add(d);
            creditTotal = creditTotal.add(c);
            detailBatch.add(new Object[]{ vn, ++lineNo, code, name, d, c, String.valueOf(line.getOrDefault("summary","")) });
            updateBalance(code, name, d, c);
        }
        if (debitTotal.compareTo(creditTotal) != 0) throw new RuntimeException("借贷不平: 借方=" + debitTotal + " 贷方=" + creditTotal);
        // 手工凭证进入审核流：待审核 → 已审核 → 已记账（自动联动凭证由系统直接置已审核）
        String cc = (companyCode == null || companyCode.trim().isEmpty()) ? "HQ" : companyCode.trim();
        db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,company_code) VALUES(?,?,CURDATE(),?,?,?,?,'待审核',?)",
            vn, voucherWord == null ? "记" : voucherWord, period == null ? new SimpleDateFormat("yyyy-MM").format(new Date()) : period, debitTotal, creditTotal, preparedBy == null ? "系统" : preparedBy, cc);
        for (Object[] d : detailBatch) {
            db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,?,?,?,?,?,?)", d);
        }
        Map<String,Object> r = new java.util.HashMap<>();
        r.put("voucher_no", vn); r.put("debit_total", debitTotal); r.put("credit_total", creditTotal);
        return r;
    }

    public void updateBalance(String code, String name, BigDecimal debit, BigDecimal credit) {
        try {
            boolean isCredit = CREDIT_SUBJECTS.contains(code);
            String period = new SimpleDateFormat("yyyy-MM").format(new Date());
            String cc = com.erp.config.CompanyContext.get();
            List<Map<String,Object>> rows = db.queryForList("SELECT begin_balance,debit_amount,credit_amount,end_balance FROM account_subject_balance WHERE subject_code=? AND period=? AND COALESCE(company_code,'HQ')=?", code, period, cc);
            if (!rows.isEmpty()) {
                BigDecimal b = new BigDecimal(rows.get(0).get("begin_balance").toString());
                BigDecimal d = new BigDecimal(rows.get(0).get("debit_amount").toString());
                BigDecimal c = new BigDecimal(rows.get(0).get("credit_amount").toString());
                d = d.add(debit); c = c.add(credit);
                BigDecimal end = isCredit ? b.subtract(d).add(c).setScale(2, RoundingMode.HALF_UP) : b.add(d).subtract(c).setScale(2, RoundingMode.HALF_UP);
                db.update("UPDATE account_subject_balance SET debit_amount=?,credit_amount=?,end_balance=? WHERE subject_code=? AND period=? AND COALESCE(company_code,'HQ')=?", d, c, end, code, period, cc);
            } else {
                BigDecimal end = isCredit ? credit.subtract(debit).setScale(2, RoundingMode.HALF_UP) : debit.subtract(credit).setScale(2, RoundingMode.HALF_UP);
                db.update("INSERT INTO account_subject_balance(subject_code,subject_name,period,begin_balance,debit_amount,credit_amount,end_balance,company_code) VALUES(?,?,?,0,?,?,?,?)", code, name, period, debit, credit, end, cc);
            }
        } catch (Exception e) { throw new RuntimeException("余额更新失败["+code+"]: " + e.getMessage(), e); }
    }

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
}
