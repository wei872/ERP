# 财务模版系统设计（Financial Template System）

- 日期：2026-07-17
- 范围：在现有 ERP（Spring Boot + JdbcTemplate / React+Vite / MySQL）中新增一套「财务模版库」，承载 `财务需求/` 下 9 张 Excel 模版及其权限。

## 1. 背景与需求来源

`财务需求/新建 文本文档.txt` 给出 4 条需求：

1. 可添加表格模版；
2. 表 1–3 常规显示、可下载；
3. 表 4–9 可新建、可下载；
4. 可新建账号并分配权限（权限含：查看 1–9 号表、下载表格）。

9 张模版分 3 类，全部「手填模板实例」（非从现有库存数据自动汇总）：

| 编号 | 名称 | 公司 | 形态 |
|---|---|---|---|
| 1 | 半成品-成品统计表（年度，1–12 月双列） | 川蓉 | 库存宽表 |
| 2 | 成品出入库统计表（月度，1–31 号双列） | 川蓉 | 库存宽表 |
| 3 | 原材料出入库统计表 | 川蓉 | 库存宽表 |
| 4–6 | 付款申请表（表头 + 明细行） | 成博 / 川蓉 / 众一衡 | form+detail |
| 7–9 | 费用报销表（表头 + 固定类目 + 签字） | 成博 / 川蓉 / 众一衡 | form+fixedRows |

## 2. 关键决策（来自澄清）

- 数据来源：9 张均为手填模板实例，非自动汇总。
- 模版可扩展：admin 可上传新 xlsx；后端自动解析表头生成字段 schema。
- 实例模式：1–3 为 `single`（每模版仅一份当前实例）；4–9 为 `multi`（可建多份）。
- 下载格式：xlsx，还原原模版布局（合并表头 / 1–31 号双列等），不用现有 CSV。
- 权限模型：独立模版权限表 `fin_template_perm`，不复用 `sys_user.permissions`。
- 权限粒度：`can_view` 与 `can_download` 独立（可见未必可下载）。

## 3. 架构方案

采用 **方案 A：模版 + JSON 实例 + 原模版 xlsx 回填**。理由：唯一能同时满足「可上传新模版 + 还原 xlsx 布局 + 异构 9 张表」，且改动集中在新增子系统，不污染 `DataController` / JWT。

被排除的方案：
- 动态建表（DDL per 模版）：宽表（1–31 号双列）建模困难，多实例需 `instance_id`，迁移难。
- 复用 CSV ExportService：丢失多级表头/合并单元格，与「还原布局」冲突。

## 4. 数据模型

### `fin_template`（模版）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| code | VARCHAR(50) | 业务编号，如 `inv_semifinished` |
| name | VARCHAR(100) | 如「半成品-成品统计表」 |
| company | VARCHAR(30) | 川蓉 / 成博 / 众一衡 / 通用 |
| category | VARCHAR(20) | inventory / payment / expense |
| instance_mode | VARCHAR(10) | `single`(1-3) / `multi`(4-9) |
| field_schema | TEXT(JSON) | 见下 |
| template_file | LONGBLOB | 空白 xlsx |
| cell_map | TEXT(JSON) | 字段 key → xlsx 单元格坐标 |
| created_by | VARCHAR(50) | |
| created_at | DATETIME | 默认 CURRENT_TIMESTAMP |

`field_schema` 形态：
```json
{ "type": "grid",
  "columns": [ { "key": "product_name", "label": "商品名称", "kind": "text" },
               { "key": "month_1_assemble", "label": "1月装配数量", "group": "1月", "kind": "number" } ] }
```
```json
{ "type": "form",
  "scalars": [ { "key": "contract_no", "label": "合同编号", "kind": "text" } ],
  "detail": { "key": "items", "fields": [ { "key": "goods_name", "label": "货物名称", "kind": "text" } ] },
  "fixedRows": { "key": "expense", "rows": [ { "key": "express", "label": "快递" } ] } }
```
`detail` 与 `fixedRows` 可同时为 null（库存类），或任一非空（付款=detail，报销=fixedRows）。

### `fin_instance`（实例）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| template_id | BIGINT FK | → fin_template |
| title | VARCHAR(200) | 如「2026年6月成品库存表」 |
| data | MEDIUMTEXT(JSON) | 实例数据 |
| period | VARCHAR(10) | 可选，库存类筛选用 |
| created_by | VARCHAR(50) | |
| created_at | DATETIME | |
| UNIQUE(template_id) | | 仅 single 模版生效（multi 模版不建该约束，靠应用层区分） |

`data` 形态：
- grid：`{ "rows": [ { "product_name": "...", "month_1_assemble": 100 } ] }`
- form+detail：`{ "scalars": { "contract_no": "..." }, "detail": [ {...} ] }`
- form+fixedRows：`{ "scalars": {...}, "invoice": {"with_inv":0,"no_inv":0}, "fixedRows": {"express":0,"office":0}, "signatures": {"reimbursor":"","date":"","gm_approve":"","cashier":""} }`

single 唯一性靠 **应用层** upsert：`instance_mode=single` 时 POST 查到该模版已有实例则 UPDATE，否则 INSERT。`fin_instance` 不建 `UNIQUE(template_id)`（会破坏 multi）。DB 不做强约束——single 模版由 admin 创建，重复风险低且 service 层兜底。

### `fin_template_perm`（模版权限，独立）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | → sys_user |
| template_id | BIGINT FK | → fin_template |
| can_view | TINYINT(1) | |
| can_download | TINYINT(1) | |
| UNIQUE(user_id, template_id) | | upsert 基础 |

> 9 张内置模版的 `field_schema` / `cell_map` 在 `database/upgrade.sql` 手工 seed；`template_file` 用 Java seed（启动时若 `fin_template.template_file IS NULL` 且 classpath 有对应种子 xlsx 则灌入）。

## 5. 模版上传与字段解析

**入口**：`POST /biz/fin/templates`（multipart：xlsx + name/company/category/instance_mode），仅 admin。

**`FinanceTemplateService.parseTemplate(MultipartFile)` 流程**：
1. Apache POI 打开（XSSFWorkbook）。
2. 识别布局类型 → `field_schema.type`：
   - `grid`：表头占前 2–3 行有合并单元格 → 压平成 `columns`，key 由 `group+sublabel` 拼音/序号生成。
   - `form`：上半部 `label:value` 对（A 列标签、C 列值）→ `scalars`；遇「序号」列头 → `detail`；遇固定类目列（快递/办公费…）→ `fixedRows`。
3. 生成 `cell_map`：grid 列→列字母+起始行；form scalar→单元格；detail→起始行+列字母；fixedRows→行号。
4. 写 `fin_template`（含 BLOB、两个 JSON）。
5. 返回字段树预览，admin 可即时改字段名/key/cell_map（JSON 文本框）再保存。

**内置 9 张不依赖解析器**：`upgrade.sql` 直接写好 schema/cell_map，BLOB 由 Java seed 灌入。解析器只服务新上传模版。

**局限与兜底**：合并表头 group 推断不保证准确；解析后保留「字段编辑」入口让 admin 手改 JSON 再保存；解析失败的 xlsx 直接报错不入库。

## 6. 实例增删改查与下载

**接口**（`/biz/fin`，权限校验在 `FinanceTemplateService` 每个 service 方法首行）：

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/biz/fin/templates` | 登录即可见列表 | 返回当前用户 `can_view` 的模版元数据（不含 file） |
| GET | `/biz/fin/templates/{id}/blank` | `can_view` | 下载空白模版 xlsx |
| GET | `/biz/fin/instances?template_id=` | `can_view` | 列实例；single 恒返回唯一一份 |
| POST | `/biz/fin/instances` | `can_view` | body `{template_id,title,period,data}`；single 走 upsert |
| PUT | `/biz/fin/instances/{id}` | `can_view` | 更新 data/title |
| DELETE | `/biz/fin/instances/{id}` | `can_view`（admin 或创建人） | 删除实例 |
| GET | `/biz/fin/instances/{id}/export` | **`can_download`** | 生成填充后 xlsx |

**下载 `exportInstance(id)`**：
1. 取实例 + 模版 `template_file` + `cell_map`。
2. POI 打开空白 xlsx；按 `cell_map` 回写 `data`：
   - grid：从数据起始行起逐行按列字母写；不足补空行，超出 `shiftRows` 或截断。
   - form scalar：写指定单元格。
   - detail：从起始行逐行写，超出 `shiftRows` + 复制上一行 style。
   - fixedRows：按类目行号写。
3. 自动重算：付款 `小计/合计/大写`，报销 `本次报销合计/大写`，大写金额用新工具类 `ChineseAmount`。
4. 响应头 `Content-Disposition: attachment; filename*=UTF-8''<实例名>.xlsx`，返回二进制。
5. `AuditService.log(user, "财务", "下载", 实例名, ip)`。

**审计**：新建/改/删/下载均走现有 `AuditService.log(...)` 落 `audit_log`，不另建表。

**前端 `FinanceTemplate.tsx`**：挂侧栏新二级分类「财务管理 → 财务模版」（在 `erpTables` 加一条占位 `fin_template` 以进入 Layout 树）。左：模版列表按 company/category 分组；右：实例编辑器按 `field_schema.type` 动态渲染 grid/明细/固定行；顶部「新建实例」「下载 xlsx」按钮。single 模版直接展示唯一实例。

**权限校验落点**：service 每方法首行 `checkPerm(userId, templateId, "view"|"download")`，不满足抛 403；admin 默认全通过。

## 7. 模版权限管理 UI

**接口**（`/biz/fin/perms`，仅 admin）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/biz/fin/perms?user_id=` | 返回该用户对全部模版 `{template_id, can_view, can_download}`，缺省 false |
| PUT | `/biz/fin/perms` | body `{user_id, perms:[...]}`，`INSERT ... ON DUPLICATE KEY UPDATE` 整体覆盖 |

**前端 `UserManagement.tsx`**：新增 Tab「财务模版权限」。选副账号后：
- 表格行=9 张模版（按 company 分组着色），列=`模版名 | 查看 | 下载`，复选框独立。
- 顶部快捷按钮：`全部可见` / `全部可下载` / `清空`。
- 底部「保存权限」调 `PUT /biz/fin/perms`。
- admin 自身不出现（service 硬编码绕过）。

**侧栏入口**：非 admin 需在老 `sys_user.permissions` 里勾「财务管理」canView 才在侧栏看到「财务模版」入口（沿用老机制给入口）；模版可见性细粒度由新 `fin_template_perm` 控。

**不引入新角色**：复用现有 8 角色，不动 `UserRole` 类型。

## 8. 约束、范围与风险

**新增依赖**：`backend/pom.xml` 加 `org.apache.poi:poi-ooxml:5.2.5` + `commons-collections4`（POI 传递依赖显式锁版）。Java 8 兼容。无前端新依赖。

**范围 in / out**：
- in：9 张内置模版 seed + 上传新模版 + 实例增删改 + xlsx 下载还原 + 模版权限 Tab。
- out：版本/历史快照；多人协同锁；在线 xlsx 可视化编辑；下载后回传导入（留扩展点 `POST /instances/{id}/import`，本期不实现）；跨模版报表汇总。

**安全约束**：
- 新接口不走 `DataController`、不拼表名；全用 `template_id`(BIGINT FK) 参数化查询，规避 `safe()` 表名正则路径。
- 权限校验放 service 层方法首行，不依赖 controller 注解（与 `JwtFilter` 自定义认证一致）。
- `template_file` BLOB 不经前端明文中转；仅 `/templates/{id}/blank` 与 `/instances/{id}/export` 返回二进制且都过权限。
- 上传 `spring.servlet.multipart.max-file-size` 调到 5MB；解析 try/catch，异常不入库。

**测试**：
- 后端 `FinanceTemplateServiceTest`（`@SpringBootTest` + 真实 MySQL `erp_system`，遵循 AGENTS.md）：上传解析 3 类型、single upsert、下载回填数值一致、权限 403。其余 `-DskipTests`。
- 前端：无测试框架，靠 `npx tsc --noEmit`；手测 admin/各角色。

**风险**：
| 风险 | 缓解 |
|---|---|
| 合并表头解析不稳 | 内置 9 张手工 seed；新上传 best-effort + admin 可手改 JSON |
| POI 插行破坏格式 | 优先写已有单元格；明细超量才 `shiftRows` 并复制上一行 style |
| 大写金额算错 | `ChineseAmount` 单测覆盖 0/负/万/亿/角分 |
| BLOB 撑大 DB | 模版数有限，单文件 ~200KB，可接受；实例只存 JSON |
| 两套权限并存令 admin 困惑 | UI 文案区分：「模块权限」管 162 表 CRUD，「财务模版权限」管 9 表查看/下载 |

**非目标对齐**：不动 `JwtUtil/JwtFilter`；不动 `sys_user.permissions` 老字段；不改 `vite.config.js` 代理（应已为 localhost）。

## 9. 实现里程碑（给 writing-plans 的分块提示）

1. DB：`upgrade.sql` 加 3 表 + 9 张 seed（schema/cell_map JSON）。
2. 后端依赖：POI。
3. 后端：`FinanceTemplateService`（解析/实例/导出/权限）+ `BizController` 7 个端点 + `ChineseAmount` 工具。
4. 后端 Java seed：启动灌 9 张 BLOB。
5. 前端：`FinanceTemplate.tsx` + `erpTables` 占位 + `api` 客户端方法。
6. 前端：`UserManagement.tsx` 加「财务模版权限」Tab。
7. 测试 + 手测。
