package com.erp.service;

import com.erp.util.ChineseAmount;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.*;

@Service
public class FinanceTemplateService {

    @Autowired private JdbcTemplate db;
    private final ObjectMapper om = new ObjectMapper();

    public List<Map<String, Object>> listTemplates(Long uid, String role) {
        List<Map<String, Object>> all = db.queryForList(
            "SELECT id, code, name, company, category, instance_mode, field_schema, created_by, created_at FROM fin_template ORDER BY id");
        if ("admin".equals(role)) return all;
        Set<Long> allowed = new HashSet<>();
        for (Map<String, Object> p : db.queryForList(
            "SELECT template_id FROM fin_template_perm WHERE user_id=? AND can_view=1", uid)) {
            allowed.add(((Number) p.get("template_id")).longValue());
        }
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> t : all) {
            if (allowed.contains(((Number) t.get("id")).longValue())) filtered.add(t);
        }
        return filtered;
    }

    public Map<String, Object> getTemplate(Long id) {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT id, code, name, company, category, instance_mode, field_schema, cell_map, created_by, created_at FROM fin_template WHERE id=?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public byte[] getBlankFile(Long id, Long uid, String role) {
        checkPerm(uid, role, id, "view");
        List<Map<String, Object>> rows = db.queryForList("SELECT template_file FROM fin_template WHERE id=?", id);
        if (rows.isEmpty()) throw new RuntimeException("模版不存在");
        Object blob = rows.get(0).get("template_file");
        if (blob == null) throw new RuntimeException("模版文件未上传");
        return (byte[]) blob;
    }

    public Map<String, Object> uploadTemplate(MultipartFile file, String name, String company,
                                              String category, String instanceMode, String username) throws Exception {
        if (file == null || file.isEmpty()) throw new RuntimeException("请上传 xlsx 文件");
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!original.endsWith(".xlsx")) throw new RuntimeException("仅支持 .xlsx");
        byte[] bytes = file.getBytes();
        Map<String, Object> parsed = parseXlsx(bytes);
        String code = "tpl_" + System.currentTimeMillis();
        String schemaJson = om.writeValueAsString(parsed.get("field_schema"));
        String cellMapJson = om.writeValueAsString(parsed.get("cell_map"));
        KeyHolder kh = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                "INSERT INTO fin_template(code,name,company,category,instance_mode,field_schema,cell_map,template_file,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, code);
            ps.setString(2, name);
            ps.setString(3, company == null || company.isEmpty() ? "通用" : company);
            ps.setString(4, category == null || category.isEmpty() ? "inventory" : category);
            ps.setString(5, "single".equals(instanceMode) ? "single" : "multi");
            ps.setString(6, schemaJson);
            ps.setString(7, cellMapJson);
            ps.setBytes(8, bytes);
            ps.setString(9, username);
            return ps;
        }, kh);
        Number key = kh.getKey();
        Map<String, Object> result = new HashMap<>();
        result.put("id", key == null ? null : key.longValue());
        result.put("code", code);
        result.put("field_schema", parsed.get("field_schema"));
        result.put("cell_map", parsed.get("cell_map"));
        return result;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> parseXlsx(byte[] bytes) throws Exception {
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            DataFormatter fmt = new DataFormatter();
            List<String> headers = new ArrayList<>();
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) throw new RuntimeException("空工作表");
            int lastCell = headerRow.getLastCellNum();
            for (int c = 0; c < lastCell; c++) {
                String v = fmt.formatCellValue(headerRow.getCell(c)).trim();
                if (!v.isEmpty()) headers.add(v);
            }
            boolean hasXuhao = false;
            for (String h : headers) if ("序号".equals(h)) { hasXuhao = true; break; }
            Map<String, Object> schema = new LinkedHashMap<>();
            Map<String, Object> cellMap = new LinkedHashMap<>();
            if (hasXuhao || headers.size() <= 3) {
                schema.put("type", "form");
                List<Map<String, Object>> scalars = new ArrayList<>();
                Map<String, String> scalarCells = new LinkedHashMap<>();
                int maxR = Math.min(sheet.getLastRowNum(), 30);
                for (int r = 0; r <= maxR; r++) {
                    Row row = sheet.getRow(r);
                    if (row == null) continue;
                    String a = fmt.formatCellValue(row.getCell(0)).trim();
                    String b = fmt.formatCellValue(row.getCell(1)).trim();
                    String c = fmt.formatCellValue(row.getCell(2)).trim();
                    String label = !a.isEmpty() ? a : b;
                    if (label.isEmpty()) continue;
                    if ("序号".equals(label) || label.contains("货物名称")) break;
                    String key = "f" + r + "_" + sanitize(label);
                    Map<String, Object> sc = new LinkedHashMap<>();
                    sc.put("key", key);
                    sc.put("label", label.replace("：", "").replace(":", ""));
                    sc.put("kind", "text");
                    scalars.add(sc);
                    scalarCells.put(key, cellRef(2, r));
                }
                schema.put("scalars", scalars);
                List<Map<String, Object>> detailFields = new ArrayList<>();
                Map<String, String> detailCols = new LinkedHashMap<>();
                int detailStart = -1;
                for (int r = 0; r <= maxR; r++) {
                    Row row = sheet.getRow(r);
                    if (row == null) continue;
                    for (int c = 0; c < Math.min(row.getLastCellNum(), 12); c++) {
                        if ("序号".equals(fmt.formatCellValue(row.getCell(c)).trim())) {
                            detailStart = r;
                            for (int dc = 0; dc < Math.min(row.getLastCellNum(), 12); dc++) {
                                String h = fmt.formatCellValue(row.getCell(dc)).trim();
                                if (h.isEmpty() || "序号".equals(h)) continue;
                                String key = "d_" + sanitize(h);
                                Map<String, Object> f = new LinkedHashMap<>();
                                f.put("key", key);
                                f.put("label", h);
                                f.put("kind", "text");
                                detailFields.add(f);
                                detailCols.put(key, colLetter(dc));
                            }
                            break;
                        }
                    }
                    if (detailStart >= 0) break;
                }
                if (!detailFields.isEmpty()) {
                    Map<String, Object> detail = new LinkedHashMap<>();
                    detail.put("key", "items");
                    detail.put("fields", detailFields);
                    schema.put("detail", detail);
                    Map<String, Object> dmap = new LinkedHashMap<>();
                    dmap.put("startRow", detailStart + 2);
                    dmap.put("cols", detailCols);
                    cellMap.put("detail", dmap);
                }
                cellMap.put("scalars", scalarCells);
            } else {
                schema.put("type", "grid");
                List<Map<String, Object>> columns = new ArrayList<>();
                Map<String, String> cols = new LinkedHashMap<>();
                int startRow = 1;
                Row r1 = sheet.getRow(1);
                if (r1 != null) {
                    String first = fmt.formatCellValue(r1.getCell(0)).trim();
                    if (!first.isEmpty() && !first.equals(fmt.formatCellValue(headerRow.getCell(0)).trim())) {
                        startRow = 2;
                        headerRow = r1;
                        lastCell = headerRow.getLastCellNum();
                    }
                }
                for (int c = 0; c < lastCell; c++) {
                    String h = fmt.formatCellValue(headerRow.getCell(c)).trim();
                    if (h.isEmpty()) continue;
                    String key = "c" + c + "_" + sanitize(h);
                    Map<String, Object> col = new LinkedHashMap<>();
                    col.put("key", key);
                    col.put("label", h);
                    col.put("kind", "text");
                    columns.add(col);
                    cols.put(key, colLetter(c));
                }
                schema.put("columns", columns);
                cellMap.put("startRow", startRow + 2);
                cellMap.put("cols", cols);
            }
            Map<String, Object> out = new HashMap<>();
            out.put("field_schema", schema);
            out.put("cell_map", cellMap);
            return out;
        }
    }

    public List<Map<String, Object>> listInstances(Long templateId, Long uid, String role) {
        checkPerm(uid, role, templateId, "view");
        return db.queryForList(
            "SELECT id, template_id, title, data, period, created_by, created_at FROM fin_instance WHERE template_id=? ORDER BY id DESC",
            templateId);
    }

    public Map<String, Object> getInstance(Long id, Long uid, String role) {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT id, template_id, title, data, period, created_by, created_at FROM fin_instance WHERE id=?", id);
        if (rows.isEmpty()) throw new RuntimeException("实例不存在");
        Map<String, Object> inst = rows.get(0);
        checkPerm(uid, role, ((Number) inst.get("template_id")).longValue(), "view");
        return inst;
    }

    public Map<String, Object> saveInstance(Map<String, Object> body, Long uid, String role, String username) throws Exception {
        Long templateId = toLong(body.get("template_id"));
        if (templateId == null) throw new RuntimeException("缺少 template_id");
        checkPerm(uid, role, templateId, "view");
        Map<String, Object> tpl = getTemplate(templateId);
        if (tpl == null) throw new RuntimeException("模版不存在");
        String title = String.valueOf(body.getOrDefault("title", tpl.get("name")));
        String period = body.get("period") == null ? null : String.valueOf(body.get("period"));
        Object dataObj = body.get("data");
        if (dataObj == null) dataObj = defaultData(String.valueOf(tpl.get("field_schema")));
        String dataJson = dataObj instanceof String ? (String) dataObj : om.writeValueAsString(dataObj);
        dataJson = autoCalc(dataJson, String.valueOf(tpl.get("field_schema")));

        if ("single".equals(String.valueOf(tpl.get("instance_mode")))) {
            List<Map<String, Object>> exist = db.queryForList("SELECT id FROM fin_instance WHERE template_id=? LIMIT 1", templateId);
            if (!exist.isEmpty()) {
                Long id = ((Number) exist.get(0).get("id")).longValue();
                db.update("UPDATE fin_instance SET title=?, data=?, period=? WHERE id=?", title, dataJson, period, id);
                return getInstance(id, uid, role);
            }
        }
        KeyHolder kh = new GeneratedKeyHolder();
        final String dj = dataJson;
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                "INSERT INTO fin_instance(template_id,title,data,period,created_by) VALUES(?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, templateId);
            ps.setString(2, title);
            ps.setString(3, dj);
            ps.setString(4, period);
            ps.setString(5, username);
            return ps;
        }, kh);
        Number key = kh.getKey();
        return getInstance(key.longValue(), uid, role);
    }

    public Map<String, Object> updateInstance(Long id, Map<String, Object> body, Long uid, String role) throws Exception {
        Map<String, Object> inst = getInstance(id, uid, role);
        Long templateId = ((Number) inst.get("template_id")).longValue();
        Map<String, Object> tpl = getTemplate(templateId);
        String title = body.containsKey("title") ? String.valueOf(body.get("title")) : String.valueOf(inst.get("title"));
        String period = body.containsKey("period")
            ? (body.get("period") == null ? null : String.valueOf(body.get("period")))
            : (inst.get("period") == null ? null : String.valueOf(inst.get("period")));
        Object dataObj = body.containsKey("data") ? body.get("data") : inst.get("data");
        String dataJson = dataObj instanceof String ? (String) dataObj : om.writeValueAsString(dataObj);
        dataJson = autoCalc(dataJson, String.valueOf(tpl.get("field_schema")));
        db.update("UPDATE fin_instance SET title=?, data=?, period=? WHERE id=?", title, dataJson, period, id);
        return getInstance(id, uid, role);
    }

    public void deleteInstance(Long id, Long uid, String role, String username) {
        Map<String, Object> inst = getInstance(id, uid, role);
        if (!"admin".equals(role) && !username.equals(String.valueOf(inst.get("created_by")))) {
            throw new RuntimeException("仅创建人或管理员可删除");
        }
        db.update("DELETE FROM fin_instance WHERE id=?", id);
    }

    @SuppressWarnings("unchecked")
    public byte[] exportInstance(Long id, Long uid, String role) throws Exception {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT id, template_id, title, data FROM fin_instance WHERE id=?", id);
        if (rows.isEmpty()) throw new RuntimeException("实例不存在");
        Map<String, Object> inst = rows.get(0);
        Long templateId = ((Number) inst.get("template_id")).longValue();
        checkPerm(uid, role, templateId, "download");
        List<Map<String, Object>> tpls = db.queryForList(
            "SELECT template_file, cell_map, field_schema FROM fin_template WHERE id=?", templateId);
        if (tpls.isEmpty()) throw new RuntimeException("模版不存在");
        byte[] file = (byte[]) tpls.get(0).get("template_file");
        if (file == null) {
            return exportFallbackXlsx(inst, tpls.get(0));
        }
        Map<String, Object> cellMap = om.readValue(String.valueOf(tpls.get(0).get("cell_map")), Map.class);
        Map<String, Object> data = om.readValue(String.valueOf(inst.get("data")), Map.class);
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(file));
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            Sheet sheet = wb.getSheetAt(0);
            fillSheet(sheet, cellMap, data);
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    @SuppressWarnings("unchecked")
    private byte[] exportFallbackXlsx(Map<String, Object> inst, Map<String, Object> tplMeta) throws Exception {
        Map<String, Object> data = om.readValue(String.valueOf(inst.get("data")), Map.class);
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("导出");
            int r = 0;
            Row title = sheet.createRow(r++);
            title.createCell(0).setCellValue(String.valueOf(inst.get("title")));
            if (data.containsKey("rows")) {
                List<Map<String, Object>> rows = (List<Map<String, Object>>) data.get("rows");
                if (!rows.isEmpty()) {
                    Row h = sheet.createRow(r++);
                    int c = 0;
                    for (String k : rows.get(0).keySet()) h.createCell(c++).setCellValue(k);
                    for (Map<String, Object> row : rows) {
                        Row rr = sheet.createRow(r++);
                        c = 0;
                        for (Object v : row.values()) rr.createCell(c++).setCellValue(v == null ? "" : String.valueOf(v));
                    }
                }
            } else {
                Map<String, Object> scalars = (Map<String, Object>) data.getOrDefault("scalars", Collections.emptyMap());
                for (Map.Entry<String, Object> e : scalars.entrySet()) {
                    Row rr = sheet.createRow(r++);
                    rr.createCell(0).setCellValue(e.getKey());
                    rr.createCell(1).setCellValue(e.getValue() == null ? "" : String.valueOf(e.getValue()));
                }
                if (data.containsKey("detail")) {
                    List<Map<String, Object>> detail = (List<Map<String, Object>>) data.get("detail");
                    for (Map<String, Object> d : detail) {
                        Row rr = sheet.createRow(r++);
                        int c = 0;
                        for (Object v : d.values()) rr.createCell(c++).setCellValue(v == null ? "" : String.valueOf(v));
                    }
                }
                if (data.containsKey("fixedRows")) {
                    Map<String, Object> fr = (Map<String, Object>) data.get("fixedRows");
                    for (Map.Entry<String, Object> e : fr.entrySet()) {
                        Row rr = sheet.createRow(r++);
                        rr.createCell(0).setCellValue(e.getKey());
                        rr.createCell(1).setCellValue(e.getValue() == null ? "" : String.valueOf(e.getValue()));
                    }
                }
            }
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    @SuppressWarnings("unchecked")
    private void fillSheet(Sheet sheet, Map<String, Object> cellMap, Map<String, Object> data) {
        if (cellMap.containsKey("cols") && data.containsKey("rows")) {
            Map<String, String> cols = (Map<String, String>) cellMap.get("cols");
            int startRow = ((Number) cellMap.getOrDefault("startRow", 4)).intValue() - 1;
            List<Map<String, Object>> rows = (List<Map<String, Object>>) data.get("rows");
            for (int i = 0; i < rows.size(); i++) {
                Row row = sheet.getRow(startRow + i);
                if (row == null) row = sheet.createRow(startRow + i);
                Map<String, Object> rd = rows.get(i);
                for (Map.Entry<String, String> e : cols.entrySet()) {
                    setCell(row, e.getValue(), rd.get(e.getKey()));
                }
            }
            return;
        }
        if (cellMap.containsKey("scalars") && data.containsKey("scalars")) {
            Map<String, String> sc = (Map<String, String>) cellMap.get("scalars");
            Map<String, Object> scalars = (Map<String, Object>) data.get("scalars");
            for (Map.Entry<String, String> e : sc.entrySet()) {
                setCellByRef(sheet, e.getValue(), scalars.get(e.getKey()));
            }
        }
        if (cellMap.containsKey("detail") && data.containsKey("detail")) {
            Map<String, Object> dmap = (Map<String, Object>) cellMap.get("detail");
            int startRow = ((Number) dmap.getOrDefault("startRow", 10)).intValue() - 1;
            Map<String, String> cols = (Map<String, String>) dmap.get("cols");
            List<Map<String, Object>> detail = (List<Map<String, Object>>) data.get("detail");
            for (int i = 0; i < detail.size(); i++) {
                Row row = sheet.getRow(startRow + i);
                if (row == null) row = sheet.createRow(startRow + i);
                Map<String, Object> rd = detail.get(i);
                for (Map.Entry<String, String> e : cols.entrySet()) {
                    setCell(row, e.getValue(), rd.get(e.getKey()));
                }
            }
        }
        if (cellMap.containsKey("fixedRows") && data.containsKey("fixedRows")) {
            Map<String, String> frMap = (Map<String, String>) cellMap.get("fixedRows");
            Map<String, Object> fr = (Map<String, Object>) data.get("fixedRows");
            for (Map.Entry<String, String> e : frMap.entrySet()) {
                setCellByRef(sheet, e.getValue(), fr.get(e.getKey()));
            }
        }
    }

    private void setCellByRef(Sheet sheet, String ref, Object value) {
        if (ref == null) return;
        int col = 0, row = 0, i = 0;
        while (i < ref.length() && Character.isLetter(ref.charAt(i))) {
            col = col * 26 + (Character.toUpperCase(ref.charAt(i)) - 'A' + 1);
            i++;
        }
        col -= 1;
        if (i < ref.length()) row = Integer.parseInt(ref.substring(i)) - 1;
        Row r = sheet.getRow(row);
        if (r == null) r = sheet.createRow(row);
        Cell cell = r.getCell(col);
        if (cell == null) cell = r.createCell(col);
        writeValue(cell, value);
    }

    private void setCell(Row row, String colLetter, Object value) {
        int col = 0;
        for (int i = 0; i < colLetter.length(); i++) {
            col = col * 26 + (Character.toUpperCase(colLetter.charAt(i)) - 'A' + 1);
        }
        col -= 1;
        Cell cell = row.getCell(col);
        if (cell == null) cell = row.createCell(col);
        writeValue(cell, value);
    }

    private void writeValue(Cell cell, Object value) {
        if (value == null) { cell.setBlank(); return; }
        if (value instanceof Number) {
            cell.setCellValue(((Number) value).doubleValue());
        } else {
            String s = String.valueOf(value);
            try {
                if (s.matches("-?\\d+(\\.\\d+)?")) cell.setCellValue(Double.parseDouble(s));
                else cell.setCellValue(s);
            } catch (Exception e) {
                cell.setCellValue(s);
            }
        }
    }

    public List<Map<String, Object>> getPerms(Long userId) {
        List<Map<String, Object>> tpls = db.queryForList("SELECT id, code, name, company, category FROM fin_template ORDER BY id");
        Map<Long, Map<String, Object>> byTpl = new HashMap<>();
        for (Map<String, Object> p : db.queryForList(
            "SELECT template_id, can_view, can_download FROM fin_template_perm WHERE user_id=?", userId)) {
            byTpl.put(((Number) p.get("template_id")).longValue(), p);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> t : tpls) {
            Long tid = ((Number) t.get("id")).longValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("template_id", tid);
            row.put("code", t.get("code"));
            row.put("name", t.get("name"));
            row.put("company", t.get("company"));
            row.put("category", t.get("category"));
            Map<String, Object> p = byTpl.get(tid);
            row.put("can_view", p != null && toBool(p.get("can_view")));
            row.put("can_download", p != null && toBool(p.get("can_download")));
            out.add(row);
        }
        return out;
    }

    public void savePerms(Long userId, List<Map<String, Object>> perms) {
        for (Map<String, Object> p : perms) {
            Long tid = toLong(p.get("template_id"));
            if (tid == null) continue;
            int cv = toBool(p.get("can_view")) ? 1 : 0;
            int cd = toBool(p.get("can_download")) ? 1 : 0;
            db.update(
                "INSERT INTO fin_template_perm(user_id, template_id, can_view, can_download) VALUES(?,?,?,?) " +
                    "ON DUPLICATE KEY UPDATE can_view=VALUES(can_view), can_download=VALUES(can_download)",
                userId, tid, cv, cd);
        }
    }

    public void checkPerm(Long uid, String role, Long templateId, String action) {
        if ("admin".equals(role)) return;
        if (uid == null || templateId == null) throw new RuntimeException("权限不足");
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT can_view, can_download FROM fin_template_perm WHERE user_id=? AND template_id=?", uid, templateId);
        if (rows.isEmpty()) throw new RuntimeException("权限不足");
        Map<String, Object> p = rows.get(0);
        if ("download".equals(action)) {
            if (!toBool(p.get("can_download"))) throw new RuntimeException("无下载权限");
        } else {
            if (!toBool(p.get("can_view"))) throw new RuntimeException("无查看权限");
        }
    }

    @SuppressWarnings("unchecked")
    private String autoCalc(String dataJson, String schemaJson) throws Exception {
        Map<String, Object> data = om.readValue(dataJson, Map.class);
        Map<String, Object> schema = om.readValue(schemaJson, Map.class);
        if (!"form".equals(String.valueOf(schema.get("type")))) return dataJson;
        if (data.containsKey("detail") && data.get("detail") instanceof List) {
            List<Map<String, Object>> detail = (List<Map<String, Object>>) data.get("detail");
            BigDecimal total = BigDecimal.ZERO;
            for (Map<String, Object> d : detail) {
                BigDecimal qty = toBd(d.get("qty"));
                BigDecimal price = toBd(d.get("unit_price"));
                BigDecimal sub = qty.multiply(price);
                d.put("subtotal", sub);
                total = total.add(sub);
            }
            Map<String, Object> scalars = (Map<String, Object>) data.getOrDefault("scalars", new LinkedHashMap<>());
            scalars.put("pay_total", total);
            scalars.put("pay_total_cn", ChineseAmount.toChinese(total));
            data.put("scalars", scalars);
            data.put("detail", detail);
        }
        if (data.containsKey("fixedRows") && data.get("fixedRows") instanceof Map) {
            Map<String, Object> fr = (Map<String, Object>) data.get("fixedRows");
            BigDecimal total = BigDecimal.ZERO;
            for (Object v : fr.values()) total = total.add(toBd(v));
            Map<String, Object> scalars = (Map<String, Object>) data.getOrDefault("scalars", new LinkedHashMap<>());
            scalars.put("total", total);
            scalars.put("total_cn", ChineseAmount.toChinese(total));
            data.put("scalars", scalars);
        }
        return om.writeValueAsString(data);
    }

    @SuppressWarnings("unchecked")
    private Object defaultData(String schemaJson) throws Exception {
        Map<String, Object> schema = om.readValue(schemaJson, Map.class);
        Map<String, Object> data = new LinkedHashMap<>();
        if ("grid".equals(String.valueOf(schema.get("type")))) {
            data.put("rows", new ArrayList<>());
        } else {
            Map<String, Object> scalars = new LinkedHashMap<>();
            List<Map<String, Object>> scList = (List<Map<String, Object>>) schema.getOrDefault("scalars", Collections.emptyList());
            for (Map<String, Object> s : scList) scalars.put(String.valueOf(s.get("key")), "");
            data.put("scalars", scalars);
            if (schema.containsKey("detail")) data.put("detail", new ArrayList<>());
            if (schema.containsKey("fixedRows")) {
                Map<String, Object> fr = new LinkedHashMap<>();
                Map<String, Object> frSchema = (Map<String, Object>) schema.get("fixedRows");
                List<Map<String, Object>> rows = (List<Map<String, Object>>) frSchema.getOrDefault("rows", Collections.emptyList());
                for (Map<String, Object> r : rows) fr.put(String.valueOf(r.get("key")), 0);
                data.put("fixedRows", fr);
            }
        }
        return data;
    }

    private static String sanitize(String s) {
        return s.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5]", "_");
    }

    private static String colLetter(int col) {
        StringBuilder sb = new StringBuilder();
        col++;
        while (col > 0) {
            col--;
            sb.insert(0, (char) ('A' + col % 26));
            col /= 26;
        }
        return sb.toString();
    }

    private static String cellRef(int col, int row) {
        return colLetter(col) + (row + 1);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number) return ((Number) o).longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static boolean toBool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        return "true".equalsIgnoreCase(String.valueOf(o)) || "1".equals(String.valueOf(o));
    }

    private static BigDecimal toBd(Object o) {
        if (o == null) return BigDecimal.ZERO;
        try { return new BigDecimal(String.valueOf(o)); } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
