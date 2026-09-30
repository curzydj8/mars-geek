/* 火星极客 · 认证页共享逻辑 */
(function () {
  'use strict';

  // 星空背景
  function drawStars() {
    const c = document.getElementById('stars');
    if (!c) return;
    const ctx = c.getContext('2d');
    function size() { c.width = innerWidth; c.height = innerHeight; }
    size(); addEventListener('resize', size);
    const stars = Array.from({ length: 130 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + .3,
      s: Math.random() * .25 + .05, p: Math.random() * Math.PI * 2,
    }));
    (function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const st of stars) {
        st.p += .02;
        const a = .35 + Math.abs(Math.sin(st.p)) * .55;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#cdd6f4';
        ctx.beginPath();
        ctx.arc(st.x * c.width, st.y * c.height, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    })();
  }

  // 密码可见切换
  function bindPwToggle(scope) {
    (scope || document).querySelectorAll('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '隐藏' : '显示';
      });
    });
  }

  // 密码强度（与后端规则对齐：8位+、3/4字符类、长度加成）
  function strengthScore(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(re => re.test(pw)).length;
    if (classes >= 3) score++;
    if (classes === 4 && pw.length >= 12) score++;
    return Math.min(score, 4);
  }
  const STRENGTH_LABEL = ['弱', '一般', '中等', '强', '很强'];
  const STRENGTH_COLOR = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#34d399'];
  function bindStrength(inputId) {
    const input = document.getElementById(inputId);
    const wrap = input && input.closest('.field').querySelector('.strength');
    if (!input || !wrap) return;
    const bars = wrap.querySelectorAll('.bar');
    const lbl = wrap.querySelector('.lbl');
    input.addEventListener('input', () => {
      const v = input.value;
      const s = v ? strengthScore(v) : 0;
      bars.forEach((b, i) => { b.style.background = v && i < s ? STRENGTH_COLOR[s] : ''; });
      lbl.textContent = v ? STRENGTH_LABEL[s] : '';
      lbl.style.color = v ? STRENGTH_COLOR[s] : '';
    });
  }

  // 表单错误 / 提示
  function fieldEl(form, name) { return form.querySelector(`[data-field="${name}"]`); }
  function setFieldError(form, name, msg) {
    const f = fieldEl(form, name);
    if (!f) return false;
    f.classList.add('invalid');
    const e = f.querySelector('.ferr');
    if (e) e.textContent = msg;
    return true;
  }
  function clearErrors(form) {
    form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    const a = form.querySelector('.alert');
    if (a) a.className = 'alert';
  }
  function showAlert(form, type, msg) {
    const a = form.querySelector('.alert');
    if (!a) return;
    a.className = 'alert show ' + type;
    a.textContent = msg;
  }
  function applyApiError(form, err) {
    clearErrors(form);
    let mapped = false;
    if (err && err.details && typeof err.details === 'object') {
      for (const [k, v] of Object.entries(err.details)) {
        if (setFieldError(form, k, v)) mapped = true;
      }
    }
    const msg = (err && err.message) || '请求失败，请稍后重试';
    if (!mapped || !err.details) showAlert(form, 'error', msg);
    else {
      // 字段级错误也同步一条顶部提示，方便扫读
      showAlert(form, 'error', msg);
    }
  }

  async function withLoading(btn, fn) {
    btn.disabled = true;
    btn.classList.add('loading');
    try { return await fn(); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  }

  function getNext() {
    const n = new URLSearchParams(location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/admin/';
  }

  // 已登录（cookie 仍有效）→ 直接进后台，避免重复登录
  async function redirectIfLoggedIn() {
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success) {
        MG.setToken(j.data.accessToken);
        location.href = getNext();
        return true;
      }
    } catch (e) { /* 未登录，留在登录页 */ }
    return false;
  }

  window.AuthUI = {
    drawStars, bindPwToggle, bindStrength, clearErrors, showAlert,
    applyApiError, withLoading, getNext, redirectIfLoggedIn,
  };
  document.addEventListener('DOMContentLoaded', drawStars);
})();
