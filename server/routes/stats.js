'use strict';
/**
 * 数据统计 API。
 * - 管理员(stats.read 全量)：用户总数/今日新增/近30天注册趋势/媒体资源数
 * - 普通用户：自己的媒体数与账号信息（同样需要 stats.read 权限）
 */
const express = require('express');
const { getDb } = require('../db');
const { ok } = require('../middleware/response');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();
const isAdmin = (u) => u.role === 'admin';

router.get('/overview', requireAuth, requirePermission('stats.read'), (req, res) => {
  const db = getDb();
  if (!isAdmin(req.user)) {
    const myMedia = db.prepare('SELECT COUNT(*) AS c FROM media_resources WHERE owner_id = ?').get(req.user.id).c;
    return ok(res, {
      stats: {
        my_media_count: myMedia,
        member_since: req.user.created_at,
        role: req.user.role,
      },
    });
  }
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').get().c;
  const todayNew = db.prepare("SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date('now')").get().c;
  const totalMedia = db.prepare('SELECT COUNT(*) AS c FROM media_resources').get().c;
  const trend = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count FROM users
    WHERE created_at >= date('now', '-29 days') GROUP BY day ORDER BY day
  `).all();
  const byRole = db.prepare(`
    SELECT r.name AS role, COUNT(u.id) AS count FROM roles r
    LEFT JOIN users u ON u.role_id = r.id GROUP BY r.name
  `).all();
  return ok(res, {
    stats: {
      total_users: totalUsers,
      active_users: activeUsers,
      today_new_users: todayNew,
      total_media: totalMedia,
      registrations_30d: trend,
      users_by_role: byRole,
    },
  });
});

module.exports = router;
