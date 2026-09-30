# 火星极客 Mars Geek · 品牌官网 + 后台管理系统

> 把硬核知识，做成好玩的东西。

本仓库是一个**可直接部署的完整 Web SaaS 应用**：品牌官网（静态）+
生产级后台登录 / 注册 / RBAC 权限 / 用户管理 / 媒体资源管理 / 数据统计 / 系统设置。

- 品牌官网：https://curzydj8.github.io/mars-geek/（GitHub Pages，纯静态）
- 后台登录页（需 Node 服务）：`http://你的服务器:3000/login.html`
- 后台 Dashboard：`http://你的服务器:3000/admin/`

---

## 功能清单

**认证**
- 邮箱 / 用户名 + 密码登录，失败提示明确（不泄露"账号不存在还是密码错"）
- 登录失败 5 次锁定 15 分钟；登录接口限流（15 分钟 10 次 / IP）
- 注册：邮箱唯一性校验、密码强度校验（8 位 + 3/4 字符类 + 常见密码黑名单）、确认密码，注册成功自动登录
- 忘记密码 / 重置密码（一次性 token，30 分钟有效，重置后踢掉所有旧会话；不存在的邮箱也返回成功，防枚举）
- 修改密码（需验证当前密码，保留当前会话、吊销其他会话）
- 登录态持久化：access token（JWT，15 分钟，内存保存）+ refresh token（httpOnly + SameSite=Strict cookie，服务端轮换、可重用检测）
- 退出登录（吊销 refresh token + 清 cookie）

**RBAC 权限**
- `admin` 管理员：用户增删改查、改角色、禁/启用、看全站统计、改系统配置、管理全部媒体资源
- `user` 普通用户：个人资料、改密、自己的媒体资源、自己的统计
- 前后端双重校验：前端菜单按权限显示，后端每个接口用 `requirePermission` 强制校验；越权直接 403
- 安全护栏：不能删除自己、不能给自己降权、不能移除最后一个可用管理员

**后台 Dashboard**（`/admin/`，移动端响应式）
- 总览、用户管理、媒体资源、数据统计、个人资料、账户设置、系统设置
- 每个列表都有 loading / error / 空数据状态；操作有 toast 成功提示；删除有二次确认

**安全**
- 密码：`crypto.scrypt` 哈希（N=16384），数据库只存哈希；token 只存 SHA-256 哈希
- 全参数化 SQL（node:sqlite），无 SQL 注入面
- 安全头：CSP（`script-src 'self'`，无内联脚本）、X-Frame-Options、nosniff、Referrer-Policy
- 前端所有服务端文本经 `esc()` 转义，防 XSS
- CSRF：鉴权走 `Authorization: Bearer` 头（非 cookie），天然免疫 CSRF；refresh cookie 为 SameSite=Strict + HttpOnly
- `.env` / `*.db` 已加入 `.gitignore`，永不提交密钥

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Node.js 20+ / Express 4 | 唯一运行时依赖 |
| 数据库 | SQLite（`node:sqlite` 内建） | 零配置，文件存储，WAL 模式 |
| 认证 | JWT（access，手写 HS256）+ 旋转 refresh token | 无第三方鉴权依赖 |
| 密码哈希 | `crypto.scrypt`（Node 内建） | 内存硬哈希 |
| 前端 | 原生 HTML/CSS/JS，无构建步骤 | 与现有落地页架构一致 |

> 选型理由：仓库原本是**无构建的纯静态站**，引入 Next.js / NestJS 等重框架会推翻现有架构。
> Express + SQLite + 原生前端在"不破坏现有页面"的前提下给出了完整生产级能力，
> 且只有 1 个 npm 依赖，部署与维护成本最低。

---

## 本地启动

```bash
# 1. 安装依赖（只需 express）
npm install

# 2. 配置（可选）
cp .env.example .env   # 按需修改 PORT / JWT_SECRET 等

# 3. 启动（首次自动建库、跑迁移、创建初始管理员）
npm start
```

打开 http://localhost:3000/（官网）、http://localhost:3000/login.html（登录）、
http://localhost:3000/admin/（后台）。

**初始管理员**（空库首次启动时创建）：
- 邮箱：`SEED_ADMIN_EMAIL`（默认 `admin@marsgeek.local`）
- 密码：`SEED_ADMIN_PASSWORD`，未设置且 `ALLOW_DEFAULT_ADMIN=true` 时为 `MarsGeek2026!ChangeMe`
- ⚠️ 登录后**立即修改密码**；生产环境请设 `ALLOW_DEFAULT_ADMIN=false` 并用下述命令创建：

```bash
npm run create-admin -- boss@example.com boss 'S3cure!Pass123' admin
```

**冒烟测试**（40+ 断言，覆盖注册/登录/RBAC/媒体隔离/密码/会话/限流）：

```bash
npm run smoke
```

---

## API 一览

统一返回：成功 `{ success: true, data: {...} }`；失败 `{ success: false, error: { code, message, details? } }`。

**认证**（`/api/auth`）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/register` | 注册（自动登录） | 公开（可被 `allow_registration` 关闭） |
| POST | `/login` | 登录 | 公开（限流） |
| POST | `/refresh` | 轮换 refresh token | refresh cookie |
| POST | `/logout` | 登出 | 公开 |
| GET | `/me` | 当前用户 + 权限 | 登录 |
| POST | `/forgot-password` | 发送重置邮件 | 公开（限流） |
| POST | `/reset-password` | 用 token 重置密码 | 公开 |
| PUT | `/change-password` | 修改密码 | 登录 |
| PUT | `/profile` | 修改用户名 | 登录 |

**用户管理**（`/api/users`）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/` | 用户列表（分页/搜索） | `users.read` |
| GET | `/:id` | 用户详情（本人或管理员） | `users.read` / 本人 |
| POST | `/` | 创建用户 | `users.write` |
| PUT | `/:id` | 改用户名/角色/状态 | `users.write` |
| DELETE | `/:id` | 删除用户 | `users.write` |

**媒体资源**（`/api/media`，用户只能看自己 + 公开；管理员看全部）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/` | 列表（分页/搜索） | `media.read` |
| POST | `/` | 新建 | `media.write` |
| PUT | `/:id` | 编辑（本人或管理员） | `media.write` |
| DELETE | `/:id` | 删除（本人或管理员） | `media.write` |

**统计 / 设置**

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/stats/overview` | 管理员看全站，普通用户看自己 | `stats.read` |
| GET | `/api/settings/public` | 公开配置 | 公开 |
| GET | `/api/settings` | 全部配置 | `settings.read` |
| PUT | `/api/settings` | 修改配置（白名单 key） | `settings.write` |
| GET | `/api/health` | 健康检查 | 公开 |

---

## 数据库结构

SQLite，迁移文件在 `server/db/migrations/`，通过 `schema_migrations` 表版本管理。

- **roles**（`id`, `name` UNIQUE, `description`）— `admin` / `user`
- **permissions**（`id`, `key` UNIQUE, `description`）— 9 个权限点：
  `profile.read/write`、`media.read/write`、`stats.read`、`users.read/write`、`settings.read/write`
- **role_permissions**（`role_id`, `permission_id` 联合主键）— admin 全授，user 授 5 个基础权限
- **users**（`id`, `email` UNIQUE, `username` UNIQUE, `password_hash`, `role_id` FK,
  `is_active`, `failed_attempts`, `locked_until`, `created_at`, `updated_at`, `last_login_at`）
- **refresh_tokens**（`id`, `user_id` FK 级联, `token_hash` UNIQUE, `expires_at`,
  `revoked_at`, `replaced_by`（重用检测）, `ip`, `user_agent`）
- **password_reset_tokens**（`id`, `user_id` FK 级联, `token_hash` UNIQUE, `expires_at`, `used_at`）
- **media_resources**（`id`, `title`, `type`, `url`, `description`, `visibility`, `owner_id` FK）
- **site_settings**（`key` PK, `value`）— `site_name` / `site_tagline` / `announcement` / `allow_registration`

索引：`users(email)`、`users(username)`、`refresh_tokens(token_hash)`、
`password_reset_tokens(token_hash)`、`media_resources(owner_id)`。

---

## 生产环境部署

> 注意：GitHub Pages 只能托管**纯静态**页面（品牌官网继续走 Pages），
> 后端需要一台能跑 Node.js 的主机（VPS / Render / Railway / Fly.io 等）。

以 VPS（Ubuntu）为例：

```bash
# 1. 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 2. 拉代码、装依赖
git clone https://github.com/curzydj8/mars-geek.git && cd mars-geek
npm install --omit=dev

# 3. 配置环境变量（生产必设）
cat > .env <<'EOF'
NODE_ENV=production
PORT=3000
APP_URL=https://admin.example.com
JWT_SECRET=<用命令生成：node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
DB_PATH=/var/lib/mars-geek/app.db
ALLOW_DEFAULT_ADMIN=false
EOF

# 4. 创建管理员
npm run create-admin -- you@example.com admin '强密码' admin

# 5. 用 systemd / pm2 守护运行，反向代理（Nginx/Caddy）做 HTTPS
npm start
```

生产 checklist：
- [ ] `JWT_SECRET` 为 48 字节以上随机串
- [ ] `ALLOW_DEFAULT_ADMIN=false`，初始密码已修改
- [ ] 全站 HTTPS（Secure cookie、`Strict-Transport-Security` 自动生效）
- [ ] SQLite 文件放在持久化磁盘目录并定期备份；多实例请换 Redis 限流 + Postgres
- [ ] 配置真实 SMTP 后替换 `server/utils/mail.js` 的发信实现（当前为控制台输出）
- [ ] 反向代理透传 `X-Forwarded-For`（已 `trust proxy`，限流依赖客户端 IP）

---

## Skiv（原 Muse.ai）媒体能力集成说明

当前项目**没有用到**任何外部媒体 API，因此未引入相关调用。
如未来需要视频/媒体能力，请遵守以下约定（已在代码中预留）：

1. API Key 只放在服务端 `.env`（`SKIV_API_KEY`），**绝不**出现在前端代码或仓库中；
2. 所有对 Skiv 的调用写在 `server/` 下的新模块（如 `server/integrations/skiv.js`），由后端代理；
3. 前端只调本服务的 `/api/media`，由后端决定是否透传 Skiv；
4. 媒体资源按 `owner_id` / `visibility` 做行级权限，参考 `server/routes/media.js` 的 `scopeClause`。

---

## 目录结构

```
├── index.html / login.html / register.html / forgot.html / reset.html
├── admin/index.html                 # 后台 Dashboard（SPA）
├── assets/css/                      # landing.css / auth.css / admin.css
├── assets/js/                       # landing.js / api.js / auth.js / admin.js
├── server/
│   ├── index.js                     # 入口：静态托管 + API 挂载
│   ├── config.js                    # 环境变量与生产安全检查
│   ├── db/                          # SQLite 初始化、迁移、种子
│   │   └── migrations/001_init.sql
│   ├── middleware/                  # 统一响应 / 安全头 / 限流 / 鉴权 / 校验
│   ├── routes/                      # auth / users / media / stats / settings
│   └── utils/                       # scrypt / JWT / 邮件桩
├── scripts/                         # smoke.js（端到端测试）/ create-admin.js
├── .env.example / .gitignore
└── package.json                     # 唯一依赖：express
```

## 本次新增文件

后端 18 个文件、前端 11 个文件，品牌官网 `index.html` 零视觉改动
（仅把内联 CSS/JS 抽为外部文件以满足 CSP，并在导航加了"登录"入口）。
