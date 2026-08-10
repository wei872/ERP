package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class ClosingService {

    @Autowired private JdbcTemplate db;

    /** 月末结账 — 结转损益类科目到"本年利润 4104"，写凭证主表+明细+清零损益余额+净利润落库 */
    @Transactional
    public void monthEndClose(String period) {
        String opCode = "CLOSE-" + System.currentTimeMillis();
        // 期间结束日 = 下个月1号
        String nextPeriodFirst = period + "-01";

        // 1. 收入类科目（6开头，6开头会计科目一般是损益类，本系统约定 6xxx = 损益）
        List<Map<String,Object>> incomeRows = db.queryForList(
            "SELECT subject_code, subject_name, end_balance FROM account_subject_balance " +
            "WHERE period=? AND subject_code LIKE '6%' AND subject_code NOT IN ('6601','6701') AND credit_amount > 0 ORDER BY subject_code", period);

        // 2. 费用类科目（subject_code 6601/6701/营业成本/销售费用/管理费用等借方科目；为简化，这里取 6 开头且 debit_amount > 0）
        List<Map<String,Object>> expenseRows = db.queryForList(
            "SELECT subject_code, subject_name, end_balance FROM account_subject_balance " +
            "WHERE period=? AND subject_code LIKE '6%' AND debit_amount > 0 ORDER BY subject_code", period);

        if (incomeRows.isEmpty() && expenseRows.isEmpty()) {
            db.update("INSERT INTO sys_month_end_op(op_code,month_period,month_end_date,month_end_status,operator,remark) VALUES(?,?,DATE_ADD(?,INTERVAL 1 MONTH),'已完成','系统',?)",
                opCode, period, period, "无收支数据");
            return;
        }

        // 3. 结转收入凭证：借 各收入科目 贷 4104 本年利润
        if (!incomeRows.isEmpty()) {
            String voucherNo = opCode + "-INC";
            BigDecimal totalCredit = BigDecimal.ZERO;
            int lineNo = 0;
            List<Object[]> detailBatch = new ArrayList<>();
            for (Map<String,Object> r : incomeRows) {
                String code = String.valueOf(r.get("subject_code"));
                String name = String.valueOf(r.get("subject_name"));
                BigDecimal amt = toBD(r.get("end_balance"));
                if (amt.signum() <= 0) continue;
                totalCredit = totalCredit.add(amt);
                detailBatch.add(new Object[]{ voucherNo, ++lineNo, code, name, BigDecimal.ZERO, amt, "结转收入-" + period });
            }
            detailBatch.add(new Object[]{ voucherNo, ++lineNo, "4104", "本年利润", totalCredit, BigDecimal.ZERO, "结转收入到本年利润-" + period });
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',DATE_ADD(?,INTERVAL 1 MONTH),?,?,?,?,'已审核','月结结转收入')",
                voucherNo, nextPeriodFirst, period, totalCredit, totalCredit, "系统");
            for (Object[] d : detailBatch) {
                db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,?,?,?,?,?,?)", d);
            }
        }

        // 4. 结转费用凭证：借 4104 贷 各费用科目
        if (!expenseRows.isEmpty()) {
            String voucherNo = opCode + "-EXP";
            BigDecimal totalDebit = BigDecimal.ZERO;
            int lineNo = 0;
            List<Object[]> detailBatch = new ArrayList<>();
            for (Map<String,Object> r : expenseRows) {
                String code = String.valueOf(r.get("subject_code"));
                String name = String.valueOf(r.get("subject_name"));
                BigDecimal amt = toBD(r.get("end_balance"));
                if (amt.signum() <= 0) continue;
                totalDebit = totalDebit.add(amt);
                detailBatch.add(new Object[]{ voucherNo, ++lineNo, code, name, amt, BigDecimal.ZERO, "结转费用-" + period });
            }
            detailBatch.add(new Object[]{ voucherNo, ++lineNo, "4104", "本年利润", BigDecimal.ZERO, totalDebit, "结转费用到本年利润-" + period });
            db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',DATE_ADD(?,INTERVAL 1 MONTH),?,?,?,?,'已审核','月结结转费用')",
                voucherNo, nextPeriodFirst, period, totalDebit, totalDebit, "系统");
            for (Object[] d : detailBatch) {
                db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,?,?,?,?,?,?)", d);
            }
        }

        // 5. 计算净利润 = 收入 - 费用
        BigDecimal revenue = db.queryForObject(
            "SELECT COALESCE(SUM(credit_amount),0) FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%'",
            BigDecimal.class, period);
        BigDecimal expense = db.queryForObject(
            "SELECT COALESCE(SUM(debit_amount),0) FROM account_subject_balance WHERE period=? AND subject_code LIKE '6%'",
            BigDecimal.class, period);
        BigDecimal profit = revenue.subtract(expense).setScale(2, RoundingMode.HALF_UP);

        // 6. 清零损益类科目本期余额（已结转）
        db.update("UPDATE account_subject_balance SET end_balance=0, remark='已结账' WHERE period=? AND subject_code LIKE '6%'", period);

        // 7. 把净利润计入 4104 未分配利润（如该期间无 4104 余额则插入）
        List<Map<String,Object>> ret = db.queryForList("SELECT id FROM account_subject_balance WHERE subject_code='4104' AND period=?", period);
        BigDecimal four104End = profit;
        if (ret.isEmpty()) {
            db.update("INSERT INTO account_subject_balance(subject_code,subject_name,period,begin_balance,debit_amount,credit_amount,end_balance,remark) VALUES('4104','本年利润',?,0,0,?,?,'月结转入净利润')",
                period, profit.max(BigDecimal.ZERO), four104End);
        } else {
            // 借方累计费用 / 贷方累计收入 已冲销在 4104 上
            db.update("UPDATE account_subject_balance SET credit_amount=credit_amount+?, end_balance=end_balance+? WHERE subject_code='4104' AND period=?",
                profit.max(BigDecimal.ZERO), profit, period);
        }

        // 8. 把本期所有科目 end_balance 复制为下期 begin_balance（损益类已被清零）
        String nextPeriod = nextPeriod(period);
        // 同科目已存在下期记录则 UPDATE begin_balance，不存在则 INSERT
        List<Map<String,Object>> allSubjects = db.queryForList(
            "SELECT subject_code, subject_name, end_balance FROM account_subject_balance WHERE period=? AND subject_code NOT LIKE '6%'", period);
        for (Map<String,Object> r : allSubjects) {
            String code = String.valueOf(r.get("subject_code"));
            String name = String.valueOf(r.get("subject_name"));
            BigDecimal end = toBD(r.get("end_balance"));
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM account_subject_balance WHERE subject_code=? AND period=?", Integer.class, code, nextPeriod);
            if (cnt != null && cnt > 0) {
                db.update("UPDATE account_subject_balance SET begin_balance=?, end_balance=begin_balance+debit_amount-credit_amount WHERE subject_code=? AND period=?",
                    end, code, nextPeriod);
            } else {
                db.update("INSERT INTO account_subject_balance(subject_code,subject_name,period,begin_balance,debit_amount,credit_amount,end_balance) VALUES(?,?,?,?,0,0,?)",
                    code, name, nextPeriod, end, end);
            }
        }

        // 9. 记录月结操作（净利润落入 remark）
        db.update("INSERT INTO sys_month_end_op(op_code,month_period,month_end_date,month_end_status,operator,remark) VALUES(?,?,DATE_ADD(?,INTERVAL 1 MONTH),'已完成','系统',?)",
            opCode, period, period, "净利润=" + profit.toPlainString() + " 下期期初已结转");
    }

    /** 年结处理 */
    @Transactional
    public void yearEndClose(String year) {
        BigDecimal yearProfit = BigDecimal.ZERO;
        for (int m = 1; m <= 12; m++) {
            String period = year + "-" + String.format("%02d", m);
            try {
                monthEndClose(period);
                BigDecimal p = db.queryForObject(
                    "SELECT COALESCE(end_balance,0) FROM account_subject_balance WHERE period=? AND subject_code='4104'",
                    BigDecimal.class, period);
                if (p != null) yearProfit = yearProfit.add(p);
            } catch (Exception e) {
                System.err.println("Year close month " + period + " failed: " + e.getMessage());
            }
        }
        // 年结：4104 本年利润结转到 4103 未分配利润
        String nextYear = String.valueOf(Integer.parseInt(year) + 1);
        String janPeriod = nextYear + "-01";
        BigDecimal four104Balance = db.queryForObject(
            "SELECT COALESCE(SUM(end_balance),0) FROM account_subject_balance WHERE subject_code='4104' AND period BETWEEN ? AND ?",
            BigDecimal.class, year + "-01", year + "-12");
        if (four104Balance == null) four104Balance = BigDecimal.ZERO;
        if (four104Balance.signum() != 0) {
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM account_subject_balance WHERE subject_code='4103' AND period=?", Integer.class, janPeriod);
            if (cnt != null && cnt > 0) {
                db.update("UPDATE account_subject_balance SET begin_balance=begin_balance+?, end_balance=end_balance+? WHERE subject_code='4103' AND period=?",
                    four104Balance, four104Balance, janPeriod);
            } else {
                db.update("INSERT INTO account_subject_balance(subject_code,subject_name,period,begin_balance,debit_amount,credit_amount,end_balance) VALUES('4103','未分配利润',?,?,0,?,?)",
                    janPeriod, four104Balance, four104Balance, four104Balance);
            }
            // 清零 4104 年底余额
            db.update("UPDATE account_subject_balance SET end_balance=0 WHERE subject_code='4104' AND period BETWEEN ? AND ?",
                year + "-01", year + "-12");
        }
        db.update("INSERT INTO sys_month_end_op(op_code,month_period,month_end_date,month_end_status,operator,remark) VALUES(?,?,DATE_ADD(CONCAT(?,'-12-31'),INTERVAL 1 DAY),'已完成','系统',?)",
            "YCLOSE-"+System.currentTimeMillis(), year, year, "年结完成,净利润=" + yearProfit.setScale(2, RoundingMode.HALF_UP).toPlainString() + " 4104→4103已结转");
    }

    private String nextPeriod(String period) {
        try {
            String[] parts = period.split("-");
            int y = Integer.parseInt(parts[0]), m = Integer.parseInt(parts[1]);
            if (m == 12) { y++; m = 1; } else { m++; }
            return y + "-" + String.format("%02d", m);
        } catch (Exception e) { return period; }
    }

    private BigDecimal toBD(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }
}