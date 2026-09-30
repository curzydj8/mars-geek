'use strict';
/**
 * SQLite 初始化：建库 → 跑迁移 → 种子数据（角色/权限/管理员/默认配置）。
 * 使用 node:sqlite（Node 20+ 内建），全部走参数化查询，杜绝 SQL 注入。
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { hashPassword } = require('../utils/password');

const PERMISSIONS = [
  // key, description
  ['profile.read', '查看自己的资料'],
  ['profile.write', '修改自己的资料与密码'],
  ['media.read', '查看媒体资源'],
  ['media.write', '创建/管理自己的媒体资源'],
  ['stats.read', '查看数据统计'],
  ['users.read', '查看用户列表与详情'],
  ['users.write', '创建/删除用户、修改用户角色与状态'],
  ['settings.read', '查看系统配置'],
  ['settings.write', '修改系统配置'],
];

function openDb() {
  fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
  const db = new DatabaseSync(config.DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

function migrate(db) {
  // 先确保版本表存在（001 迁移本身也会创建，这里保证首次查询不报错）
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const version = f.replace(/\.sql$/, '');
    const done = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
    if (done) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      db.exec('COMMIT;');
      console.log(`[db] migration applied: ${version}`);
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  }
}

function seed(db) {
  // 角色
  const hasRoles = db.prepare('SELECT COUNT(*) AS c FROM roles').get().c > 0;
  if (!hasRoles) {
    db.prepare("INSERT INTO roles (name, description) VALUES ('admin', '管理员：全部权限')").run();
    db.prepare("INSERT INTO roles (name, description) VALUES ('user', '普通用户：仅自己的内容')").run();
    console.log('[db] seeded roles: admin, user');
  }
  // 权限点
  for (const [key, desc] of PERMISSIONS) {
    db.prepare('INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)').run(key, desc);
  }
  // 角色-权限映射
  const adminId = db.prepare("SELECT id FROM roles WHERE name='admin'").get().id;
  const userId = db.prepare("SELECT id FROM roles WHERE name='user'").get().id;
  const allPerms = db.prepare('SELECT id, key FROM permissions').all();
  const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const p of allPerms) grant.run(adminId, p.id);
  for (const p of allPerms) {
    if (['profile.read', 'profile.write', 'media.read', 'media.write', 'stats.read'].includes(p.key)) {
      grant.run(userId, p.id);
    }
  }
  // 默认系统配置
  const defaults = {
    site_name: '火星极客 Mars Geek',
    site_tagline: '把硬核知识，做成好玩的东西',
    allow_registration: '1',          // 是否开放公开注册
    announcement: '',
  };
  const put = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) put.run(k, v);

  // 初始管理员（仅空库时）
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const email = config.SEED_ADMIN_EMAIL;
    let password = config.SEED_ADMIN_PASSWORD;
    if (!password) {
      if (!config.ALLOW_DEFAULT_ADMIN) {
        console.warn('[db] 空库且未提供 SEED_ADMIN_PASSWORD，已跳过管理员种子。请用 npm run create-admin 手动创建。');
        return;
      }
      password = 'MarsGeek2026!ChangeMe';
    }
    db.prepare(
      'INSERT INTO users (email, username, password_hash, role_id) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), 'admin', hashPassword(password), adminId);
    console.warn(`[db] 已创建初始管理员 ${email} / ${password}`);
    console.warn('[db] ⚠️  请立即登录并修改密码；生产环境请关闭 ALLOW_DEFAULT_ADMIN。');
  }
}

function userPermissions(db, userId) {
  return db.prepare(`
    SELECT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN users u ON u.role_id = rp.role_id
    WHERE u.id = ?
  `).all(userId).map(r => r.key);
}

function publicUser(db, userId) {
  const u = db.prepare(`
    SELECT u.id, u.email, u.username, u.is_active, u.created_at, u.updated_at, u.last_login_at,
           r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?
  `).get(userId);
  if (!u) return null;
  u.permissions = userPermissions(db, userId);
  return u;
}

let _db = null;
function getDb() {
  if (!_db) {
    _db = openDb();
    migrate(_db);
    seed(_db);
  }
  return _db;
}

module.exports = { getDb, publicUser, userPermissions, PERMISSIONS };
