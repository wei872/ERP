package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ReconciliationService {

    @Autowired private JdbcTemplate db;
    @Autowired private FinanceService finance;

    /** 应收应付核销：把指定应收单/应付单据的核销金额累加，更新 status / remain_amount。
     *  type: "receivable" | "payable", no: 单号, amount: 本次核销金额 */
    @Transactional
    public Map<String,Object> reconcile(String type, String no, BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) throw new RuntimeException("核销金额必须大于0");
        if (no == null || no.isEmpty()) throw new RuntimeException("单号不能为空");
        if ("receivable".equalsIgnoreCase(type)) {
            return reconcileReceivable(no, amount);
        } else if ("payable".equalsIgnoreCase(type)) {
            return reconcilePayable(no, amount);
        }
        throw new RuntimeException("未知核销类型: " + type);
    }

    private Map<String,Object> reconcileReceivable(String no, BigDecimal amount) {
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM finance_receivable_main WHERE receivable_no=?", no);
        if (rows.isEmpty()) throw new RuntimeException("应收单不存在: " + no);
        Map<String,Object> r = rows.get(0);
        BigDecimal total = toBD(r.get("total_amount"));
        BigDecimal oldReceived = toBD(r.get("received_amount"));
        BigDecimal received = oldReceived.add(amount);
        if (received.compareTo(total) > 0) throw new RuntimeException(
            "核销超额：总额=" + total + " 已收=" + oldReceived + " 本次=" + amount);
        BigDecimal remain = total.subtract(received).max(BigDecimal.ZERO);
        String status = remain.signum() == 0 ? "已核销" : "部分核销";
        db.update("UPDATE finance_receivable_main SET received_amount=?, remain_amount=?, status=? WHERE receivable_no=?",
            received.setScale(2, RoundingMode.HALF_UP), remain.setScale(2, RoundingMode.HALF_UP), status, no);
        // 同步应收明细落 finance_income_main（资金流水）
        db.update("INSERT INTO finance_income_main(income_no,income_type,customer_code,customer_name,amount,income_date,status,remark) VALUES(?,'回款',?,?,?,CURDATE(),'已确认',?)",
            "RCV-" + System.currentTimeMillis(),
            r.get("customer_code") == null ? "" : r.get("customer_code"),
            r.get("customer_name") == null ? "" : r.get("customer_name"),
            amount.setScale(2, RoundingMode.HALF_UP),
            "核销应收单 " + no);

        // 自动联动会计凭证 + 银行存款/应收账款科目余额
        String vn = "VZ-REC-" + System.currentTimeMillis();
        String period = new SimpleDateFormat("yyyy-MM").format(new Date());
        BigDecimal amt = amount.setScale(2, RoundingMode.HALF_UP);
        db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
            vn, period, amt, amt, "应收核销自动凭证:" + no);
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'1002','银行存款',?,0,?)", vn, amt, "核销回款-" + no);
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1122','应收账款',0,?,?)", vn, amt, "核销应收-" + no);
        finance.updateBalance("1002", "银行存款", amt, BigDecimal.ZERO);
        finance.updateBalance("1122", "应收账款", BigDecimal.ZERO, amt);

        Map<String,Object> ret = new HashMap<>();
        ret.put("no", no); ret.put("type","receivable"); ret.put("amount", amount); ret.put("received_amount", received);
        ret.put("remain_amount", remain); ret.put("status", status); ret.put("voucher_no", vn);
        return ret;
    }

    private Map<String,Object> reconcilePayable(String no, BigDecimal amount) {
        List<Map<String,Object>> rows = db.queryForList("SELECT * FROM finance_payable_main WHERE payable_no=?", no);
        if (rows.isEmpty()) throw new RuntimeException("应付单不存在: " + no);
        Map<String,Object> r = rows.get(0);
        BigDecimal total = toBD(r.get("total_amount"));
        BigDecimal oldPaid = toBD(r.get("paid_amount"));
        BigDecimal paid = oldPaid.add(amount);
        if (paid.compareTo(total) > 0) throw new RuntimeException(
            "核销超额：总额=" + total + " 已付=" + oldPaid + " 本次=" + amount);
        BigDecimal remain = total.subtract(paid).max(BigDecimal.ZERO);
        String status = remain.signum() == 0 ? "已核销" : "部分核销";
        db.update("UPDATE finance_payable_main SET paid_amount=?, remain_amount=?, status=? WHERE payable_no=?",
            paid.setScale(2, RoundingMode.HALF_UP), remain.setScale(2, RoundingMode.HALF_UP), status, no);
        // 同步应付明细落 finance_expense_main（资金流水）
        db.update("INSERT INTO finance_expense_main(expense_no,expense_type,supplier_code,supplier_name,amount,expense_date,status,remark) VALUES(?,'付款',?,?,?,CURDATE(),'已确认',?)",
            "PAY-" + System.currentTimeMillis(),
            r.get("supplier_code") == null ? "" : r.get("supplier_code"),
            r.get("supplier_name") == null ? "" : r.get("supplier_name"),
            amount.setScale(2, RoundingMode.HALF_UP),
            "核销应付单 " + no);

        // 自动联动会计凭证 + 应付账款/银行存款科目余额
        String vn = "VZ-PAY-" + System.currentTimeMillis();
        String period = new SimpleDateFormat("yyyy-MM").format(new Date());
        BigDecimal amt = amount.setScale(2, RoundingMode.HALF_UP);
        db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
            vn, period, amt, amt, "应付核销自动凭证:" + no);
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'2202','应付账款',?,0,?)", vn, amt, "核销应付-" + no);
        db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1002','银行存款',0,?,?)", vn, amt, "核销付款-" + no);
        finance.updateBalance("2202", "应付账款", amt, BigDecimal.ZERO);
        finance.updateBalance("1002", "银行存款", BigDecimal.ZERO, amt);

        Map<String,Object> ret = new HashMap<>();
        ret.put("no", no); ret.put("type","payable"); ret.put("amount", amount); ret.put("paid_amount", paid);
        ret.put("remain_amount", remain); ret.put("status", status); ret.put("voucher_no", vn);
        return ret;
    }

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
}