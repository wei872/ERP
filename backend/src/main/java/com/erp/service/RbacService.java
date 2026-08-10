package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** RBAC：角色 × 菜单权限矩阵，向后兼容 sys_user.permissions JSON */
@Service
public class RbacService {

    @Autowired private JdbcTemplate db;

    public List<Map<String,Object>> listRoles() {
        return db.queryForList("SELECT id, role_code, role_name, description, status FROM sys_role ORDER BY id");
    }

    public List<Map<String,Object>> listMenus() {
        return db.queryForList("SELECT id, menu_code, menu_name, parent_code, module, sort, status FROM sys_menu ORDER BY sort, id");
    }

    /** 取得角色×菜单矩阵：[{role_id, role_code, role_name, menu_id, menu_code, menu_name, can_view, can_add, can_edit, can_delete}] */
    public List<Map<String,Object>> getMatrix() {
        return db.queryForList(
            "SELECT r.id role_id, r.role_code, r.role_name, m.id menu_id, m.menu_code, m.menu_name, " +
            "COALESCE(rm.can_view,0) can_view, COALESCE(rm.can_add,0) can_add, COALESCE(rm.can_edit,0) can_edit, COALESCE(rm.can_delete,0) can_delete " +
            "FROM sys_role r CROSS JOIN sys_menu m LEFT JOIN sys_role_menu rm ON rm.role_id=r.id AND rm.menu_id=m.id " +
            "ORDER BY r.id, m.sort, m.id");
    }

    /** 取得指定角色的菜单权限列表 */
    public List<Map<String,Object>> getRoleMenus(Long roleId) {
        return db.queryForList(
            "SELECT m.id menu_id, m.menu_code, m.menu_name, m.module, " +
            "COALESCE(rm.can_view,0) can_view, COALESCE(rm.can_add,0) can_add, COALESCE(rm.can_edit,0) can_edit, COALESCE(rm.can_delete,0) can_delete " +
            "FROM sys_menu m LEFT JOIN sys_role_menu rm ON rm.menu_id=m.id AND rm.role_id=? " +
            "ORDER BY m.sort, m.id", roleId);
    }

    /** 保存角色×菜单权限：[{menu_id, can_view, can_add, can_edit, can_delete}]，全量覆盖 */
    @Transactional
    public void saveRoleMenus(Long roleId, List<Map<String,Object>> perms) {
        db.update("DELETE FROM sys_role_menu WHERE role_id=?", roleId);
        if (perms == null) return;
        for (Map<String,Object> p : perms) {
            Long menuId = toLong(p.get("menu_id"));
            int canView = toInt(p.get("can_view"));
            int canAdd = toInt(p.get("can_add"));
            int canEdit = toInt(p.get("can_edit"));
            int canDelete = toInt(p.get("can_delete"));
            if (canView + canAdd + canEdit + canDelete == 0) continue;
            db.update("INSERT INTO sys_role_menu(role_id,menu_id,can_view,can_add,can_edit,can_delete) VALUES(?,?,?,?,?,?)",
                roleId, menuId, canView, canAdd, canEdit, canDelete);
        }
    }

    /** 取得用户的角色列表（可多角色） */
    public List<Map<String,Object>> getUserRoles(Long userId) {
        return db.queryForList(
            "SELECT r.id role_id, r.role_code, r.role_name FROM sys_user_role ur JOIN sys_role r ON r.id=ur.role_id WHERE ur.user_id=? ORDER BY r.id",
            userId);
    }

    /** 设置用户的角色（全量覆盖） */
    @Transactional
    public void saveUserRoles(Long userId, List<Long> roleIds) {
        db.update("DELETE FROM sys_user_role WHERE user_id=?", userId);
        if (roleIds == null) return;
        for (Long rid : roleIds) {
            db.update("INSERT IGNORE INTO sys_user_role(user_id,role_id) VALUES(?,?)", userId, rid);
        }
    }

    /** 根据角色代码返回该角色的菜单权限（用于 AuthController.parsePerms 的 RBAC 兜底）
     *  返回 [{module, canView, canAdd, canEdit, canDelete}] */
    public List<Map<String,Object>> permsByRoleCode(String roleCode) {
        List<Map<String,Object>> rows = db.queryForList(
            "SELECT m.module, rm.can_view, rm.can_add, rm.can_edit, rm.can_delete " +
            "FROM sys_role r JOIN sys_role_menu rm ON rm.role_id=r.id JOIN sys_menu m ON m.id=rm.menu_id " +
            "WHERE r.role_code=? ORDER BY m.sort", roleCode);
        List<Map<String,Object>> ret = new ArrayList<>();
        for (Map<String,Object> r : rows) {
            Map<String,Object> p = new HashMap<>();
            p.put("module", r.get("module"));
            p.put("canView", ((Number) r.getOrDefault("can_view", 0)).intValue() == 1);
            p.put("canAdd", ((Number) r.getOrDefault("can_add", 0)).intValue() == 1);
            p.put("canEdit", ((Number) r.getOrDefault("can_edit", 0)).intValue() == 1);
            p.put("canDelete", ((Number) r.getOrDefault("can_delete", 0)).intValue() == 1);
            ret.add(p);
        }
        return ret;
    }

    private Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return null; }
    }
    private int toInt(Object v) {
        if (v == null) return 0;
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
        try { return "1".equals(String.valueOf(v)) || "true".equalsIgnoreCase(String.valueOf(v)) ? 1 : 0; }
        catch (Exception e) { return 0; }
    }
}