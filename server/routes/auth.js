'use strict';
/**
 * 认证 API：注册 / 登录 / 刷新 / 登出 / me / 忘记 / 重置 / 改密
 */
const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const { getDb, publicUser } = require('../db');
const { ok, fail } = require('../middleware/response');
const { requireAuth, getBearer } = require('../middleware/auth');
const { validate, vEmail, vUsername, vPassword } = require('../middleware/validate');
const { loginLimiter, registerLimiter, forgotLimiter } = require('../middleware/rateLimit');
const { hashPassword, verifyPassword, sha256Hex } = require('../utils/password');
const { sign } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/mail');

const router = express.Router();
const nowIso = () => new Date().toISOString();

const REFRESH_COOKIE = 'mg_rt';
function setRefreshCookie(res, raw) {
  const parts = [
    `${REFRESH_COOKIE}=${raw}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api/auth',
    `Max-Age=${config.REFRESH_TOKEN_TTL_SEC}`,
  ];
  if (config.COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearRefreshCookie(res) {
  const parts = [`${REFRESH_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/api/auth', 'Max-Age=0'];
  if (config.COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** 签发 token 对：access(JWT, 内存保存) + refresh(随机串, httpOnly cookie, 数据库存哈希) */
function issueTokenPair(db, userId, req) {
  const accessToken = sign(
    { sub: userId, typ: 'access' }, config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SEC
  );
  const raw = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + config.REFRESH_TOKEN_TTL_SEC * 1000).toISOString();
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, sha256Hex(raw), expires, req.ip || null, (req.headers['user-agent'] || '').slice(0, 255));
  return { accessToken, refreshRaw: raw };
}

function revokeAllRefreshTokens(db, userId, exceptHash = null) {
  if (exceptHash) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?')
      .run(nowIso(), userId, exceptHash);
  } else {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(nowIso(), userId);
  }
}

// ---------- POST /api/auth/register ----------
router.post('/register',
  registerLimiter,
  validate({
    email: vEmail,
    username: vUsername,
    password: vPassword,
    confirmPassword: (v, req) => undefined, // 单独校验一致性
  }),
  (req, res) => {
    const db = getDb();
    if (req.body.password !== req.body.confirmPassword) {
      return fail(res, 400, 'VALIDATION_ERROR', '两次输入的密码不一致', { confirmPassword: '两次输入的密码不一致' });
    }
    const allow = db.prepare("SELECT value FROM site_settings WHERE key='allow_registration'").get();
    if (allow && allow.value !== '1') {
      return fail(res, 403, 'REGISTRATION_DISABLED', '注册通道已关闭');
    }
    const email = req.body.email.trim().toLowerCase();
    const username = req.body.username.trim();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return fail(res, 409, 'EMAIL_EXISTS', '该邮箱已被注册', { email: '该邮箱已被注册' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return fail(res, 409, 'USERNAME_EXISTS', '该用户名已被占用', { username: '该用户名已被占用' });
    }
    const roleId = db.prepare("SELECT id FROM roles WHERE name='user'").get().id;
    const r = db.prepare(
      'INSERT INTO users (email, username, password_hash, role_id) VALUES (?, ?, ?, ?)'
    ).run(email, username, hashPassword(req.body.password), roleId);
    const { accessToken, refreshRaw } = issueTokenPair(db, Number(r.lastInsertRowid), req);
    setRefreshCookie(res, refreshRaw);
    return ok(res, { user: publicUser(db, Number(r.lastInsertRowid)), accessToken }, 201);
  }
);

// ---------- POST /api/auth/login ----------
router.post('/login',
  loginLimiter,
  validate({ identifier: (v) => (!v || !String(v).trim() ? '请输入邮箱或用户名' : null), password: (v) => (!v ? '请输入密码' : null) }),
  (req, res) => {
    const db = getDb();
    const ident = String(req.body.identifier).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(ident, req.body.identifier.trim());
    // 统一错误信息：不透露是账号不存在还是密码错误
    const bad = () => fail(res, 401, 'INVALID_CREDENTIALS', '邮箱/用户名或密码不正确');
    if (!user) return bad();
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return fail(res, 423, 'ACCOUNT_LOCKED', '账户因多次登录失败被暂时锁定，请稍后再试');
    }
    if (!user.is_active) return fail(res, 403, 'ACCOUNT_DISABLED', '账户已被禁用，请联系管理员');
    if (!verifyPassword(req.body.password, user.password_hash)) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= 5) {
        db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?')
          .run(new Date(Date.now() + 15 * 60_000).toISOString(), user.id);
      } else {
        db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
      }
      return bad();
    }
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
      .run(nowIso(), user.id);
    const { accessToken, refreshRaw } = issueTokenPair(db, user.id, req);
    setRefreshCookie(res, refreshRaw);
    return ok(res, { user: publicUser(db, user.id), accessToken });
  }
);

// ---------- POST /api/auth/refresh ----------
router.post('/refresh', (req, res) => {
  const db = getDb();
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(REFRESH_COOKIE + '='))?.slice(REFRESH_COOKIE.length + 1);
  if (!raw) return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
  const hash = sha256Hex(raw);
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hash);
  if (!row) return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
  // 重用检测：已轮换过的旧 token 再次出现 → 疑似被盗，吊销该用户全部会话
  if (row.revoked_at) {
    if (row.replaced_by) {
      revokeAllRefreshTokens(db, row.user_id);
      console.warn(`[auth] refresh token 重用检测，用户 ${row.user_id} 全部会话已吊销`);
    }
    return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
  }
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(nowIso(), row.id);
    return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
  }
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(row.user_id);
  if (!user || !user.is_active) return fail(res, 401, 'UNAUTHENTICATED', '账户不可用');
  // 轮换
  const newRaw = crypto.randomBytes(48).toString('hex');
  const newHash = sha256Hex(newRaw);
  const expires = new Date(Date.now() + config.REFRESH_TOKEN_TTL_SEC * 1000).toISOString();
  db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?').run(nowIso(), newHash, row.id);
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(row.user_id, newHash, expires, req.ip || null, (req.headers['user-agent'] || '').slice(0, 255));
  setRefreshCookie(res, newRaw);
  const accessToken = sign({ sub: row.user_id, typ: 'access' }, config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SEC);
  return ok(res, { accessToken });
});

// ---------- POST /api/auth/logout ----------
router.post('/logout', (req, res) => {
  const db = getDb();
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(REFRESH_COOKIE + '='))?.slice(REFRESH_COOKIE.length + 1);
  if (raw) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(nowIso(), sha256Hex(raw));
  }
  // 也支持用 access token 主动吊销本次会话的 refresh（换设备登出场景由前端调 refresh 轮换覆盖）
  const bearer = getBearer(req);
  if (bearer) {
    const { verify } = require('../utils/jwt');
    const p = verify(bearer, config.JWT_SECRET);
    if (p && p.typ === 'access') revokeAllRefreshTokens(db, p.sub);
  }
  clearRefreshCookie(res);
  return ok(res, { message: '已退出登录' });
});

// ---------- GET /api/auth/me ----------
router.get('/me', requireAuth, (req, res) => ok(res, { user: req.user }));

// ---------- POST /api/auth/forgot-password ----------
router.post('/forgot-password',
  forgotLimiter,
  validate({ email: vEmail }),
  async (req, res) => {
    const db = getDb();
    const email = req.body.email.trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    // 无论邮箱是否存在都返回成功，防止邮箱枚举
    if (user) {
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(user.id);
      const raw = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + config.RESET_TOKEN_TTL_SEC * 1000).toISOString();
      db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
        .run(user.id, sha256Hex(raw), expires);
      const url = `${config.APP_URL}/reset.html?token=${raw}`;
      try { await sendPasswordResetEmail(email, url); }
      catch (e) { console.error('[mail] 发送失败:', e.message); }
    }
    return ok(res, { message: '如果该邮箱已注册，重置链接已发送，请查收' });
  }
);

// ---------- POST /api/auth/reset-password ----------
router.post('/reset-password',
  validate({
    token: (v) => (!v ? '重置链接无效' : null),
    password: vPassword,
  }),
  (req, res) => {
    if (req.body.password !== req.body.confirmPassword) {
      return fail(res, 400, 'VALIDATION_ERROR', '两次输入的密码不一致', { confirmPassword: '两次输入的密码不一致' });
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?')
      .get(sha256Hex(String(req.body.token)));
    if (!row || row.used_at || new Date(row.expires_at) <= new Date()) {
      return fail(res, 400, 'INVALID_TOKEN', '重置链接无效或已过期，请重新申请');
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(hashPassword(req.body.password), nowIso(), row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
    revokeAllRefreshTokens(db, row.user_id); // 重置后踢掉所有旧会话
    return ok(res, { message: '密码已重置，请用新密码登录' });
  }
);

// ---------- PUT /api/auth/change-password ----------
router.put('/change-password',
  requireAuth,
  validate({ currentPassword: (v) => (!v ? '请输入当前密码' : null), newPassword: vPassword }),
  (req, res) => {
    if (req.body.newPassword !== req.body.confirmPassword) {
      return fail(res, 400, 'VALIDATION_ERROR', '两次输入的新密码不一致', { confirmPassword: '两次输入的新密码不一致' });
    }
    const db = getDb();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(req.body.currentPassword, user.password_hash)) {
      return fail(res, 400, 'WRONG_PASSWORD', '当前密码不正确', { currentPassword: '当前密码不正确' });
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(req.body.newPassword), nowIso(), req.user.id);
    // 保留当前会话，吊销其它会话
    const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith(REFRESH_COOKIE + '='))?.slice(REFRESH_COOKIE.length + 1);
    revokeAllRefreshTokens(db, req.user.id, raw ? sha256Hex(raw) : null);
    return ok(res, { message: '密码修改成功' });
  }
);

// ---------- PUT /api/auth/profile ----------
router.put('/profile',
  requireAuth,
  validate({ username: (v) => (v === undefined ? null : vUsername(v)) }),
  (req, res) => {
    const db = getDb();
    if (req.body.username !== undefined) {
      const username = req.body.username.trim();
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
      if (exists) return fail(res, 409, 'USERNAME_EXISTS', '该用户名已被占用', { username: '该用户名已被占用' });
      db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(username, nowIso(), req.user.id);
    }
    return ok(res, { user: publicUser(db, req.user.id) });
  }
);

module.exports = router;
