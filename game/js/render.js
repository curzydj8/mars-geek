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
  let dpr = 1;

  // ---- 地形：确定性生成，无大离屏 canvas（支持 128×80 大地图） ----
  let features = null;   // { dunes, rocks, craters }，buildTerrain(seed) 生成
  let terrainSeed = 1;

  // (tx,ty) → [0,1) 确定性哈希：同一格子永远同一颜色
  function hash2(seed, x, y) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---- 地形特征（按种子生成，绘制时视锥剔除） ----
  function buildTerrain(seed) {
    terrainSeed = seed >>> 0;
    const rnd = mulberry32(terrainSeed);
    const areaK = (MAP_W * MAP_H) / (56 * 36); // 相对旧地图的面积倍数
    const W = MAP_W * TILE, H = MAP_H * TILE;
    features = { dunes: [], rocks: [], craters: [] };
    const nD = Math.round(46 * areaK);
    const nR = Math.round(260 * areaK);
    const nC = Math.max(8, Math.round(7 * Math.sqrt(areaK)));
    for (let i = 0; i < nD; i++) {
      features.dunes.push({
        x: rnd() * W, y: rnd() * H,
        w: 40 + rnd() * 110, h: 10 + rnd() * 22,
        rot: rnd() * Math.PI, lw: 3 + rnd() * 5,
      });
    }
    for (let i = 0; i < nR; i++) {
      features.rocks.push({
        x: rnd() * W, y: rnd() * H,
        r: 2 + rnd() * 7, a: 0.25 + rnd() * 0.4,
      });
    }
    for (let i = 0; i < nC; i++) {
      features.craters.push({
        x: rnd() * W, y: rnd() * H,
        r: 34 + rnd() * 60, tint: rnd(),
      });
    }
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
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
    if (!features) buildTerrain(state.seed);
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

    // 地形：底色按瓦片哈希绘制（仅可见区域），特征按视锥剔除
    const vx0 = cam.x, vy0 = cam.y;
    const vx1 = cam.x + cw / cam.zoom, vy1 = cam.y + ch / cam.zoom;
    // 缩小时合并瓦片绘制，保持帧率
    const step = cam.zoom < 0.7 ? 2 : 1;
    const bx0 = Math.max(0, Math.floor(vx0 / TILE / step) * step);
    const bx1 = Math.min(MAP_W - step, Math.floor(vx1 / TILE / step) * step);
    const by0 = Math.max(0, Math.floor(vy0 / TILE / step) * step);
    const by1 = Math.min(MAP_H - step, Math.floor(vy1 / TILE / step) * step);
    for (let ty = by0; ty <= by1; ty += step) {
      for (let tx = bx0; tx <= bx1; tx += step) {
        ctx.fillStyle = mixColor(SAND_A, SAND_B, hash2(terrainSeed, tx, ty));
        ctx.fillRect(tx * TILE, ty * TILE, TILE * step, TILE * step);
      }
    }
    // 地图外：深空色
    const inV = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
    // 沙丘
    ctx.strokeStyle = 'rgba(226,150,100,0.35)';
    for (const d of features.dunes) {
      if (!inV(d.x, d.y, d.w)) continue;
      ctx.lineWidth = d.lw / cam.zoom + 1;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.w, d.h, d.rot, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 岩石
    for (const rk of features.rocks) {
      if (!inV(rk.x, rk.y, rk.r + 2)) continue;
      ctx.fillStyle = `rgba(90,44,34,${rk.a})`;
      ctx.beginPath();
      ctx.arc(rk.x, rk.y, rk.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,160,110,0.25)';
      ctx.beginPath();
      ctx.arc(rk.x - rk.r * 0.3, rk.y - rk.r * 0.3, rk.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // 陨石坑
    for (const c of features.craters) {
      if (!inV(c.x, c.y, c.r + 8)) continue;
      ctx.fillStyle = 'rgba(70,32,24,0.55)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(225,150,100,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r + 4, c.r * 0.8 + 4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = mixColor(SAND_A, SAND_B, c.tint);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 0.55, c.r * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    }

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
