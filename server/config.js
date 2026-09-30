'use strict';
/**
 * 集中读取环境变量并做生产环境安全检查。
 */
const crypto = require('node:crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error('[FATAL] 生产环境必须设置 JWT_SECRET，服务拒绝启动。');
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[WARN] 未设置 JWT_SECRET，已生成临时随机密钥（重启后所有 token 失效）。');
}

const config = {
  NODE_ENV,
  IS_PROD,
  PORT: parseInt(process.env.PORT || '3000', 10),
  APP_URL: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  JWT_SECRET,
  ACCESS_TOKEN_TTL_SEC: 15 * 60,          // access token 15 分钟
  REFRESH_TOKEN_TTL_SEC: 30 * 24 * 3600,  // refresh token 30 天
  RESET_TOKEN_TTL_SEC: 30 * 60,           // 密码重置链接 30 分钟有效
  DB_PATH: process.env.DB_PATH || './data/app.db',
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || 'admin@marsgeek.local',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || '',
  ALLOW_DEFAULT_ADMIN: process.env.ALLOW_DEFAULT_ADMIN !== 'false',
  COOKIE_SECURE: IS_PROD, // 生产(https)下 cookie 才标记 Secure
  MAIL_FROM: process.env.MAIL_FROM || 'no-reply@marsgeek.local',
  SMTP_HOST: process.env.SMTP_HOST || '',
};

module.exports = config;
