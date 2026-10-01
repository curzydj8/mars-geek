// ============================================================
// render.js —— Canvas 渲染
// 地形按种子预渲染到离屏 canvas；每帧只重绘建筑层与特效
// ============================================================
import { TILE, MAP_W, MAP_H, BUILDINGS } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function mixColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

const SAND_A = [164, 74, 51];   // 火星红沙
const SAND_B = [203, 110, 74];
const ROCK_C = [110, 52, 40];
const DUNE_C = [214, 130, 88];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let terrain = null;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }

  // ---- 地形预渲染 ----
  function buildTerrain(seed) {
    terrain = document.createElement('canvas');
    terrain.width = MAP_W * TILE;
    terrain.height = MAP_H * TILE;
    const g = terrain.getContext('2d');
    const rnd = mulberry32(seed);

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const n = rnd();
        g.fillStyle = mixColor(SAND_A, SAND_B, n);
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // 沙丘：浅色弧形
    for (let i = 0; i < 46; i++) {
      const x = rnd() * terrain.width, y = rnd() * terrain.height;
      const w = 40 + rnd() * 110, h = 10 + rnd() * 22;
      g.strokeStyle = 'rgba(226,150,100,0.35)';
      g.lineWidth = 3 + rnd() * 5;
      g.beginPath();
      g.ellipse(x, y, w, h, rnd() * Math.PI, 0, Math.PI * 2);
      g.stroke();
    }
    // 岩石：深色斑点簇
    for (let i = 0; i < 260; i++) {
      const x = rnd() * terrain.width, y = rnd() * terrain.height;
      const r = 2 + rnd() * 7;
      g.fillStyle = `rgba(90,44,34,${0.25 + rnd() * 0.4})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(230,160,110,0.25)';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    // 陨石坑
    for (let i = 0; i < 7; i++) {
      const x = rnd() * terrain.width, y = rnd() * terrain.height;
      const r = 34 + rnd() * 60;
      g.fillStyle = 'rgba(70,32,24,0.55)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(225,150,100,0.5)';
      g.lineWidth = 5;
      g.beginPath(); g.ellipse(x, y, r + 4, r * 0.8 + 4, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.fillStyle = mixColor(SAND_A, SAND_B, rnd());
      g.beginPath(); g.ellipse(x, y, r * 0.55, r * 0.44, 0, 0, Math.PI * 2); g.fill();
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawBuilding(g, b) {
    const def = BUILDINGS[b.type];
    const x = b.tx * TILE, y = b.ty * TILE;
    const w = def.w * TILE, h = def.h * TILE;
    const constructing = b.status === 'constructing';

    // 阴影
    g.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(g, x + 4, y + 6, w - 4, h - 4, 10); g.fill();

    // 底座
    const baseGrad = g.createLinearGradient(x, y, x, y + h);
    baseGrad.addColorStop(0, constructing ? '#4a4a52' : '#333a48');
    baseGrad.addColorStop(1, constructing ? '#333338' : '#222834');
    g.fillStyle = baseGrad;
    roundRect(g, x + 2, y + 2, w - 4, h - 4, 10); g.fill();
    g.lineWidth = 2;
    g.strokeStyle = constructing ? '#8a8a95' : '#ff7a4d';
    if (constructing) g.setLineDash([6, 4]);
    roundRect(g, x + 2, y + 2, w - 4, h - 4, 10); g.stroke();
    g.setLineDash([]);

    // 图标
    const fs = Math.min(w, h) * 0.52;
    g.font = `${fs}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (constructing) {
      g.globalAlpha = 0.45;
      g.fillText(def.icon, x + w / 2, y + h / 2 - 6);
      g.globalAlpha = 1;
      // 施工进度条
      const p = Math.min(1, b.progress / (def.buildTime || 1));
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x + 8, y + h - 16, w - 16, 8);
      g.fillStyle = '#ffb14d';
      g.fillRect(x + 8, y + h - 16, (w - 16) * p, 8);
    } else {
      g.fillText(def.icon, x + w / 2, y + h / 2);
      // 等级点
      for (let i = 0; i < b.level; i++) {
        g.fillStyle = '#ffd14d';
        g.beginPath();
        g.arc(x + w - 12 - i * 11, y + 12, 4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 名称
    g.font = '11px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(def.name, x + w / 2, y + h - 4);
  }

  function render(state, view) {
    if (!terrain) buildTerrain(state.seed);
    const cam = state.camera;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 深空背景
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(0, 0, cw, ch);

    // —— 相机模型：screen = (world - cam) * zoom ——
    ctx.save();
    ctx.translate(-cam.x * cam.zoom, -cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);

    // 地形（只画可见区域）
    const vx0 = cam.x, vy0 = cam.y;
    const vx1 = cam.x + cw / cam.zoom, vy1 = cam.y + ch / cam.zoom;
    const sx = Math.max(0, vx0), sy = Math.max(0, vy0);
    const sw = Math.min(terrain.width, vx1) - sx;
    const sh = Math.min(terrain.height, vy1) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(terrain, sx, sy, sw, sh, sx, sy, sw, sh);

    // 网格（建造模式或低缩放时）
    if (view.showGrid || cam.zoom < 0.9) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 / cam.zoom;
      const t0x = Math.max(0, Math.floor(vx0 / TILE)), t1x = Math.min(MAP_W, Math.ceil(vx1 / TILE));
      const t0y = Math.max(0, Math.floor(vy0 / TILE)), t1y = Math.min(MAP_H, Math.ceil(vy1 / TILE));
      ctx.beginPath();
      for (let tx = t0x; tx <= t1x; tx++) { ctx.moveTo(tx * TILE, t0y * TILE); ctx.lineTo(tx * TILE, t1y * TILE); }
      for (let ty = t0y; ty <= t1y; ty++) { ctx.moveTo(t0x * TILE, ty * TILE); ctx.lineTo(t1x * TILE, ty * TILE); }
      ctx.stroke();
    }

    // 建筑
    for (const b of state.buildings) drawBuilding(ctx, b);

    // 选中高亮
    if (view.selectedId) {
      const b = state.buildings.find(x => x.id === view.selectedId);
      if (b) {
        const def = BUILDINGS[b.type];
        ctx.strokeStyle = '#4dd8ff';
        ctx.lineWidth = 3 / cam.zoom;
        ctx.shadowColor = '#4dd8ff'; ctx.shadowBlur = 12;
        roundRect(ctx, b.tx * TILE - 3, b.ty * TILE - 3, def.w * TILE + 6, def.h * TILE + 6, 12);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 建造幽灵
    if (view.ghost) {
      const gh = view.ghost;
      const def = BUILDINGS[gh.type];
      ctx.fillStyle = gh.ok ? 'rgba(80,255,140,0.35)' : 'rgba(255,70,70,0.35)';
      roundRect(ctx, gh.tx * TILE, gh.ty * TILE, def.w * TILE, def.h * TILE, 8);
      ctx.fill();
      ctx.strokeStyle = gh.ok ? '#50ff8c' : '#ff4646';
      ctx.lineWidth = 2 / cam.zoom;
      ctx.stroke();
      ctx.font = `${0.5 * Math.min(def.w, def.h) * TILE}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.8;
      ctx.fillText(def.icon, (gh.tx + def.w / 2) * TILE, (gh.ty + def.h / 2) * TILE);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const cam = currentCam;
    const px = sx - rect.left, py = sy - rect.top;
    return { x: px / cam.zoom + cam.x, y: py / cam.zoom + cam.y };
  }

  let currentCam = { x: 0, y: 0, zoom: 1 };
  function setCam(cam) { currentCam = cam; }

  resize();
  window.addEventListener('resize', resize);

  return {
    render, resize, buildTerrain, screenToWorld, setCam,
    worldSize: { w: MAP_W * TILE, h: MAP_H * TILE },
  };
}
