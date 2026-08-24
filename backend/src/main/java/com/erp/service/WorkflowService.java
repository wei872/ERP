package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class WorkflowService {

    @Autowired private JdbcTemplate db;
    @Autowired private FinanceService finance;

    /** 各审批类型的节点序列：节点名 + 指派角色（myTasks 按角色/用户名可见） */
    private static final Map<String, String[][]> NODE_TEMPLATES = new HashMap<>();
    static {
        NODE_TEMPLATES.put("采购审批", new String[][]{{"部门经理审核","procurement"},{"总经理审批","admin"},{"财务总监审批","accounting"}});
        NODE_TEMPLATES.put("费用审批", new String[][]{{"部门经理审核","admin"},{"财务审核","accounting"}});
        NODE_TEMPLATES.put("请假审批", new String[][]{{"部门经理审核","admin"},{"HR复核","hr"}});
        NODE_TEMPLATES.put("default", new String[][]{{"审批人审核","admin"}});
    }

    /** 审批通过 → 完成当前节点 task，前进到下一节点；若已是末节点则更新主表+联动业务 */
    @Transactional
    public void approve(String approvalNo, String approver, String comment) {
        Map<String,Object> row = db.queryForMap("SELECT * FROM oa_approval_main WHERE approval_no=?", approvalNo);
        // 查当前活动 task
        List<Map<String,Object>> active = db.queryForList(
            "SELECT * FROM oa_flow_task WHERE instance_no=? AND task_status='待处理' ORDER BY id ASC LIMIT 1", approvalNo);
        if (active.isEmpty()) {
            // 无活动 task（兼容旧数据），直接走原"立即通过"逻辑
            finalizeApproval(row, approver, comment);
            return;
        }
        Map<String,Object> curTask = active.get(0);
        String taskNo = String.valueOf(curTask.get("task_no"));
        db.update("UPDATE oa_flow_task SET task_status='已通过', assignee=?, complete_date=CURDATE(), remark=? WHERE task_no=?",
            approver, comment, taskNo);
        db.update("INSERT INTO oa_flow_log(log_no,instance_no,operator,action,action_date,comment) VALUES(?,?,?,?,CURDATE(),?)",
            "LOG-" + System.currentTimeMillis(), approvalNo, approver, "通过-" + curTask.get("task_name"), comment);
        // 激活下一个"未触发"task
        List<Map<String,Object>> next = db.queryForList(
            "SELECT * FROM oa_flow_task WHERE instance_no=? AND task_status='未触发' ORDER BY id ASC LIMIT 1", approvalNo);
        if (next.isEmpty()) {
            // 全部节点已通过 → 终结
            finalizeApproval(row, approver, comment);
        } else {
            db.update("UPDATE oa_flow_task SET task_status='待处理' WHERE task_no=?", next.get(0).get("task_no"));
            db.update("UPDATE oa_flow_instance SET current_node=? WHERE instance_no=?",
                next.get(0).get("task_name"), approvalNo);
        }
    }

    /** 终结审批：主表置已通过 + 流程实例置已完成 + 业务联动 */
    private void finalizeApproval(Map<String,Object> row, String approver, String comment) {
        String approvalNo = String.valueOf(row.get("approval_no"));
        db.update("UPDATE oa_approval_main SET approval_status='已通过', approver=?, remark=? WHERE approval_no=?", approver, comment, approvalNo);
        db.update("UPDATE oa_flow_instance SET current_node='审批完成', instance_status='已完成' WHERE instance_no=?", approvalNo);
        try {
            String type = String.valueOf(row.get("approval_type"));
            String refNo = extractRefNo(row);
            if ("采购审批".equals(type)) {
                db.update("UPDATE oa_purchase_approval SET approval_status='已通过', approver=? WHERE approval_no=?", approver, approvalNo);
                if (!refNo.isEmpty() && !"null".equals(refNo)) {
                    db.update("UPDATE trade_purchase_main SET purchase_status='已审批' WHERE purchase_no=?", refNo);
                }
            } else if ("费用审批".equals(type)) {
                db.update("UPDATE oa_expense_approval SET approval_status='已通过', approver=? WHERE approval_no=?", approver, approvalNo);
                BigDecimal amt = row.get("amount") != null ? new BigDecimal(row.get("amount").toString()) : BigDecimal.ZERO;
                String expNo = "EXP-" + System.currentTimeMillis();
                db.update("INSERT INTO finance_expense_main(expense_no,expense_type,amount,expense_date,status,remark) VALUES(?,?,?,CURDATE(),'已确认',?)",
                    expNo, type, amt, "审批通过自动生成: " + approvalNo);

                // 自动联动会计记账凭证 (借: 6602 管理费用, 贷: 1002 银行存款)
                if (amt.signum() > 0) {
                    String vn = "VZ-EXP-" + System.currentTimeMillis();
                    String period = new SimpleDateFormat("yyyy-MM").format(new Date());
                    db.update("INSERT INTO voucher_main(voucher_no,voucher_word,voucher_date,period,debit_total,credit_total,prepared_by,voucher_status,remark) VALUES(?,'记',CURDATE(),?,?,?,'系统','已审核',?)",
                        vn, period, amt, amt, "费用审批通过自动凭证:" + approvalNo);
                    db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,1,'6602','管理费用',?,0,?)",
                        vn, amt, "费用报销-" + approvalNo);
                    db.update("INSERT INTO voucher_detail(voucher_no,line_no,subject_code,subject_name,debit_amount,credit_amount,summary) VALUES(?,2,'1002','银行存款',0,?,?)",
                        vn, amt, "费用支出-" + expNo);
                    finance.updateBalance("6602", "管理费用", amt, BigDecimal.ZERO);
                    finance.updateBalance("1002", "银行存款", BigDecimal.ZERO, amt);
                }
            } else if ("请假审批".equals(type)) {
                db.update("UPDATE oa_leave_approval SET approval_status='已通过', approver=? WHERE approval_no=?", approver, approvalNo);
                db.update("UPDATE hr_attendance_leave SET status='已批准' WHERE approval_no=?", approvalNo);
            }
        } catch (Exception e) {
            System.err.println("Workflow finalize linkage failed for " + approvalNo + ": " + e.getMessage());
        }
    }

    /** 审批驳回 → 终止整个流程，所有待办 task 取消，写日志 */
    @Transactional
    public void reject(String approvalNo, String approver, String comment) {
        db.update("UPDATE oa_approval_main SET approval_status='已驳回', approver=?, remark=? WHERE approval_no=?", approver, comment, approvalNo);
        db.update("UPDATE oa_flow_instance SET current_node='已驳回', instance_status='已终止' WHERE instance_no=?", approvalNo);
        db.update("UPDATE oa_flow_task SET task_status='已取消' WHERE instance_no=? AND task_status='待处理'", approvalNo);
        db.update("INSERT INTO oa_flow_log(log_no,instance_no,operator,action,action_date,comment) VALUES(?,?,?,?,CURDATE(),?)",
            "LOG-" + System.currentTimeMillis(), approvalNo, approver, "驳回", comment);
        try {
            Map<String,Object> row = db.queryForMap("SELECT * FROM oa_approval_main WHERE approval_no=?", approvalNo);
            String type = String.valueOf(row.get("approval_type"));
            if ("采购审批".equals(type)) {
                db.update("UPDATE oa_purchase_approval SET approval_status='已驳回', approver=? WHERE approval_no=?", approver, approvalNo);
            } else if ("费用审批".equals(type)) {
                db.update("UPDATE oa_expense_approval SET approval_status='已驳回', approver=? WHERE approval_no=?", approver, approvalNo);
            } else if ("请假审批".equals(type)) {
                db.update("UPDATE oa_leave_approval SET approval_status='已驳回', approver=? WHERE approval_no=?", approver, approvalNo);
            }
        } catch (Exception ignored) {}
    }

    /** 提交审批 — 创建审批主表 + 流程实例 + 多级 task 节点（按角色指派） + 审批类型明细表 */
    @Transactional
    public void submit(String type, String applicant, String dept, String refNo, BigDecimal amount, String remark) {
        String no = "AP-" + System.currentTimeMillis();
        db.update("INSERT INTO oa_approval_main(approval_no,approval_type,applicant,department,ref_no,amount,submit_date,approval_status,remark) VALUES(?,?,?,?,?,?,CURDATE(),'待审批',?)",
            no, type, applicant, dept, refNo == null ? "" : refNo, amount == null ? BigDecimal.ZERO : amount, remark);
        db.update("INSERT INTO oa_flow_instance(instance_no,workflow_code,applicant,start_date,current_node,instance_status) VALUES(?,?,?,NOW(),'审批中','待处理')",
            no, type, applicant);
        // 申请人角色（用于同角色节点自动跳过，防止自审自批）
        String applicantRole = "sales";
        try {
            List<Map<String,Object>> u = db.queryForList("SELECT role FROM sys_user WHERE username=?", applicant);
            if (!u.isEmpty() && u.get(0).get("role") != null) applicantRole = String.valueOf(u.get(0).get("role"));
        } catch (Exception ignored) {}
        // 创建多级 task 节点（assignee = 角色编码，待办按用户名/角色可见）
        String[][] nodes = NODE_TEMPLATES.containsKey(type) ? NODE_TEMPLATES.get(type) : NODE_TEMPLATES.get("default");
        int idx = 0;
        boolean activated = false;
        boolean anyPending = false;
        for (String[] node : nodes) {
            idx++;
            String taskNo = no + "-T" + idx;
            String nodeName = node[0];
            String assignee = node[1];
            boolean autoSkip = assignee.equals(applicantRole) && !"admin".equals(applicantRole);
            if (autoSkip) {
                db.update("INSERT INTO oa_flow_task(task_no,instance_no,task_name,assignee,create_date,complete_date,task_status,remark) VALUES(?,?,?,?,CURDATE(),CURDATE(),'已通过','与申请人同角色自动跳过')",
                    taskNo, no, nodeName, "系统");
                db.update("INSERT INTO oa_flow_log(log_no,instance_no,operator,action,action_date,comment) VALUES(?,?,?,?,CURDATE(),?)",
                    "LOG-" + System.currentTimeMillis() + "-" + idx, no, "系统", "通过-" + nodeName, "与申请人同角色自动跳过");
                continue;
            }
            String status = activated ? "未触发" : "待处理";
            activated = true;
            anyPending = true;
            db.update("INSERT INTO oa_flow_task(task_no,instance_no,task_name,assignee,create_date,task_status) VALUES(?,?,?,?,CURDATE(),?)",
                taskNo, no, nodeName, assignee, status);
        }
        // 写起始日志
        db.update("INSERT INTO oa_flow_log(log_no,instance_no,operator,action,action_date,comment) VALUES(?,?,?,?,CURDATE(),'提交审批')",
            "LOG-" + System.currentTimeMillis() + "-S", no, applicant, "提交");
        if (!anyPending) {
            // 全部节点被自动跳过 → 直接终结（联动业务）
            Map<String,Object> row = new HashMap<>();
            row.put("approval_no", no);
            row.put("approval_type", type);
            row.put("ref_no", refNo == null ? "" : refNo);
            row.put("amount", amount == null ? BigDecimal.ZERO : amount);
            finalizeApproval(row, "系统", "全部节点自动跳过");
        }
        // 同步审批类型明细表
        try {
            if ("采购审批".equals(type) && refNo != null && !refNo.isEmpty()) {
                Map<String,Object> pur = db.queryForList("SELECT supplier_code,supplier_name,total_amount FROM trade_purchase_main WHERE purchase_no=?", refNo)
                    .stream().findFirst().orElse(Collections.emptyMap());
                String supplierName = String.valueOf(pur.getOrDefault("supplier_name", ""));
                BigDecimal total = pur.get("total_amount") == null ? (amount == null ? BigDecimal.ZERO : amount) : new BigDecimal(pur.get("total_amount").toString());
                db.update("INSERT INTO oa_purchase_approval(approval_no,purchase_no,supplier_name,total_amount,applicant,approval_status) VALUES(?,?,?,?,?,'待审批')",
                    no, refNo, supplierName, total, applicant);
            } else if ("费用审批".equals(type)) {
                db.update("INSERT INTO oa_expense_approval(approval_no,expense_type,amount,applicant,approval_status) VALUES(?,?,?,?,'待审批')",
                    no, remark == null ? "其他" : remark.length() > 30 ? remark.substring(0, 30) : remark,
                    amount == null ? BigDecimal.ZERO : amount, applicant);
            }
        } catch (Exception e) {
            System.err.println("Workflow submit detail insert failed for " + no + ": " + e.getMessage());
        }
    }

    /** 当前用户待办任务：按用户名或所属角色匹配（admin 可见全部） */
    public List<Map<String,Object>> myTasks(String username, String role) {
        return db.queryForList(
            "SELECT t.task_no, t.instance_no, t.task_name, t.assignee, t.create_date, t.task_status, " +
            "a.approval_type, a.applicant, a.department, a.amount, a.ref_no, a.remark submit_remark " +
            "FROM oa_flow_task t JOIN oa_approval_main a ON a.approval_no=t.instance_no " +
            "WHERE t.task_status='待处理' AND (t.assignee=? OR t.assignee=? OR ?='admin') ORDER BY t.id DESC",
            username, role, username);
    }

    /** 审批单详情（主表 + 流程实例 + 任务节点 + 日志） */
    public Map<String,Object> approvalDetail(String approvalNo) {
        Map<String,Object> ret = new LinkedHashMap<>();
        List<Map<String,Object>> main = db.queryForList("SELECT * FROM oa_approval_main WHERE approval_no=?", approvalNo);
        ret.put("main", main.isEmpty() ? null : main.get(0));
        List<Map<String,Object>> inst = db.queryForList("SELECT * FROM oa_flow_instance WHERE instance_no=?", approvalNo);
        ret.put("instance", inst.isEmpty() ? null : inst.get(0));
        ret.put("tasks", db.queryForList("SELECT * FROM oa_flow_task WHERE instance_no=? ORDER BY id ASC", approvalNo));
        ret.put("logs", db.queryForList("SELECT * FROM oa_flow_log WHERE instance_no=? ORDER BY id ASC", approvalNo));
        return ret;
    }

    private String extractRefNo(Map<String,Object> row) {
        Object v = row.get("ref_no");
        return v == null ? "" : String.valueOf(v);
    }
}