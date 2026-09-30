'use strict';
/**
 * 用户管理 API（管理员）。
 * - 列表/详情：users.read
 * - 创建/修改/删除：users.write
 * - 普通用户只能看自己（GET /:id 允许本人；列表仅管理员）
 * - 永远不返回 password_hash
 */
const express = require('express');
const { getDb, publicUser } = require('../db');
const { ok, fail } = require('../middleware/response');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { validate, vEmail, vUsername, vPassword } = require('../middleware/validate');
const { hashPassword } = require('../utils/password');

const router = express.Router();
const nowIso = () => new Date().toISOString();

const LIST_SQL = `
  SELECT u.id, u.email, u.username, u.is_active, u.created_at, u.updated_at, u.last_login_at,
         r.name AS role
  FROM users u JOIN roles r ON r.id = u.role_id`;

// ---------- GET /api/users ----------
router.get('/', requireAuth, requirePermission('users.read'), (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
  const q = (req.query.q || '').trim();
  const where = q ? 'WHERE u.email LIKE ? OR u.username LIKE ?' : '';
  const args = q ? [`%${q}%`, `%${q}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...args).c;
  const items = db.prepare(`${LIST_SQL} ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize)
    .map(u => ({ ...u, permissions: undefined }));
  return ok(res, { items, page, pageSize, total });
});

// ---------- GET /api/users/:id ----------
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return fail(res, 400, 'BAD_ID', '用户 ID 非法');
  const isSelf = req.user.id === id;
  if (!isSelf && !req.user.permissions.includes('users.read')) {
    return fail(res, 403, 'FORBIDDEN', '权限不足');
  }
  const user = publicUser(getDb(), id);
  if (!user) return fail(res, 404, 'NOT_FOUND', '用户不存在');
  return ok(res, { user });
});

// ---------- POST /api/users ----------
router.post('/',
  requireAuth, requirePermission('users.write'),
  validate({ email: vEmail, username: vUsername, password: vPassword, role: (v) => (['admin', 'user'].includes(v) ? null : '角色只能是 admin 或 user') }),
  (req, res) => {
    const db = getDb();
    const email = req.body.email.trim().toLowerCase();
    const username = req.body.username.trim();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return fail(res, 409, 'EMAIL_EXISTS', '该邮箱已被注册', { email: '该邮箱已被注册' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return fail(res, 409, 'USERNAME_EXISTS', '该用户名已被占用', { username: '该用户名已被占用' });
    }
    const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(req.body.role).id;
    const r = db.prepare('INSERT INTO users (email, username, password_hash, role_id) VALUES (?, ?, ?, ?)')
      .run(email, username, hashPassword(req.body.password), roleId);
    return ok(res, { user: publicUser(db, Number(r.lastInsertRowid)) }, 201);
  }
);

function guardLastAdmin(db, targetId) {
  const target = db.prepare('SELECT role_id FROM users WHERE id = ?').get(targetId);
  if (!target) return null;
  const adminRole = db.prepare("SELECT id FROM roles WHERE name='admin'").get().id;
  if (target.role_id !== adminRole) return null;
  const count = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id = ? AND is_active = 1').get(adminRole).c;
  return count <= 1 ? '不能移除最后一个可用管理员' : null;
}

// ---------- PUT /api/users/:id ----------
router.put('/:id',
  requireAuth, requirePermission('users.write'),
  (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return fail(res, 400, 'BAD_ID', '用户 ID 非法');
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return fail(res, 404, 'NOT_FOUND', '用户不存在');
    const { username, role, is_active } = req.body;
    if (username !== undefined) {
      const r = vUsername(username);
      if (r) return fail(res, 400, 'VALIDATION_ERROR', r, { username: r });
      const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
      if (dup) return fail(res, 409, 'USERNAME_EXISTS', '该用户名已被占用');
    }
    if (role !== undefined && !['admin', 'user'].includes(role)) {
      return fail(res, 400, 'VALIDATION_ERROR', '角色只能是 admin 或 user');
    }
    if (is_active !== undefined && ![0, 1, true, false].includes(is_active)) {
      return fail(res, 400, 'VALIDATION_ERROR', 'is_active 非法');
    }
    // 不能给自己降权 / 禁用自己
    if (id === req.user.id && (role === 'user' || is_active === 0 || is_active === false)) {
      return fail(res, 400, 'SELF_LOCKOUT', '不能修改自己的管理员身份或禁用自己');
    }
    if ((role === 'user' || is_active === 0 || is_active === false)) {
      const msg = guardLastAdmin(db, id);
      if (msg) return fail(res, 400, 'LAST_ADMIN', msg);
    }
    const sets = [], args = [];
    if (username !== undefined) { sets.push('username = ?'); args.push(username.trim()); }
    if (role !== undefined) {
      sets.push('role_id = ?');
      args.push(db.prepare('SELECT id FROM roles WHERE name = ?').get(role).id);
    }
    if (is_active !== undefined) { sets.push('is_active = ?'); args.push(is_active ? 1 : 0); }
    if (!sets.length) return fail(res, 400, 'NO_CHANGES', '没有可更新的字段');
    sets.push('updated_at = ?'); args.push(nowIso()); args.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    // 被禁用用户：立即吊销其全部 refresh token
    if (is_active === 0 || is_active === false) {
      db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(nowIso(), id);
    }
    return ok(res, { user: publicUser(db, id) });
  }
);

// ---------- DELETE /api/users/:id ----------
router.delete('/:id', requireAuth, requirePermission('users.write'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return fail(res, 400, 'BAD_ID', '用户 ID 非法');
  if (id === req.user.id) return fail(res, 400, 'SELF_DELETE', '不能删除自己');
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) {
    return fail(res, 404, 'NOT_FOUND', '用户不存在');
  }
  const msg = guardLastAdmin(db, id);
  if (msg) return fail(res, 400, 'LAST_ADMIN', msg);
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // refresh token 级联删除
  return ok(res, { message: '用户已删除' });
});

module.exports = router;
