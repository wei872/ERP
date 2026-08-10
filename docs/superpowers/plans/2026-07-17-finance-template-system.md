# 财务模版系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ERP 系统中新增财务模版库子系统，承载 9 张 Excel 模版的手填实例、xlsx 下载还原、独立模版权限。

**Architecture:** 三张新表（`fin_template`/`fin_instance`/`fin_template_perm`）+ 一个 `FinanceTemplateService`（POI 解析上传 / upsert 实例 / 回填导出 / 模版权限）+ `BizController` 新增 7 个 `/biz/fin` 端点 + 前端 `FinanceTemplate.tsx` 页面与 `UserManagement.tsx` 财务模版权限 Tab。

**Tech Stack:** Spring Boot 2.7.18 / Java 8 / JdbcTemplate / Apache POI 5.2.5 / React 19 / Vite / TypeScript。

## Global Constraints

- 后端包名 `com.erp`，入口 `com.erp.ErpApplication`；持久层仅 JdbcTemplate，不引入 JPA/MyBatis。
- 认证走 `JwtFilter`（`req.getAttribute("uid"/"user"/"role")`），不依赖 Spring Security 授权规则。admin = role=="admin"。
- GB2312/GBK 之外的中文存 UTF-8。前端 base 路径 `/api`，token 在 localStorage `erp_token`。
- DB 加载顺序：先 `init.sql` 后 `upgrade.sql`，均需 `--default-character-set=utf8mb4`。
- 构建命令：`mvn clean package -DskipTests`；前端 `npm run dev` 前需把 `vite.config.js` 代理改为 `http://localhost:8080`。
- 不动 `JwtUtil/JwtFilter/SecurityConfig`，不动 `sys_user.permissions` 老字段与 `DataController`。
- 代码风格：不添加注释（除非用户要求）。

## File Structure

**后端（新建）**
- `backend/src/main/java/com/erp/util/ChineseAmount.java`：大写金额工具，纯函数。
- `backend/src/main/java/com/erp/service/FinanceTemplateService.java`：解析上传、实例 CRUD、xlsx 导出、模版权限校验与读写。
- `backend/src/main/java/com/erp/service/FinanceSeedRunner.java`：应用启动后给 9 张内置模版灌 BLOB（`@Component` + `ApplicationRunner`）。
- `backend/src/test/java/com/erp/FinanceTemplateServiceTest.java`：service 关键路径测试。
- `backend/src/main/resources/seed-templates/`：9 张内置 xlsx（从 `财务需求/` 拷贝改名）。

**后端（修改）**
- `backend/pom.xml`：加 POI 依赖。
- `backend/src/main/resources/application.yml`：调高 multipart 上限到 5MB。
- `backend/src/main/java/com/erp/controller/BizController.java`：新增 `/biz/fin/**` 7 个端点。

**数据库（修改）**
- `database/upgrade.sql`：追加三张 `fin_*` 表 + 9 条 `fin_template` seed（schema/cell_map JSON）。

**前端（新建）**
- `frontend/src/components/FinanceTemplate.tsx`：财务模版页面。

**前端（修改）**
- `frontend/src/data/mockData.ts`：在 `erpTables` 末尾加一条 `fin_template` 占位。
- `frontend/src/api/index.ts`：加 `finApi`。
- `frontend/src/components/UserManagement.tsx`：加「财务模版权限」Tab 与对应接口调用。

---