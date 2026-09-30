'use strict';
/**
 * 端到端冒烟测试：node scripts/smoke.js
 * 起一个临时库的新服务进程，跑完注册/登录/RBAC/媒体/密码全流程后退出。
 * 任一步失败即非零退出并打印原因。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3457;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mg-smoke-')), 'app.db');
const ADMIN_PASS = 'SmokeAdmin123!';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
}

// 简易 cookie jar
const jar = {};
function storeCookies(res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2];
  }
}
function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}
async function api(method, p, { body, token, useCookies = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (useCookies && cookieHeader()) headers.Cookie = cookieHeader();
  const res = await fetch(BASE + p, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

async function waitReady(proc) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

async function main() {
  const proc = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB, ALLOW_DEFAULT_ADMIN: 'true', SEED_ADMIN_PASSWORD: ADMIN_PASS, APP_URL: BASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', d => { out += d; });
  proc.stderr.on('data', d => { out += d; });
  const kill = () => proc.kill();

  try {
    await waitReady(proc);
    console.log('— server ready, DB:', DB);

    // 1. 注册
    console.log('1) 注册流程');
    let r = await api('POST', '/api/auth/register', { useCookies: false, body: {
      email: 'u1@test.local', username: 'u1', password: 'Strong123!@#', confirmPassword: 'Strong123!@#',
    }});
    check('注册成功 201 且自动登录', r.status === 201 && r.json.success && !!r.json.data.accessToken, JSON.stringify(r.json).slice(0, 200));
    const u1Token = r.json.data.accessToken;
    check('注册返回 refresh cookie', !!jar.mg_rt);

    r = await api('POST', '/api/auth/register', { useCookies: false, body: {
      email: 'u1@test.local', username: 'u1b', password: 'Strong123!@#', confirmPassword: 'Strong123!@#',
    }});
    check('重复邮箱 409', r.status === 409 && r.json.error.code === 'EMAIL_EXISTS');

    r = await api('POST', '/api/auth/register', { useCookies: false, body: {
      email: 'weak@test.local', username: 'weak', password: '12345678', confirmPassword: '12345678',
    }});
    check('弱密码被拒绝 400', r.status === 400 && r.json.error.code === 'VALIDATION_ERROR');

    // 2. 登录
    console.log('2) 登录流程');
    r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u1@test.local', password: 'Wrong123!@#' } });
    check('错误密码 401', r.status === 401 && r.json.error.code === 'INVALID_CREDENTIALS');
    r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u1', password: 'Strong123!@#' } });
    check('用户名登录成功', r.status === 200 && !!r.json.data.accessToken);
    const loginToken = r.json.data.accessToken;

    // 3. me 与未授权
    console.log('3) 鉴权');
    r = await api('GET', '/api/auth/me', { useCookies: false });
    check('无 token 访问 me → 401', r.status === 401);
    r = await api('GET', '/api/auth/me', { token: loginToken, useCookies: false });
    check('me 返回用户+权限', r.status === 200 && r.json.data.user.role === 'user' && r.json.data.user.permissions.includes('media.read'));
    check('me 不泄露 password_hash', !JSON.stringify(r.json).includes('password_hash'));

    // 4. RBAC：普通用户不能访问用户管理
    console.log('4) RBAC');
    r = await api('GET', '/api/users', { token: loginToken, useCookies: false });
    check('普通用户 GET /users → 403', r.status === 403);

    // 管理员登录
    r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'admin@marsgeek.local', password: ADMIN_PASS } });
    check('管理员登录成功', r.status === 200 && r.json.data.user.role === 'admin');
    const adminToken = r.json.data.accessToken;
    r = await api('GET', '/api/users', { token: adminToken, useCookies: false });
    check('管理员 GET /users → 200 且分页', r.status === 200 && r.json.data.total >= 2);

    // 管理员创建用户 → 提权 → 删除
    r = await api('POST', '/api/users', { token: adminToken, useCookies: false, body: {
      email: 'tmp@test.local', username: 'tmp', password: 'Strong123!@#', role: 'user',
    }});
    check('管理员创建用户 201', r.status === 201);
    const tmpId = r.json.data.user.id;
    r = await api('PUT', `/api/users/${tmpId}`, { token: adminToken, useCookies: false, body: { role: 'admin' } });
    check('修改用户角色', r.status === 200 && r.json.data.user.role === 'admin');
    r = await api('PUT', '/api/users/999999', { token: adminToken, useCookies: false, body: { role: 'user' } });
    check('不存在的用户 404', r.status === 404);
    const meId = (await api('GET', '/api/auth/me', { token: adminToken, useCookies: false })).json.data.user.id;
    r = await api('DELETE', `/api/users/${meId}`, { token: adminToken, useCookies: false });
    check('不能删除自己 400', r.status === 400);
    r = await api('DELETE', `/api/users/${tmpId}`, { token: adminToken, useCookies: false });
    check('删除用户成功', r.status === 200);

    // 5. 媒体资源隔离
    console.log('5) 媒体资源');
    r = await api('POST', '/api/media', { token: loginToken, useCookies: false, body: {
      title: 'u1 的私密视频', type: 'video', url: 'https://example.com/v1.mp4', visibility: 'private',
    }});
    check('创建媒体 201', r.status === 201);
    const mediaId = r.json.data.item.id;
    // 注册第二个用户
    r = await api('POST', '/api/auth/register', { useCookies: false, body: {
      email: 'u2@test.local', username: 'u2', password: 'Strong123!@#', confirmPassword: 'Strong123!@#',
    }});
    const u2Token = r.json.data.accessToken;
    r = await api('GET', '/api/media', { token: u2Token, useCookies: false });
    check('u2 看不到 u1 的私密资源', r.status === 200 && !r.json.data.items.some(i => i.id === mediaId));
    r = await api('GET', '/api/media', { token: adminToken, useCookies: false });
    check('管理员能看到全部', r.status === 200 && r.json.data.items.some(i => i.id === mediaId));
    r = await api('DELETE', `/api/media/${mediaId}`, { token: u2Token, useCookies: false });
    check('u2 不能删 u1 的资源 403', r.status === 403);

    // 6. 统计
    console.log('6) 统计');
    r = await api('GET', '/api/stats/overview', { token: u2Token, useCookies: false });
    check('普通用户统计仅自己', r.status === 200 && r.json.data.stats.my_media_count === 0);
    r = await api('GET', '/api/stats/overview', { token: adminToken, useCookies: false });
    check('管理员统计全量', r.status === 200 && r.json.data.stats.total_users >= 3);

    // 7. 密码流程：忘记 → 重置 → 改密
    console.log('7) 密码流程');
    r = await api('POST', '/api/auth/forgot-password', { useCookies: false, body: { email: 'u1@test.local' } });
    check('忘记密码返回成功(不泄露)', r.status === 200);
    r = await api('POST', '/api/auth/forgot-password', { useCookies: false, body: { email: 'nobody@test.local' } });
    check('不存在的邮箱同样返回成功', r.status === 200);
    // 从服务端控制台“邮件”里提取真实重置链接，走完整重置流程
    await new Promise(r => setTimeout(r, 500));
    const m = out.match(/reset\.html\?token=([a-f0-9]+)/);
    check('重置邮件已发出(含真实 token)', !!m, out.slice(-300));
    if (m) {
      const realToken = m[1];
      r = await api('POST', '/api/auth/reset-password', { useCookies: false, body: {
        token: realToken, password: 'Reset123!@#', confirmPassword: 'Reset123!@#',
      }});
      check('真实 token 重置成功', r.status === 200);
      r = await api('POST', '/api/auth/reset-password', { useCookies: false, body: {
        token: realToken, password: 'Reset123!@#', confirmPassword: 'Reset123!@#',
      }});
      check('重置 token 一次性使用(重复用被拒绝)', r.status === 400);
      r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u1@test.local', password: 'Reset123!@#' } });
      check('重置后的密码可登录', r.status === 200);
    }
    // 改密（当前密码为重置后的 Reset123!@#）
    r = await api('PUT', '/api/auth/change-password', { token: loginToken, useCookies: false, body: {
      currentPassword: 'Wrong123!@#', newPassword: 'NewStrong123!@#', confirmPassword: 'NewStrong123!@#',
    }});
    check('当前密码错误被拒绝', r.status === 400 && r.json.error.code === 'WRONG_PASSWORD');
    // 重新登录拿到与当前密码匹配的 access token（loginToken 的旧密码已失效）
    r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u1@test.local', password: 'Reset123!@#' } });
    const u1Fresh = r.json.data.accessToken;
    r = await api('PUT', '/api/auth/change-password', { token: u1Fresh, useCookies: false, body: {
      currentPassword: 'Reset123!@#', newPassword: 'NewStrong123!@#', confirmPassword: 'NewStrong123!@#',
    }});
    check('改密成功', r.status === 200);
    r = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u1@test.local', password: 'NewStrong123!@#' } });
    check('新密码可登录', r.status === 200);

    // 8. refresh + logout
    console.log('8) 会话');
    const jarBackup = { ...jar };
    r = await api('POST', '/api/auth/refresh', {});
    check('refresh 轮换成功', r.status === 200 && !!r.json.data.accessToken);
    check('refresh 后 cookie 已轮换', jar.mg_rt && jar.mg_rt !== jarBackup.mg_rt);
    r = await api('POST', '/api/auth/logout', {});
    check('登出成功', r.status === 200);
    r = await api('POST', '/api/auth/refresh', {});
    check('登出后 refresh 失效', r.status === 401);

    // 9. 设置
    console.log('9) 设置');
    r = await api('GET', '/api/settings/public', { useCookies: false });
    check('公开设置无需登录', r.status === 200 && !!r.json.data.settings.site_name);
    r = await api('PUT', '/api/settings', { token: u2Token, useCookies: false, body: { site_name: 'hack' } });
    check('普通用户不能改设置 403', r.status === 403);
    r = await api('PUT', '/api/settings', { token: adminToken, useCookies: false, body: { announcement: 'hello' } });
    check('管理员改设置成功', r.status === 200 && r.json.data.settings.announcement === 'hello');

    // 10. 限流（快速打 12 次登录，应触发 429）
    console.log('10) 限流');
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const rr = await api('POST', '/api/auth/login', { useCookies: false, body: { identifier: 'u2@test.local', password: 'bad' } });
      if (rr.status === 429) { got429 = true; break; }
    }
    check('登录接口触发限流', got429);
  } finally {
    kill();
  }
  console.log(failures === 0 ? '\n🎉 全部冒烟测试通过' : `\n💥 ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('smoke fatal:', e); process.exit(1); });
