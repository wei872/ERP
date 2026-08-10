package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

@Service
public class WorkflowService {

    @Autowired private JdbcTemplate db;

    /** 各审批类型的节点序列（assignee 当前简化为 admin，后续可按部门/职位指派） */
    private static final Map<String, List<String>> NODE_TEMPLATES = new HashMap<>();
    static {
        NODE_TEMPLATES.put("采购审批", Arrays.asList("部门经理审核", "总经理审批", "财务总监审批"));
        NODE_TEMPLATES.put("费用审批", Arrays.asList("部门经理审核", "财务审核"));
        NODE_TEMPLATES.put("请假审批", Arrays.asList("部门经理审核", "HR复核"));
        NODE_TEMPLATES.put("default", Collections.singletonList("审批人审核"));
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
                db.update("INSERT INTO finance_expense_main(expense_no,expense_type,amount,expense_date,status,remark) VALUES(?,?,?,CURDATE(),'已确认',?)",
                    "EXP-" + System.currentTimeMillis(), type, amt, "审批通过自动生成: " + approvalNo);
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

    /** 提交审批 — 创建审批主表 + 流程实例 + 多级 task 节点 + 审批类型明细表 */
    @Transactional
    public void submit(String type, String applicant, String dept, String refNo, BigDecimal amount, String remark) {
        String no = "AP-" + System.currentTimeMillis();
        db.update("INSERT INTO oa_approval_main(approval_no,approval_type,applicant,department,ref_no,amount,submit_date,approval_status,remark) VALUES(?,?,?,?,?,?,CURDATE(),'待审批',?)",
            no, type, applicant, dept, refNo == null ? "" : refNo, amount == null ? BigDecimal.ZERO : amount, remark);
        db.update("INSERT INTO oa_flow_instance(instance_no,workflow_code,applicant,start_date,current_node,instance_status) VALUES(?,?,?,NOW(),'审批中','待处理')",
            no, type, applicant);
        // 创建多级 task 节点
        List<String> nodes = NODE_TEMPLATES.getOrDefault(type, NODE_TEMPLATES.get("default"));
        int idx = 0;
        for (String nodeName : nodes) {
            idx++;
            String taskNo = no + "-T" + idx;
            String status = idx == 1 ? "待处理" : "未触发"; // 仅首个节点立即待处理，其余在前置完成后才激活
            db.update("INSERT INTO oa_flow_task(task_no,instance_no,task_name,assignee,create_date,task_status) VALUES(?,?,?,admin,CURDATE(),?)",
                taskNo, no, nodeName, status);
        }
        // 写起始日志
        db.update("INSERT INTO oa_flow_log(log_no,instance_no,operator,action,action_date,comment) VALUES(?,?,?,?,CURDATE(),'提交审批')",
            "LOG-" + System.currentTimeMillis() + "-S", no, applicant, "提交");
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
                db.update("INSERT INTO oa_expense_approval(approval_no,expense_type,amount,applicant,approval_status) VALUES(?,?,?,?,?,'待审批')",
                    no, remark == null ? "其他" : remark.length() > 30 ? remark.substring(0, 30) : remark,
                    amount == null ? BigDecimal.ZERO : amount, applicant);
            }
        } catch (Exception e) {
            System.err.println("Workflow submit detail insert failed for " + no + ": " + e.getMessage());
        }
    }

    /** 当前用户待办任务 */
    public List<Map<String,Object>> myTasks(String username) {
        return db.queryForList(
            "SELECT t.task_no, t.instance_no, t.task_name, t.assignee, t.create_date, t.task_status, " +
            "a.approval_type, a.applicant, a.department, a.amount, a.ref_no, a.remark submit_remark " +
            "FROM oa_flow_task t JOIN oa_approval_main a ON a.approval_no=t.instance_no " +
            "WHERE t.task_status='待处理' AND (t.assignee=? OR ?='admin') ORDER BY t.id DESC", username, username);
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