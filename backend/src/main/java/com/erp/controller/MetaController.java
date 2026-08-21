package com.erp.controller;

import com.erp.model.Result;
import com.erp.service.MetaService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** 元数据端点：前端菜单树 / 表格列 / 状态字典的唯一来源（JwtFilter 全局鉴权） */
@RestController
@RequestMapping("/meta")
public class MetaController {

    @Autowired private MetaService meta;

    @GetMapping("/tables")
    public Result tables() {
        try { return Result.ok(meta.listTables()); }
        catch (Exception e) { return Result.error("元数据加载失败: " + e.getMessage()); }
    }

    @GetMapping("/tables/{table}")
    public Result tableMeta(@PathVariable String table) {
        try { return Result.ok(meta.tableMeta(table)); }
        catch (IllegalArgumentException e) { return Result.error(e.getMessage()); }
        catch (Exception e) { return Result.error("元数据加载失败: " + e.getMessage()); }
    }

    @GetMapping("/dicts")
    public Result dicts() {
        try { return Result.ok(meta.allDicts()); }
        catch (Exception e) { return Result.error("字典加载失败: " + e.getMessage()); }
    }
}
