'use strict';
/**
 * 统一 JSON 响应结构：
 * 成功: { success: true, data: {...} }
 * 失败: { success: false, error: { code, message, details? } }
 */
function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
}

module.exports = { ok, fail };
