'use strict';
/**
 * 系统设置 API。
 * - GET /public：无需登录，仅暴露可公开项（站点名/标语/是否开放注册/公告）
 * - GET /：settings.read（管理员）
 * - PUT /：settings.write（管理员），白名单 key
 */
const express = require('express');
const { getDb } = require('../db');
const { ok, fail } = require('../middleware/response');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();
const nowIso = () => new Date().toISOString();

const PUBLIC_KEYS = ['site_name', 'site_tagline', 'allow_registration', 'announcement'];
const EDITABLE_KEYS = ['site_name', 'site_tagline', 'allow_registration', 'announcement'];

function allSettings(db) {
  const rows = db.prepare('SELECT key, value, updated_at FROM site_settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------- GET /api/settings/public ----------
router.get('/public', (req, res) => {
  const all = allSettings(getDb());
  const pub = {};
  for (const k of PUBLIC_KEYS) pub[k] = all[k] ?? '';
  return ok(res, { settings: pub });
});

// ---------- GET /api/settings ----------
router.get('/', requireAuth, requirePermission('settings.read'), (req, res) => {
  return ok(res, { settings: allSettings(getDb()) });
});

// ---------- PUT /api/settings ----------
router.put('/', requireAuth, requirePermission('settings.write'), (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body).filter(k => EDITABLE_KEYS.includes(k));
  if (!keys.length) return fail(res, 400, 'NO_CHANGES', '没有可更新的配置项');
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  );
  for (const k of keys) {
    let v = String(body[k] ?? '').slice(0, 2000);
    if (k === 'allow_registration') v = v === '1' || v === 'true' ? '1' : '0';
    stmt.run(k, v, nowIso());
  }
  return ok(res, { settings: allSettings(db) });
});

module.exports = router;
