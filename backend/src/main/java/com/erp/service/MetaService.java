package com.erp.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 元数据中心 —— "schema 即真源"。
 * 表清单来自 sys_table_registry（数据库注册表），列结构来自 INFORMATION_SCHEMA，
 * 列中文名优先取列 COMMENT，回退 ExportService 内置映射。
 * 写入侧：提供真实列白名单 + 类型信息 + 字典校验，是 DataController 的数据基础。
 */
@Service
public class MetaService {

    @Autowired private JdbcTemplate db;

    private static final Pattern VALID = Pattern.compile("^[a-z][a-z0-9_]{2,60}$");
    /** 列元数据缓存: table -> [{name,jdbcType,uiType,nullable,dictCode}] */
    private final Map<String, List<Map<String,Object>>> colCache = new ConcurrentHashMap<>();

    public boolean tableExists(String table) {
        Long n = db.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?",
            Long.class, table);
        return n != null && n > 0;
    }

    /** 已注册且库中真实存在的表清单（前端菜单树真源），按注册表序号排序 */
    public List<Map<String,Object>> listTables() {
        return db.queryForList(
            "SELECT r.table_name AS `table`, r.cn_name AS cnName, r.module, r.sub_module AS sub, r.sort_no AS sortNo " +
            "FROM sys_table_registry r " +
            "JOIN information_schema.tables t ON t.table_schema=DATABASE() AND t.table_name=r.table_name " +
            "ORDER BY r.sort_no, r.id");
    }

    /** 单表元数据：表信息 + 列（中文名/类型/可空/默认值） + 列级字典 */
    public Map<String,Object> tableMeta(String table) {
        if (!VALID.matcher(table).matches() || !tableExists(table)) {
            throw new IllegalArgumentException("表不存在: " + table);
        }
        Map<String,Object> info = new LinkedHashMap<>();
        List<Map<String,Object>> reg = db.queryForList(
            "SELECT cn_name, module, sub_module FROM sys_table_registry WHERE table_name=?", table);
        if (!reg.isEmpty()) {
            info.put("cnName", reg.get(0).get("cn_name"));
            info.put("module", reg.get(0).get("module"));
            info.put("sub", reg.get(0).get("sub_module"));
        } else {
            info.put("cnName", ExportService.tableCn(table));
            info.put("module", "其他");
            info.put("sub", "未归类");
        }
        info.put("table", table);

        List<Map<String,Object>> cols = new ArrayList<>();
        Map<String,Object> dicts = new LinkedHashMap<>();
        for (Map<String,Object> c : columns(table)) {
            Map<String,Object> col = new LinkedHashMap<>();
            String name = String.valueOf(c.get("name"));
            col.put("name", name);
            col.put("cnName", cnName(table, name, c));
            col.put("type", c.get("uiType"));
            col.put("nullable", c.get("nullable"));
            cols.add(col);
            Object dictCode = c.get("dictCode");
            if (dictCode != null && !String.valueOf(dictCode).isEmpty()) {
                dicts.put(name, dictItems(String.valueOf(dictCode)));
            }
        }
        info.put("cols", cols);
        info.put("dicts", dicts);
        return info;
    }

    /** 全部字典（前端颜色渲染） */
    public Map<String,Object> allDicts() {
        Map<String,Object> out = new LinkedHashMap<>();
        for (Map<String,Object> t : db.queryForList("SELECT dict_code FROM sys_dict_type ORDER BY id")) {
            String code = String.valueOf(t.get("dict_code"));
            out.put(code, dictItems(code));
        }
        return out;
    }

    /** 真实列白名单 + JDBC 类型（写入侧数据基础，带缓存） */
    public List<Map<String,Object>> columns(String table) {
        if (!VALID.matcher(table).matches()) return Collections.emptyList();
        return colCache.computeIfAbsent(table, t -> {
            List<Map<String,Object>> raw = db.queryForList(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
                "WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position", t);
            Map<String,Object> dictBindings = new HashMap<>();
            for (Map<String,Object> b : db.queryForList(
                    "SELECT column_name, dict_code FROM sys_dict_column WHERE table_name=?", t)) {
                dictBindings.put(String.valueOf(b.get("column_name")), b.get("dict_code"));
            }
            List<Map<String,Object>> cols = new ArrayList<>();
            for (Map<String,Object> r : raw) {
                String name = String.valueOf(r.get("column_name"));
                String dataType = String.valueOf(r.get("data_type"));
                Map<String,Object> c = new LinkedHashMap<>();
                c.put("name", name);
                c.put("jdbcType", dataType);
                c.put("uiType", uiType(dataType));
                c.put("nullable", !"NO".equals(String.valueOf(r.get("is_nullable"))));
                c.put("dictCode", dictBindings.get(name));
                cols.add(c);
            }
            return cols;
        });
    }

    /** 清空元数据缓存（DDL 变更后调用） */
    public void evict(String table) { if (table == null) colCache.clear(); else colCache.remove(table); }

    /** 写入口字典校验：列绑定了字典时，提供的值必须命中字典项（空值放行，交由 NOT NULL 兜底） */
    public void validateDictValues(String table, Map<String,Object> body) {
        for (Map<String,Object> c : columns(table)) {
            Object dictCodeObj = c.get("dictCode");
            if (dictCodeObj == null || String.valueOf(dictCodeObj).isEmpty()) continue;
            String col = String.valueOf(c.get("name"));
            Object v = body.get(col);
            if (v == null || String.valueOf(v).trim().isEmpty()) continue;
            String value = String.valueOf(v).trim();
            String dictCode = String.valueOf(dictCodeObj);
            List<String> allowed = new ArrayList<>();
            for (Map<String,Object> item : dictItems(dictCode)) {
                allowed.add(String.valueOf(item.get("value")));
                if (value.equals(item.get("value"))) return;
            }
            throw new IllegalArgumentException("字段 " + ExportService.colCn(col) + "(" + col + ") 取值 \"" + value +
                "\" 不在字典 " + dictCode + " 允许范围内: " + String.join("/", allowed));
        }
    }

    private List<Map<String,Object>> dictItems(String dictCode) {
        return db.queryForList(
            "SELECT item_value AS `value`, item_label AS label, color, sort_no FROM sys_dict_item " +
            "WHERE dict_code=? ORDER BY sort_no", dictCode);
    }

    private String cnName(String table, String col, Map<String,Object> colMeta) {
        // COMMENT 优先（新规范表），ExportService 映射回退（存量表），最后裸列名
        List<Map<String,Object>> c = db.queryForList(
            "SELECT column_comment FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",
            table, col);
        if (!c.isEmpty() && c.get(0).get("column_comment") != null) {
            String comment = String.valueOf(c.get(0).get("column_comment")).trim();
            if (!comment.isEmpty()) return comment;
        }
        return ExportService.colCn(col);
    }

    private String uiType(String dataType) {
        switch (dataType) {
            case "decimal": case "int": case "bigint": case "smallint": case "tinyint":
            case "float": case "double":
                return "number";
            case "date": case "datetime": case "timestamp":
                return "date";
            default:
                return "string";
        }
    }
}
