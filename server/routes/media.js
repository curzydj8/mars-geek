'use strict';
/**
 * 媒体/视频资源管理 API。
 * - 管理员：全部资源
 * - 普通用户：自己的 + visibility=public 的
 * - 写操作：media.write，且只能改自己的（管理员除外）
 * 说明：如需接入 Skiv(原 Muse.ai) 的媒体能力，相关 API Key 只保存在
 * 服务端 .env (SKIV_API_KEY)，由后端代理调用，永不暴露到浏览器。
 */
const express = require('express');
const { getDb } = require('../db');
const { ok, fail } = require('../middleware/response');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();
const nowIso = () => new Date().toISOString();
const isAdmin = (u) => u.role === 'admin';

function scopeClause(user) {
  if (isAdmin(user)) return { where: '', args: [] };
  return { where: 'WHERE (m.owner_id = ? OR m.visibility = ?)', args: [user.id, 'public'] };
}

function serialize(row) {
  return {
    id: row.id, title: row.title, type: row.type, url: row.url,
    description: row.description, visibility: row.visibility,
    owner_id: row.owner_id, owner: row.owner,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

// ---------- GET /api/media ----------
router.get('/', requireAuth, requirePermission('media.read'), (req, res) => {
  const db = getDb();
  const { where, args } = scopeClause(req.user);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
  const q = (req.query.q || '').trim();
  const qWhere = q
    ? `${where ? where + ' AND' : 'WHERE'} (m.title LIKE ? OR m.description LIKE ?)`
    : where;
  const qArgs = q ? [...args, `%${q}%`, `%${q}%`] : args;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM media_resources m ${qWhere}`).get(...qArgs).c;
  const items = db.prepare(`
      SELECT m.*, u.username AS owner FROM media_resources m
      LEFT JOIN users u ON u.id = m.owner_id
      ${qWhere} ORDER BY m.id DESC LIMIT ? OFFSET ?
    `).all(...qArgs, pageSize, (page - 1) * pageSize).map(serialize);
  return ok(res, { items, page, pageSize, total });
});

// ---------- POST /api/media ----------
router.post('/', requireAuth, requirePermission('media.write'), (req, res) => {
  const { title, type, url, description, visibility } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, 400, 'VALIDATION_ERROR', '标题不能为空', { title: '标题不能为空' });
  if (!url || !String(url).trim()) return fail(res, 400, 'VALIDATION_ERROR', '链接不能为空', { url: '链接不能为空' });
  if (url.length > 2048 || !/^https?:\/\//i.test(url.trim())) {
    return fail(res, 400, 'VALIDATION_ERROR', '链接必须是 http(s) 开头的有效 URL', { url: '链接格式不正确' });
  }
  const vis = visibility === 'public' ? 'public' : 'private';
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO media_resources (title, type, url, description, visibility, owner_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(title).trim().slice(0, 200), String(type || 'link').slice(0, 32),
    url.trim(), String(description || '').slice(0, 2000), vis, req.user.id);
  const row = db.prepare(`SELECT m.*, u.username AS owner FROM media_resources m LEFT JOIN users u ON u.id=m.owner_id WHERE m.id=?`)
    .get(Number(r.lastInsertRowid));
  return ok(res, { item: serialize(row) }, 201);
});

function loadForWrite(db, id, user) {
  const row = db.prepare('SELECT * FROM media_resources WHERE id = ?').get(id);
  if (!row) return { err: [404, 'NOT_FOUND', '资源不存在'] };
  if (!isAdmin(user) && row.owner_id !== user.id) return { err: [403, 'FORBIDDEN', '只能操作自己的资源'] };
  return { row };
}

// ---------- PUT /api/media/:id ----------
router.put('/:id', requireAuth, requirePermission('media.write'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return fail(res, 400, 'BAD_ID', '资源 ID 非法');
  const db = getDb();
  const { row, err } = loadForWrite(db, id, req.user);
  if (err) return fail(res, ...err);
  const sets = [], args = [];
  const { title, type, url, description, visibility } = req.body || {};
  if (title !== undefined) {
    if (!String(title).trim()) return fail(res, 400, 'VALIDATION_ERROR', '标题不能为空');
    sets.push('title = ?'); args.push(String(title).trim().slice(0, 200));
  }
  if (type !== undefined) { sets.push('type = ?'); args.push(String(type).slice(0, 32)); }
  if (url !== undefined) {
    if (!/^https?:\/\//i.test(String(url).trim())) return fail(res, 400, 'VALIDATION_ERROR', '链接格式不正确');
    sets.push('url = ?'); args.push(String(url).trim().slice(0, 2048));
  }
  if (description !== undefined) { sets.push('description = ?'); args.push(String(description).slice(0, 2000)); }
  if (visibility !== undefined) {
    if (!['public', 'private'].includes(visibility)) return fail(res, 400, 'VALIDATION_ERROR', 'visibility 非法');
    sets.push('visibility = ?'); args.push(visibility);
  }
  if (!sets.length) return fail(res, 400, 'NO_CHANGES', '没有可更新的字段');
  sets.push('updated_at = ?'); args.push(nowIso()); args.push(id);
  db.prepare(`UPDATE media_resources SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  const fresh = db.prepare(`SELECT m.*, u.username AS owner FROM media_resources m LEFT JOIN users u ON u.id=m.owner_id WHERE m.id=?`).get(id);
  return ok(res, { item: serialize(fresh) });
});

// ---------- DELETE /api/media/:id ----------
router.delete('/:id', requireAuth, requirePermission('media.write'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return fail(res, 400, 'BAD_ID', '资源 ID 非法');
  const db = getDb();
  const { err } = loadForWrite(db, id, req.user);
  if (err) return fail(res, ...err);
  db.prepare('DELETE FROM media_resources WHERE id = ?').run(id);
  return ok(res, { message: '资源已删除' });
});

module.exports = router;
