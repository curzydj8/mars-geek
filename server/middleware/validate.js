'use strict';
/**
 * 输入校验：邮箱 / 用户名 / 密码强度。
 * 所有 API 入参先校验再入库；错误信息明确但不泄露系统细节。
 */
const { fail } = require('./response');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,24}$/;

const COMMON_PASSWORDS = new Set([
  '123456', '12345678', 'password', 'qwerty', 'abc123', '111111',
  '123123', 'admin123', 'letmein', 'welcome', 'monkey',
]);

function checkPasswordStrength(password) {
  const issues = [];
  if (password.length < 8) issues.push('密码至少 8 位');
  if (password.length > 72) issues.push('密码过长（最多 72 位）');
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) issues.push('需包含小写字母、大写字母、数字、符号中的至少 3 种');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push('密码过于常见，请换一个');
  // 简单评分 0-4（前端强度条用）
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (classes >= 3) score++;
  if (classes === 4 && password.length >= 12) score++;
  return { valid: issues.length === 0, issues, score: Math.min(score, 4) };
}

function validate(rules) {
  // rules: { field: (value) => string|null } 返回错误信息或 null
  return (req, res, next) => {
    const errors = {};
    for (const [field, fn] of Object.entries(rules)) {
      const msg = fn(req.body ? req.body[field] : undefined);
      if (msg) errors[field] = msg;
    }
    if (Object.keys(errors).length) {
      return fail(res, 400, 'VALIDATION_ERROR', '输入有误，请检查后重试', errors);
    }
    next();
  };
}

const vEmail = (v) => {
  if (typeof v !== 'string' || !v.trim()) return '邮箱不能为空';
  if (v.length > 254 || !EMAIL_RE.test(v.trim())) return '邮箱格式不正确';
  return null;
};
const vUsername = (v) => {
  if (typeof v !== 'string' || !v.trim()) return '用户名不能为空';
  if (!USERNAME_RE.test(v.trim())) return '用户名为 2-24 位字母/数字/下划线/中文';
  return null;
};
const vPassword = (v) => {
  if (typeof v !== 'string' || !v) return '密码不能为空';
  const r = checkPasswordStrength(v);
  return r.valid ? null : r.issues[0];
};

module.exports = { validate, vEmail, vUsername, vPassword, checkPasswordStrength };
