# ERP 商用部署指南（v5.1）

> 目标读者：负责把本系统部署到生产环境的运维 / 实施工程师。
> 本指南覆盖：Docker 一键部署（推荐）、手工部署、上线前安全检查清单、备份与运维。

---

## 1. 部署架构

```
浏览器 ──> nginx (frontend:80)
             ├── /            → React 静态资源（SPA）
             └── /api/        → Spring Boot (backend:8080)
                                    └──> MySQL 8 (db:3306, 库名固定 erp_system)
```

- 前后端**同源部署**（推荐）：浏览器只与 nginx 通信，`/api/` 由 nginx 反代，不涉及跨域。
- 前后端**分离部署**：前端构建时用 `VITE_API_BASE` 指向后端域名，后端用 `CORS_ALLOWED_ORIGINS` 放行前端域名。

## 2. Docker Compose 一键部署（推荐）

### 2.1 前置要求

| 组件 | 版本 |
|---|---|
| 服务器 | 2 核 4G 起（建议 4 核 8G） |
| Docker | 20.10+ |
| Docker Compose | v2 |

### 2.2 部署步骤

```bash
git clone <仓库地址> erp && cd erp

# 1) 生成环境变量文件
cp .env.example .env

# 2) 编辑 .env —— 三个必填项全部要改！
#    MYSQL_PASSWORD          数据库密码
#    JWT_SECRET              JWT 签名密钥（openssl rand -base64 48 生成）
#    SEED_ADMIN_PASSWORD     首个 admin 的初始密码
vim .env

# 3) 构建并启动（首次约 5-10 分钟）
docker compose up -d --build

# 4) 查看状态与健康检查
docker compose ps                 # 三个容器都应是 healthy
docker compose logs -f backend    # 跟踪后端日志
```

访问 `http://<服务器IP>:8081`（端口可在 `.env` 用 `PORT` 修改），用
`admin` + 你设置的 `SEED_ADMIN_PASSWORD` 登录。

> ⚠️ 首次启动时，MySQL 容器会自动执行 `database/` 下 5 个初始化脚本（仅当数据卷为空时），
> 并按 `SEED_DEMO_DATA`（默认 true）装载 9 个月跨度的自洽演示业务数据 ——
> 登录后仪表盘/报表/工作流/财务页面即有完整直观的数据，便于评估与培训。
> **正式接入真实业务前**，请在 `.env` 中把 `SEED_DEMO_USERS` 与 `SEED_DEMO_DATA` 都改为 `false`
> 并重建（已有业务数据的库永远不会被演示数据覆盖）。

### 2.3 升级

```bash
git pull
docker compose up -d --build      # 数据在命名卷中，升级不影响业务数据
```

> 建议升级前先备份（见第 5 节），并阅读 CHANGELOG 中的数据库变更说明。

## 3. 手工部署（不用 Docker）

### 3.1 数据库

```bash
# MySQL 8.0，utf8mb4。按顺序执行（顺序敏感，脚本均幂等可重跑）：
mysql -uroot -p < database/init.sql            # 基础表
mysql -uroot -p < database/upgrade.sql         # 扩展表/工作流
mysql -uroot -p < database/upgrade2.sql        # 字典/唯一键/外键
mysql -uroot -p < database/registry_seed.sql   # 表注册种子
mysql -uroot -p < database/upgrade3.sql        # v5.2 列补丁（BOM父子件等）

# 可选：手工装载演示数据（后端首次启动也会在业务表为空时自动装载）
mysql -uroot -p erp_system < backend/src/main/resources/demo-data/demo_data.sql
```

### 3.2 后端

```bash
cd backend
export APP_ENV=prod
export DB_HOST=127.0.0.1 DB_USER=erp DB_PASSWORD='<强密码>'
export JWT_SECRET="$(openssl rand -base64 48)"
export SEED_DEMO_USERS=false SEED_ADMIN_PASSWORD='<admin初始密码>'
mvn clean package -Dmaven.test.skip=true
nohup java -XX:MaxRAMPercentage=75.0 -jar target/erp-system-5.1.0.jar \
  --logging.file.name=logs/erp.log &
```

生产环境探活：`GET /health`（返回应用与数据库状态）。

### 3.3 前端

```bash
cd frontend
npm ci
npm run build          # 产物在 dist/
# 将 dist/ 交给 nginx，参考 frontend/nginx.conf 的反代与安全头配置
```

前后端分离部署时：`VITE_API_BASE=https://api.example.com/api npm run build`，
并在后端设置 `CORS_ALLOWED_ORIGINS=https://www.example.com`。

## 4. 上线前安全检查清单 ✅

| # | 项目 | 要求 |
|---|---|---|
| 1 | `JWT_SECRET` | 强随机串 ≥32 字符；`APP_ENV=prod` 时后端会拒绝默认密钥启动 |
| 2 | `MYSQL_PASSWORD` | 强密码；3306 端口不对公网开放（compose 默认不映射） |
| 3 | `SEED_ADMIN_PASSWORD` | 登录后立即在「用户管理」再次修改管理员密码 |
| 4 | `SEED_DEMO_USERS` / `SEED_DEMO_DATA` | 正式生产建议均设 `false`（演示账号 + 演示业务数据） |
| 5 | HTTPS | 在 nginx 前加反向代理（或云负载均衡）终结 TLS；本系统 Cookie 走 Authorization 头，仍需 TLS 防嗅探 |
| 6 | 防火墙 | 仅放行 80/443；后端 8080 与数据库 3306 仅限内网 |
| 7 | 备份 | 按第 5 节配置每日备份 |
| 8 | 审计 | 登录与关键写操作均记录在 `sys_audit` / `sys_login_log`，定期检查异常登录 |

## 5. 备份与恢复

```bash
# 每日备份（crontab -e，凌晨 2 点）
0 2 * * * docker exec erp-db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" erp_system | gzip > /backup/erp_$(date +\%F).sql.gz'

# 恢复
gunzip -c erp_2026-01-01.sql.gz | docker exec -i erp-db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" erp_system'
```

建议保留最近 30 天日备 + 12 个月月备，并定期演练恢复。

## 6. 环境变量速查（后端）

| 变量 | 默认 | 说明 |
|---|---|---|
| `APP_ENV` | `dev` | `prod` 时强制校验 JWT 密钥 |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | `localhost` / `3306` / `erp_system` | 数据库连接 |
| `DB_USER` / `DB_PASSWORD` | `root` / 空 | 数据库凭据 |
| `DB_POOL_MAX` / `DB_POOL_MIN` | `20` / `5` | Hikari 连接池 |
| `JWT_SECRET` | 仅开发占位 | 签名密钥，生产必填 |
| `JWT_EXPIRATION` | `86400000` | Token 有效期（毫秒） |
| `SEED_DEMO_USERS` | `true` | 是否播种演示账号 |
| `SEED_DEMO_DATA` | `true` | 业务表为空时装载 9 个月自洽演示数据；生产设 `false` |
| `SEED_ADMIN_PASSWORD` | 空（用 admin123） | admin 首次创建时的初始密码 |
| `CORS_ALLOWED_ORIGINS` | 本地开发端口 | 跨域白名单，逗号分隔 |
| `SERVER_PORT` | `8080` | 后端监听端口 |
| `LOG_LEVEL` | `info` | `com.erp` 日志级别 |

## 7. 故障排查

| 现象 | 排查 |
|---|---|
| 后端容器反复重启 | `docker compose logs backend`；多为数据库未就绪或 `JWT_SECRET` 未设置 |
| 页面 401 | Token 过期，重新登录；检查服务器时间是否漂移过大 |
| 登录提示「账号已临时锁定」 | 防暴力破解：15 分钟内失败 5 次触发，等待解锁 |
| 上传模板失败 | 仅支持 `.xlsx`，单文件 ≤5MB |
| 仪表盘无数据 | 业务表尚为空属正常；先录入销售/采购单据 |
