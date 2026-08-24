# 变更日志

## v5.1.0（2026-08-24）—— 商用加固版

### 🔐 安全加固
- **登录防暴力破解**：同一「用户名 + IP」连续失败 5 次锁定 15 分钟（`AuthController`）。
- **注册密码策略**：至少 8 位且同时包含字母与数字；用户名限 3-32 位字母/数字/下划线。
- **修复管理员密码被重置漏洞**：重启播种逻辑只创建不存在的账号，绝不覆盖已有密码/资料（此前每次重启都会把改过的 admin 密码重置回 admin123）。
- **JWT 生产强校验**：`APP_ENV=prod` 时使用内置默认密钥直接拒绝启动；密钥长度不足 32 字节同样拒绝启动；Token 有效期可用 `JWT_EXPIRATION` 配置。
- **CORS 白名单化**：不再允许 `*` + 凭证的危险组合，仅放行 `CORS_ALLOWED_ORIGINS` 中列出的 Origin。
- **API 安全响应头**：`X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy`、API 响应 `Cache-Control: no-store`。
- **全局异常兜底**：新增 `GlobalExceptionHandler`，统一错误格式，杜绝堆栈/SQL 细节泄露；登录异常信息不再回显内部错误。

### 🚀 部署与运维
- **新增 `docker-compose.yml`**：MySQL 8 + 后端 + 前端三容器一键部署，含健康检查、数据卷持久化、首次自动执行全部 4 个初始化 SQL。
- **后端 Dockerfile 多阶段构建**：镜像内完成 Maven 打包，运行镜像改为 JRE + 非 root 用户 + 健康检查。
- **新增 `.env.example`**：集中声明所有部署环境变量。
- **配置全面环境变量化**：数据库连接、连接池、JWT、日志级别等均支持环境变量注入，代码库不再携带任何真实凭据。
- **健康检查端点** `GET /health`：返回应用状态 + 数据库连通性，供容器探活/负载均衡使用。
- **nginx 加固**：gzip、安全响应头、静态资源长缓存、`client_max_body_size` 对齐后端。

### 📦 仓库与前端
- **移除误提交的构建产物**：`frontend/node_modules`（7800+ 文件）与 `frontend/dist` 不再纳入版本控制，`.gitignore` 补齐。
- **路由级代码分割**：12 个业务页面改为 `React.lazy` 懒加载，登录后首屏 JS 从 ~593KB 降至 ~41KB（gzip 后首屏约 75KB）。
- **API 基址可配置**：`VITE_API_BASE` 支持前后端分离部署。
- 注册页密码提示与后端策略对齐（8 位 + 字母 + 数字）。

### 📖 文档
- 新增 `docs/DEPLOYMENT.md`：商用部署指南（Docker/手工/安全检查清单/备份恢复）。
- README 更新生产部署与环境变量说明。

---

## v5.0.0 —— 首个全功能版本

- 13 个业务页面、60 个 REST 端点、162 张业务表全链路打通。
- 工作流审批、会计凭证、三大财务报表、应收应付核销、生产全生命周期、MRP、期末结账、财务模板库、用户管理与 RBAC。
