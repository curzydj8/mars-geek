// 标题屏星空背景（独立小模块，无游戏依赖）
const cv = document.getElementById('star-canvas');
if (cv) {
  const ctx = cv.getContext('2d');
  let stars = [];
  function resize() {
    cv.width = cv.clientWidth;
    cv.height = cv.clientHeight;
    stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: Math.random() * 1.6 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
  }
  resize();
  window.addEventListener('resize', resize);
  (function frame(t) {
    if (!document.getElementById('start-screen').hidden) {
      ctx.fillStyle = '#060409';
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 1400 + s.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#cfe4ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  })(0);
}
