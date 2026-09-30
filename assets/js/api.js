/* 火星极客 · 前端 API 客户端
 * - access token 只保存在内存变量中（不进 localStorage，降低 XSS 后的长期窃取面）
 * - 401 时自动用 httpOnly cookie 调 /api/auth/refresh 续期，重试一次
 * - 续期失败则跳登录页
 */
(function () {
  'use strict';

  let accessToken = null;
  let refreshPromise = null;
  let meCache = null;

  function setToken(t) { accessToken = t || null; meCache = null; }
  function getToken() { return accessToken; }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.success) {
          setToken(j.data.accessToken);
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch (e) {
      throw { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络后重试' };
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* 非 JSON */ }

    // access token 过期 → 尝试续期后重试一次（登录/注册/刷新接口本身除外）
    if (res.status === 401 && !opts.noRetry && !/^\/(api\/auth\/(login|register|refresh|forgot-password|reset-password))/.test(path)) {
      const okRefreshed = await refresh();
      if (okRefreshed) return request(method, path, body, { ...opts, noRetry: true });
      // 续期失败：跳登录（已在登录页则不跳，避免循环）
      if (!location.pathname.includes('login.html')) {
        location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      }
      throw { code: 'UNAUTHENTICATED', message: '登录已过期，请重新登录' };
    }
    if (!json) throw { code: 'BAD_RESPONSE', message: '服务器返回异常，请稍后重试' };
    if (!json.success) throw json.error;
    return json.data;
  }

  const get = (p, o) => request('GET', p, undefined, o);
  const post = (p, b, o) => request('POST', p, b, o);
  const put = (p, b, o) => request('PUT', p, b, o);
  const del = (p, o) => request('DELETE', p, undefined, o);

  async function me(force) {
    if (meCache && !force) return meCache;
    const data = await get('/api/auth/me');
    meCache = data.user;
    return meCache;
  }

  async function logout() {
    try { await post('/api/auth/logout'); } catch (e) { /* 忽略 */ }
    setToken(null);
    location.href = '/login.html';
  }

  // XSS 防护：所有服务端返回的文本一律转义后再插入 HTML
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
  }

  window.MG = { setToken, getToken, get, post, put, del, me, logout, refresh, esc, fmtDate };
})();
