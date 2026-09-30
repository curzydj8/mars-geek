'use strict';
/**
 * 密码哈希：使用 Node 内建 crypto.scrypt（内存硬哈希，抗暴力破解）。
 * 存储格式: scrypt$N$r$p$salt(hex)$hash(hex)
 * 永远不要存储或记录明文密码。
 */
const crypto = require('node:crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 64, SALTLEN = 16;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const salt = crypto.randomBytes(SALTLEN);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: parseInt(n, 10), r: parseInt(r, 10), p: parseInt(p, 10),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** sha256 哈希：用于 refresh token / 重置 token 的存储（数据库泄露时无法直接冒用）。 */
function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

module.exports = { hashPassword, verifyPassword, sha256Hex };
