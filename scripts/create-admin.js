'use strict';
/**
 * 手动创建管理员/用户：npm run create-admin -- <email> <username> <password> [role]
 * 示例：npm run create-admin -- boss@marsgeek.local boss 'S3cure!Pass' admin
 */
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/utils/password');
const { vEmail, vUsername, vPassword } = require('../server/middleware/validate');

const [email, username, password, role = 'admin'] = process.argv.slice(2);
const fail = (m) => { console.error('❌ ' + m); process.exit(1); };

if (!email || !username || !password) fail('用法：npm run create-admin -- <email> <username> <password> [role]');
const e1 = vEmail(email), e2 = vUsername(username), e3 = vPassword(password);
if (e1) fail('邮箱：' + e1);
if (e2) fail('用户名：' + e2);
if (e3) fail('密码：' + e3);
if (!['admin', 'user'].includes(role)) fail('role 只能是 admin 或 user');

const db = getDb();
const em = email.trim().toLowerCase();
if (db.prepare('SELECT 1 FROM users WHERE email = ? OR username = ?').get(em, username.trim())) {
  fail('该邮箱或用户名已存在');
}
const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(role).id;
const r = db.prepare('INSERT INTO users (email, username, password_hash, role_id) VALUES (?, ?, ?, ?)')
  .run(em, username.trim(), hashPassword(password), roleId);
console.log(`✅ 已创建 ${role} 用户 #${r.lastInsertRowid}：${em}`);
process.exit(0);
