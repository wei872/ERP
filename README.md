<div align="center">

# ERP 企业管理系统 v5.0

**三包单体仓库 · React 19 前端 + Spring Boot 2.7 后端 + MySQL · 60 个 REST 端点 · 13 个业务页面 · 162 张业务数据表**

基于 [wei872/ERP](https://gitee.com/wei872/erp) 的开源数据模型，重构为现代化技术栈的完整 ERP 系统。

</div>

---

## ✨ 功能概览

系统覆盖 ERP 全流程，所有功能前后端打通、端到端可用，无桩函数、无 mock 残留。

### 🎛️ 业务操作页面（13 个）

| 模块 | 页面 | 说明 |
|---|---|---|
| 📊 控制台 | Dashboard | 销售趋势 / 采购趋势 / 库存金额分布 / KPI 卡片（recharts） |
| 📈 报表中心 | ReportPage | 销售/采购/库存/财务/生产/人力六维度报表，按周/月/年切换 |
| 🔁 工作流审批 | WorkflowPage | 我的待办 + 多级工作流引擎（采购3级/费用2级/请假2级），通过/驳回/提交审批 |
| 📒 会计凭证 | VoucherPage | 手工录凭证（借贷平衡校验）+ 从销售/采购单一键生成凭证 |
| 📊 三大财务报表 | FinancialStatementsPage | 资产负债表 / 利润表 / 现金流量表（按期间聚合） |
| 💸 应收应付核销 | ReconciliationPage | 应收/应付单列表 + 一键核销 + 余额统计 |
| 🏗️ 生产管理 | ProductionPage | 工单创建 → 生产入库 → 报废登记 → 领料确认 → 成本结算 全生命周期 |
| 🧮 MRP 运算 | MrpPage | BOM 净需求运算 + BOM 递归成本滚算 |
| 🛠️ 库存直调 & 期末 | InventoryClosingPage | 直调出入库 + 月末/年终结账 |
| 💰 财务模版库 | FinanceTemplate | Excel 模版上传/下载/实例化/导出 |
| 👤 用户管理 | UserManagement | 用户审核/禁用/启用/删除 + 模块权限配置 + 财务模版权限 |
| 🛡️ RBAC 权限矩阵 | RbacPage | 角色 × 菜单 4 张表（sys_role / sys_menu / sys_role_menu / sys_user_role） |
| 📋 通用数据表 | ModulePage | 162 张业务数据表通用 CRUD + 后端 LIKE 搜索 + CSV 导出 |

### 🔐 认证与权限

- **自定义 JWT 认证**：`JwtUtil` + `JwtFilter` 串联校验（不走 Spring Security 强制）
- **三层权限兜底**：`sys_user.permissions` JSON → `sys_role_menu` RBAC 表 → 硬编码角色映射
- **后端权威校验**：模块前缀级读写边界（`trade_/finance_/prod_/hr_/oa_/cust_/supp_/...`）
- **前端按角色过滤**：8 角色看到不同业务菜单组

## 🏗️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19.2 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · Recharts 3 · 无 React Router / Redux |
| 后端 | Spring Boot 2.7.18 · Java 8 · Maven · JdbcTemplate（无 JPA/MyBatis）· JWT（jjwt 0.11.5）· BCrypt |
| 数据库 | MySQL 8（兼容 5.7+）· utf8mb4 |
| 部署 | Docker Compose · nginx 反向代理 `/api/` → `backend:8080/api/` |

## 📦 目录结构

```
erp/
├── frontend/                   ← React 前端
│   ├── Dockerfile               ← 多阶段构建 → nginx serve :80
│   ├── nginx.conf               ← /api/ 代理到 backend:8080
│   ├── vite.config.js           ← @ → src 别名；dev proxy /api → localhost:8080
│   └── src/
│       ├── main.tsx             ← 入口
│       ├── App.tsx              ← ErrorBoundary + Suspense
│       ├── api/index.ts         ← 全部 API 客户端（auth/Data/biz/fin/rbac）
│       ├── context/AuthContext   ← 认证 / 轮询同步 / 权限助手
│       ├── data/mockData.ts     ← 162 张表配置（cols 数组）
│       ├── types/index.ts       ← User / Permission / UserRole
│       └── components/          ← 13 个页面组件 + Layout
├── backend/                    ← Spring Boot 后端
│   ├── Dockerfile               ← ⚠️ 先 mvn package 再 build
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/erp/
│       │   ├── ErpApplication.java
│       │   ├── config/         ← SecurityConfig（permitAll）/ CorsConfig / WebConfig
│       │   ├── security/       ← JwtUtil + JwtFilter（核心 Token 校验与拦截）
│       │   ├── model/Result.java
│       │   ├── controller/    ← AuthController / DataController / BizController
│       │   └── service/       ← 13 个业务 Service（Workflow/Mrp/Inventory/Finance/...）
│       └── resources/application.yml  ← DB / JWT 配置
├── database/
│   ├── init.sql                ← 78 张基础表 + 预置账号
│   └── upgrade.sql             ← 268 张扩展业务表（CREATE TABLE IF NOT EXISTS 幂等）
├── 财务需求/                    ← 财务模版系统设计规格
├── docs/
├── AGENTS.md                   ← AI 助手在本仓库工作时的注意事项
└── opencode.json
```

## 🚀 快速启动

### 前置要求

- **Node.js** ≥ 18
- **JDK** 8（兼容 11/17）
- **MySQL** 5.7+ 推荐 8.x
- **Maven** 3.6+

### 第 1 步：数据库

```bash
# 创建库 + 加载基础表
mysql -u root -p --default-character-set=utf8mb4 < database/init.sql
# 加载扩展表（幂等，可重复运行）
mysql -u root -p --default-character-set=utf8mb4 < database/upgrade.sql
```

> ⚠️ 顺序敏感：必须先 `init.sql` 后 `upgrade.sql`。`upgrade.sql` 已补齐 162 张业务表，与前端 `mockData.ts` 完全对齐。

### 第 2 步：后端

```bash
cd backend
mvn clean package -DskipTests          # 产出 target/erp-system-5.0.0.jar
java -jar target/erp-system-5.0.0.jar  # → http://localhost:8080/api
```

> DB 配置走 `application.yml`，默认连接 `localhost:3306/erp_system`。生产环境改用环境变量 `JWT_SECRET`，**切勿提交新 secret**。

### 第 3 步：前端

```bash
cd frontend
npm install
npm run dev     # → http://localhost:3000
```

> Vite dev proxy 已默认指向 `http://localhost:8080`（rewrite 掉 `/api`）。生产构建用 `npm run build`（仅 esbuild，**不做类型检查**），手动类型检查用 `npx tsc --noEmit`。

### 第 4 步：登录

```
http://localhost:3000
用户名：admin
密码：  admin123
```

## 🔑 预置测试账号

| 账号 | 密码 | 角色 | 部门 | 可见业务页 |
|---|---|---|---|---|
| **admin** | admin123 | 主账号（管理员） | 管理层 | **全部**（+用户管理/RBAC） |
| zhangsan | 123456 | 销售 | 销售部 | 工作流审批 |
| wujiu | 123456 | 售后 | 售后部 | 工作流审批 |
| lisi | 123456 | 仓管 | 仓储部 | 工作流审批 / 生产管理 / 库存直调&期末 |
| wangwu | 123456 | 会计 | 财务部 | 工作流审批 / 会计凭证 / 三大财务报表 / 应收应付核销 / 库存直调&期末 |
| zhaoliu | 123456 | 生产 | 生产部 | 工作流审批 / 生产管理 / MRP运算 |
| sunqi | 123456 | 人事 | 人事部 | 工作流审批 |
| zhouba | 123456 | 采购 | 采购部 | 工作流审批 |

> 注册新账号默认状态为 `pending`，需 admin 在用户管理审核通过后才能登录。

## 🐳 Docker 部署

```bash
# 前端
cd frontend && docker build -t erp-frontend .
# 后端（⚠️ 先 mvn package 再 build，Dockerfile 不会自己打包）
cd backend && mvn clean package -DskipTests && docker build -t erp-backend .
# docker-compose up（如有 docker-compose.yml）
```

## 📚 端点速查

后端共 **60 个 REST 端点**，前端 13 个页面全覆盖。

| 路径前缀 | Controller | 说明 |
|---|---|---|
| `/auth/**` | AuthController | 登录/注册/用户管理/RBAC 矩阵（11 端点） |
| `/data/{table}` | DataController | 通用 CRUD + init-db（4 端点，162 张表） |
| `/biz/**` | BizController | 仪表盘/工作流/凭证/MRP/生产/核销/财务模版/导出（45 端点） |

> 关键业务端点：
> `/biz/my-tasks` `/biz/approval/{no}` `/biz/approve|reject/{no}` 工作流 ·
> `/biz/voucher` `/biz/finance/voucher-from-sale|purchase/{id}` 凭证 ·
> `/biz/report/balance-sheet|income-statement|cash-flow` 三大报表 ·
> `/biz/production/*` 生产 5 端点 · `/biz/mrp-calc` `/biz/mrp-rollup-cost` MRP ·
> `/biz/stock-in|out` `/biz/month-close` `/biz/year-close` 库存与期末 ·
> `/biz/reconciliation` 核销 · `/biz/fin/*` 财务模版 10 端点 · `/biz/export/{table}` CSV 导出

## 🧪 开发与验证

```bash
# 前端类型检查
cd frontend && npx tsc --noEmit

# 前端构建（仅 esbuild，不做类型检查）
cd frontend && npm run build

# 后端打包（跳过测试）
cd backend && mvn clean package -DskipTests

# 后端测试（需可用 MySQL erp_system 库）
cd backend && mvn test
```

## 📖 更多文档

- [`AGENTS.md`](./AGENTS.md) — AI 助手在本仓库工作时的注意事项（三包结构、JWT 重复类陷阱、Vite proxy 配置等）
- [`财务需求/`](./财务需求/) — 财务模版系统设计规格
- [`docs/`](./docs/) — 项目文档

## 📄 License

MIT（沿袭原项目）

---

<div align="center">

**该项目所有功能已端到端打通 · 后端无桩函数 · 前端无死 API · 162 张表 CRUD 全可用**

</div>