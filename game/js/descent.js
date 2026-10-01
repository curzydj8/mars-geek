// ============================================================
// descent.js —— 开局降落过场：从太空俯冲到火星表面
// 太空逼近 → 大气层进入（加热抖动）→ 闪光 → MARS CORE AI 启动
// 纯展示模块，不碰游戏状态；点击可跳过
// ============================================================
import { makeSurface, drawMars } from './planet.js';

const BOOT_LINES = [
  '▸ MARS CORE AI v2.1 …… 初始化完成',
  '▸ 轨道扫描：中纬度地下水冰储量丰富',
  '▸ 着陆场确认：埃律西昂平原',
  '▸ 20 艘星舰已就位 · 50 台机器人待命',
  '▸ 首要指令：建立火星第一座电站',
];

const T_ENTRY = 2.4;    // 逼近时长
const T_FLASH = 3.7;    // 进入大气层结束
const T_REVEAL = 4.5;   // 切换到游戏屏
const TOTAL = 5.6;      // 过场总时长

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export function playDescent(canvas, onReveal, onDone) {
  const ctx = canvas.getContext('2d');
  const surface = makeSurface(0xC0FFEE);
  let W = 0, H = 0;
  const stars = Array.from({ length: 220 }, () => ({
    x: Math.random(), y: Math.random(),
    r: Math.random() * 1.8 + 0.4, tw: Math.random() * Math.PI * 2,
  }));

  function resize() {
    W = canvas.width = canvas.clientWidth || window.innerWidth;
    H = canvas.height = canvas.clientHeight || window.innerHeight;
  }
  resize();

  const t0 = performance.now();
  let revealed = false, finished = false;

  function reveal() {
    if (revealed) return;
    revealed = true;
    onReveal();
  }
  function finish() {
    if (finished) return;
    finished = true;
    reveal();
    onDone();
  }
  canvas.onclick = finish;

  function drawStars(t, streak) {
    for (const s of stars) {
      const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.4 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe4ff';
      if (streak > 0.05) {
        // 高速逼近：星星拉成 streak
        const len = streak * 60;
        ctx.fillRect(s.x * W, s.y * H - len / 2, s.r, len);
      } else {
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStreakLines(p) {
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W;
      const len = 60 + Math.random() * 220 * p;
      const a = 0.08 + Math.random() * 0.22 * p;
      ctx.strokeStyle = `rgba(255,${140 + (Math.random() * 80) | 0},60,${a})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.lineTo(x + (Math.random() - 0.5) * 30, len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBootText(t) {
    const el = t - (T_FLASH + 0.15); // 启动文字起始
    ctx.save();
    ctx.font = '15px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = W * 0.08;
    let y = H * 0.60;
    for (let i = 0; i < BOOT_LINES.length; i++) {
      const lt = el - i * 0.34;
      if (lt < 0) break;
      const line = BOOT_LINES[i];
      const chars = Math.min(line.length, Math.floor(lt / 0.018));
      const blink = (i === BOOT_LINES.length - 1 && chars >= line.length)
        ? (Math.sin(t * 6) > 0 ? '▊' : '') : '';
      ctx.fillStyle = i === 0 ? '#8affc1' : 'rgba(150,230,190,0.92)';
      ctx.shadowColor = 'rgba(80,255,160,0.5)';
      ctx.shadowBlur = 8;
      ctx.fillText(line.slice(0, chars) + blink, x, y);
      y += 30;
    }
    ctx.restore();
    // 右下角跳过提示
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('点击跳过', W - 20, H - 24);
    ctx.restore();
  }

  function frame(now) {
    if (finished) return;
    const t = (now - t0) / 1000;
    ctx.fillStyle = '#030208';
    ctx.fillRect(0, 0, W, H);

    if (t < T_ENTRY) {
      // —— 阶段一：太空逼近 ——
      const p = easeInOut(Math.min(1, t / T_ENTRY));
      const r = lerp(Math.min(W, H) * 0.30, Math.max(W, H) * 1.12, p);
      const shx = (Math.random() - 0.5) * 7 * p * p;
      const shy = (Math.random() - 0.5) * 7 * p * p;
      drawStars(t, p);
      drawMars(ctx, W * 0.5 + shx, H * 0.52 + shy, r, surface, 0.15 + t * 0.008);
    } else if (t < T_FLASH) {
      // —— 阶段二：大气层进入 ——
      const p = (t - T_ENTRY) / (T_FLASH - T_ENTRY);
      const shx = (Math.random() - 0.5) * 22 * p;
      const shy = (Math.random() - 0.5) * 22 * p;
      // 表面纹理极速放大（穿过云层）
      const zx = 1 + p * 3.2;
      const sw = surface.width, sh = surface.height;
      const dw = W * zx, dh = dw * (sh / sw);
      ctx.drawImage(surface, (W - dw) / 2 + shx, (H - dh) / 2 + shy, dw, dh);
      // 加热辉光（边缘橙红）
      const heat = ctx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.72);
      heat.addColorStop(0, 'rgba(255,120,40,0)');
      heat.addColorStop(1, `rgba(255,${(90 + 60 * p) | 0},30,${0.35 + 0.5 * p})`);
      ctx.fillStyle = heat;
      ctx.fillRect(0, 0, W, H);
      drawStreakLines(p);
    } else {
      // —— 阶段三：闪光 + AI 启动 ——
      if (t >= T_REVEAL) reveal();
      const p = Math.min(1, (t - T_FLASH) / (TOTAL - T_FLASH));
      // 炽白闪光衰减
      const fa = Math.max(0, 1 - p * 1.7);
      if (fa > 0) {
        ctx.fillStyle = `rgba(255,242,224,${fa})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawBootText(t);
    }

    if (t < TOTAL) requestAnimationFrame(frame);
    else finish();
  }
  requestAnimationFrame(frame);
}
