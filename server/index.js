'use strict';
/**
 * 火星极客 Mars Geek — 服务入口
 * 同源部署：静态页面（品牌官网 + 登录/注册/后台）与 /api/* 同源提供，
 * 避免跨域与 cookie/鉴权复杂度。
 */
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { getDb } = require('./db');
const { ok, fail } = require('./middleware/response');
const { securityHeaders, cors } = require('./middleware/security');

const ROOT = path.join(__dirname, '..'); // 仓库根目录（index.html 所在）

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // 反向代理后正确取客户端 IP（配合限流）

app.use(securityHeaders);
app.use(cors);
app.use(express.json({ limit: '100kb' }));

// ---- 静态资源：只暴露页面与 assets，禁止访问服务端内部目录 ----
const BLOCKED = [/^\/server(\/|$)/, /^\/data(\/|$)/, /^\/scripts(\/|$)/, /^\/node_modules(\/|$)/, /\.db($|\?)/, /^\/package\.json$/, /^\/\.env/];
app.use((req, res, next) => {
  if (BLOCKED.some(re => re.test(req.path))) return res.status(404).send('Not found');
  next();
});
app.use(express.static(ROOT, { dotfiles: 'deny', index: 'index.html', extensions: ['html'] }));

// ---- API ----
app.get('/api/health', (req, res) => ok(res, { ok: true, time: new Date().toISOString(), version: '1.0.0' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/media', require('./routes/media'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));

// ---- 404 与全局错误处理（统一 JSON） ----
app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', '接口不存在'));
// 未知页面回退到品牌官网首页
app.use((req, res) => res.sendFile(path.join(ROOT, 'index.html')));
 // eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : err);
  if (res.headersSent) return;
  if (err && err.type === 'entity.parse.failed') {
    return fail(res, 400, 'BAD_JSON', '请求体不是合法 JSON');
  }
  return fail(res, 500, 'INTERNAL_ERROR', config.IS_PROD ? '服务器开小差了，请稍后再试' : String((err && err.message) || err));
});

// ---- 启动 ----
getDb(); // 建库 + 迁移 + 种子
const server = app.listen(config.PORT, () => {
  console.log(`[mars-geek] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  console.log(`[mars-geek] landing : ${config.APP_URL}/`);
  console.log(`[mars-geek] admin   : ${config.APP_URL}/admin/`);
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}

module.exports = app;
