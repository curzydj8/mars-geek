// ============================================================
// planet.js —— 从太空看火星：行星球体绘制（含自转）
// 被 title-bg.js（标题屏）与 descent.js（降落过场）共用
// ============================================================

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 生成一张"火星表面纹理"（横向卷动即自转）
export function makeSurface(seed, w = 1024, h = 512) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const rnd = mulberry32(seed);

  // 基底：火星红
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#c96a3e');
  base.addColorStop(0.5, '#b3562f');
  base.addColorStop(1, '#a04a2a');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // 深色"海"（火星暗区）
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = h * 0.2 + rnd() * h * 0.6;
    const rx = 40 + rnd() * 130, ry = 20 + rnd() * 60;
    g.fillStyle = `rgba(90,40,26,${0.18 + rnd() * 0.25})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // 浅色尘埃区
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, y = rnd() * h;
    const rx = 30 + rnd() * 90, ry = 15 + rnd() * 40;
    g.fillStyle = `rgba(226,150,100,${0.12 + rnd() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // 陨石坑点
  for (let i = 0; i < 160; i++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 9;
    g.fillStyle = `rgba(70,32,22,${0.25 + rnd() * 0.3})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(230,160,110,0.28)';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  // 极冠（上下白边，北极冠小、南极冠大）
  g.fillStyle = 'rgba(240,244,250,0.92)';
  g.fillRect(0, 0, w, 10 + rnd() * 6);
  g.fillRect(0, h - 16 - rnd() * 8, w, 24);
  g.fillStyle = 'rgba(240,244,250,0.35)';
  g.fillRect(0, 16, w, 14);
  g.fillRect(0, h - 40, w, 16);

  return cv;
}

// 在 (cx, cy) 画半径 r 的火星；rot01 ∈ [0,1) 为自转相位
export function drawMars(ctx, cx, cy, r, surface, rot01) {
  if (r <= 0) return;
  ctx.save();

  // 大气辉光
  const glow = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.28);
  glow.addColorStop(0, 'rgba(255,122,62,0.30)');
  glow.addColorStop(0.6, 'rgba(255,122,62,0.10)');
  glow.addColorStop(1, 'rgba(255,122,62,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.28, 0, Math.PI * 2);
  ctx.fill();

  // 球体裁剪 + 卷动表面纹理
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const sw = surface.width, sh = surface.height;
  const ox = Math.floor(((rot01 % 1) + 1) % 1 * sw) % sw;
  const dx = cx - r, dy = cy - r, dw = 2 * r, dh = 2 * r;
  if (ox === 0) {
    ctx.drawImage(surface, dx, dy, dw, dh);
  } else {
    const w1 = dw * (sw - ox) / sw;
    ctx.drawImage(surface, ox, 0, sw - ox, sh, dx, dy, w1, dh);
    ctx.drawImage(surface, 0, 0, ox, sh, dx + w1, dy, dw - w1, dh);
  }

  // 球面明暗：左上光照、边缘变暗（临边昏暗）
  const shade = ctx.createRadialGradient(
    cx - r * 0.45, cy - r * 0.45, r * 0.1, cx, cy, r * 1.08);
  shade.addColorStop(0, 'rgba(255,236,212,0.20)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(12,3,1,0.74)');
  ctx.fillStyle = shade;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();

  // 大气边缘高光线
  ctx.save();
  ctx.strokeStyle = 'rgba(255,175,115,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
