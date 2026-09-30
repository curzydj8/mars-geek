'use strict';
/**
 * 认证与授权中间件。
 * - requireAuth：校验 Authorization: Bearer <accessToken>，把 {id,email,username,role,permissions} 挂到 req.user
 * - requireRole('admin')：角色校验
 * - requirePermission('users.read')：细粒度权限校验
 * 权限只在服务端校验，前端隐藏菜单仅为体验优化。
 */
const config = require('../config');
const { verify } = require('../utils/jwt');
const { getDb, publicUser } = require('../db');
const { fail } = require('./response');

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req, res, next) {
  const token = getBearer(req);
  if (!token) return fail(res, 401, 'UNAUTHENTICATED', '未登录或登录已过期');
  const payload = verify(token, config.JWT_SECRET);
  if (!payload || payload.typ !== 'access') {
    return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
  }
  const user = publicUser(getDb(), payload.sub);
  if (!user) return fail(res, 401, 'UNAUTHENTICATED', '用户不存在');
  if (!user.is_active) return fail(res, 403, 'ACCOUNT_DISABLED', '账户已被禁用');
  req.user = user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return fail(res, 403, 'FORBIDDEN', '权限不足');
    }
    next();
  };
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.includes(perm)) {
      return fail(res, 403, 'FORBIDDEN', '权限不足');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requirePermission, getBearer };
