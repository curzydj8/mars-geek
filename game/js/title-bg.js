// 标题屏星空背景 + 从太空看火星（独立小模块，无游戏依赖）
import { makeSurface, drawMars } from './planet.js';

const cv = document.getElementById('star-canvas');
if (cv) {
  const ctx = cv.getContext('2d');
  const surface = makeSurface(20261001);
  let stars = [];
  let rot = 0.12;
  let lastT = 0;

  function resize() {
    cv.width = cv.clientWidth;
    cv.height = cv.clientHeight;
    stars = Array.from({ length: 190 }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: Math.random() * 1.6 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
  }
  resize();
  window.addEventListener('resize', resize);

  (function frame(t) {
    const dt = Math.min(100, t - lastT || 16);
    lastT = t;
    if (!document.getElementById('start-screen').hidden) {
      // 深空
      ctx.fillStyle = '#060409';
      ctx.fillRect(0, 0, cv.width, cv.height);
      // 星星（闪烁）
      for (const s of stars) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 1400 + s.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#cfe4ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 火星：右侧大球体，缓慢自转（约 150 秒一圈）
      rot = (rot + dt / 150000) % 1;
      const r = Math.min(cv.width, cv.height) * 0.30;
      const px = cv.width > 760 ? cv.width * 0.76 : cv.width * 0.5;
      const py = cv.height * (cv.width > 760 ? 0.42 : 0.30);
      drawMars(ctx, px, py, r, surface, rot);
    }
    requestAnimationFrame(frame);
  })(0);
}
