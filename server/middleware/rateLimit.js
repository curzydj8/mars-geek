'use strict';
/**
 * 内存版滑动窗口限流（单实例够用；多实例部署请换 Redis）。
 * key: 按 IP；登录/注册等敏感接口使用更严的配额。
 */
const { fail } = require('./response');

const buckets = new Map(); // key -> number[] (timestamps ms)

setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const fresh = arr.filter(t => now - t < 3600_000);
    if (fresh.length) buckets.set(k, fresh); else buckets.delete(k);
  }
}, 60_000).unref();

function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}::${ip}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return fail(res, 429, 'RATE_LIMITED', message || '请求过于频繁，请稍后再试');
    }
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

module.exports = {
  rateLimit,
  loginLimiter: rateLimit({ windowMs: 15 * 60_000, max: 10, message: '登录尝试过于频繁，请 15 分钟后再试' }),
  registerLimiter: rateLimit({ windowMs: 60 * 60_000, max: 10, message: '注册过于频繁，请稍后再试' }),
  forgotLimiter: rateLimit({ windowMs: 60 * 60_000, max: 5, message: '重置邮件发送过于频繁，请稍后再试' }),
};
