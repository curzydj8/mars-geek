'use strict';
/**
 * 极简 JWT (HS256)，仅依赖 node:crypto，避免引入第三方 JWT 库。
 * payload 必须包含 exp（秒级时间戳）。
 */
const crypto = require('node:crypto');

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function sign(payload, secret, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = b64urlEncode(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payloadB64}`).digest();
  return `${header}.${payloadB64}.${b64urlEncode(sig)}`;
}

function verify(token, secret) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payloadB64, sigB64] = parts;
    const expect = crypto.createHmac('sha256', secret).update(`${header}.${payloadB64}`).digest();
    const actual = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (expect.length !== actual.length || !crypto.timingSafeEqual(expect, actual)) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64));
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
