// ============================================================
// main.js —— 启动装配 + 主循环（rAF 渲染 + 定时 sim）
// ============================================================
import { BUILDINGS, MAP_W, MAP_H, AUTOSAVE_SEC } from './config.js';
import { createInitialState } from './state.js';
import {
  tick, placeBuilding, demolishBuilding, upgradeBuilding,
  researchTech, claimMission,
} from './sim.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import {
  saveGame, loadGame, deleteSlot, hasAnySave, wipeAll,
  slotInfo, formatTime, SLOTS,
} from './save.js';

let state = null;
const getState = () => state;
const view = {
  panel: null, selectedId: null,
  placing: null, placingDef: null, ghost: null, showGrid: false,
  buildCat: 'energy',
};

const canvas = document.getElementById('game-canvas');
const renderer = createRenderer(canvas);

// 注意：actions 必须先于 createUI 定义（createUI 持有其引用）
const actions = {
  onPanelAction: actions_onPanelAction,
  onPanelSwitch() { ui.refreshPanel(); },
  onSpeed(sp) {
    if (!state) return;
    if (sp === 'pause') state.paused = true;
    else { state.paused = false; state.speed = Number(sp); }
    ui.refreshChrome();
  },
};
const ui = createUI(getState, view, actions);
const input = createInput(canvas, renderer, getState, view, {
  onPlace(tx, ty) {
    if (!state || !view.placing) return;
    const r = placeBuilding(state, view.placing, tx, ty, MAP_W, MAP_H, ui.gameLog);
    if (!r.ok) ui.gameLog(`⚠️ 无法建造：${r.reason}。`);
    ui.refreshHUD();
    ui.refreshPanel();
  },
  onSelect(b) {
    view.selectedId = b ? b.id : null;
    view.panel = b ? 'building' : null;
    ui.refreshPanel();
  },
  onCancelPlacement() {
    view.placing = null; view.placingDef = null;
    view.ghost = null; view.showGrid = false;
    ui.refreshChrome();
  },
});

// ---------- UI 动作 ----------
function actions_onPanelAction(action, ds) {
  switch (action) {
    case 'close-panel':
      view.panel = null; view.selectedId = null; ui.refreshPanel(); break;
    case 'build-cat':
      view.buildCat = ds.cat; ui.refreshPanel(); break;
    case 'start-place': {
      const def = BUILDINGS[ds.type];
      if (!def) break;
      view.placing = ds.type; view.placingDef = def;
      view.panel = null; view.selectedId = null;
      view.showGrid = true;
      ui.refreshPanel(); ui.refreshChrome();
      break;
    }
    case 'upgrade': {
      const r = upgradeBuilding(state, ds.id, ui.gameLog);
      if (!r.ok && r.reason) ui.gameLog(`⚠️ ${r.reason}`);
      ui.refreshHUD(); ui.refreshPanel(); break;
    }
    case 'demolish':
      if (demolishBuilding(state, ds.id, ui.gameLog)) {
        view.selectedId = null; view.panel = null;
      }
      ui.refreshHUD(); ui.refreshPanel(); break;
    case 'research': {
      const r = researchTech(state, ds.id, ui.gameLog);
      if (!r.ok && r.reason) ui.gameLog(`⚠️ ${r.reason}`);
      ui.refreshHUD(); ui.refreshPanel(); break;
    }
    case 'claim':
      claimMission(state, ds.id, ui.gameLog);
      ui.refreshHUD(); ui.refreshPanel(); break;
    case 'save-slot':
      if (saveGame(state, ds.id)) ui.gameLog(`💾 已保存到「${SLOTS.find(s => s.id === ds.id).name}」。`);
      else ui.gameLog('⚠️ 保存失败（浏览器存储不可用）。');
      ui.refreshPanel(); break;
    case 'load-slot': {
      const s = loadGame(ds.id);
      if (s) enterGame(s, `📂 已读取「${SLOTS.find(x => x.id === ds.id).name}」。`);
      else ui.gameLog('⚠️ 读取存档失败。');
      break;
    }
    case 'del-slot':
      if (confirm('确定删除这个存档吗？')) { deleteSlot(ds.id); ui.refreshPanel(); }
      break;
    case 'new-colony':
      if (confirm('开始新的殖民地？当前进度请先手动保存。')) startNewGame();
      break;
    case 'to-title':
      saveGame(state, 'auto');
      showTitle();
      break;
  }
}

// ---------- 流程 ----------
function enterGame(s, msg) {
  state = s;
  renderer.buildTerrain(state.seed);
  input.clampCam(state.camera);
  view.panel = null; view.selectedId = null;
  view.placing = null; view.ghost = null; view.showGrid = false;
  document.getElementById('start-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
  renderer.resize();
  ui.renderLog();
  ui.refreshHUD();
  ui.refreshPanel();
  if (msg) ui.gameLog(msg);
}

function startNewGame() {
  const s = createInitialState();
  enterGame(s);
  ui.gameLog('🛬 登陆舱成功着陆火星！从这里开始建造人类第一个家园。');
  ui.gameLog('💡 点击左侧「建造」扩张基地，点击建筑查看详情。');
}

function showTitle() {
  state = null;
  document.getElementById('game-screen').hidden = true;
  document.getElementById('start-screen').hidden = false;
  renderTitleSlots();
}

// ---------- 标题屏 ----------
function renderTitleSlots() {
  const box = document.getElementById('load-slots');
  const has = hasAnySave();
  document.getElementById('btn-load').classList.toggle('disabled', !has);
  if (!has) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h3>选择存档</h3>` + SLOTS.map(slot => {
    const info = slotInfo(slot.id);
    if (!info) return '';
    return `<div class="slot-row">
      <div><b>${slot.name}</b><span>Sol ${info.sol} · 人口 ${info.population} · ${formatTime(info.savedAt)}</span></div>
      <div><button data-load="${slot.id}" class="mbtn sm">进入</button>
      <button data-del="${slot.id}" class="mbtn sm danger">删除</button></div>
    </div>`;
  }).join('');
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (hasAnySave() && !confirm('开始新殖民地将覆盖当前未保存的进度，继续吗？')) return;
  startNewGame();
});
document.getElementById('btn-load').addEventListener('click', () => {
  const box = document.getElementById('load-slots');
  box.hidden = !box.hidden;
  document.getElementById('settings-pane').hidden = true;
});
document.getElementById('btn-settings').addEventListener('click', () => {
  const p = document.getElementById('settings-pane');
  p.hidden = !p.hidden;
  document.getElementById('load-slots').hidden = true;
});
document.getElementById('load-slots').addEventListener('click', e => {
  const l = e.target.closest('[data-load]');
  const d = e.target.closest('[data-del]');
  if (l) {
    const s = loadGame(l.dataset.load);
    if (s) enterGame(s, '📂 欢迎回来，指挥官。');
  } else if (d) {
    if (confirm('确定删除这个存档吗？')) { deleteSlot(d.dataset.del); renderTitleSlots(); }
  }
});
document.getElementById('btn-wipe').addEventListener('click', () => {
  if (confirm('确定清除所有本地存档吗？此操作不可恢复。')) {
    wipeAll(); renderTitleSlots();
    alert('已清除所有存档。');
  }
});

// ---------- 主循环 ----------
// 逻辑：每 500ms 推进 0.5×speed 游戏分钟
setInterval(() => {
  if (!state || state.paused || document.getElementById('game-screen').hidden) return;
  tick(state, 0.5 * state.speed, ui.gameLog);
  ui.refreshHUD();
  if (view.panel === 'building') ui.refreshPanel();
}, 500);

// 自动保存
setInterval(() => {
  if (state && !document.getElementById('game-screen').hidden) saveGame(state, 'auto');
}, AUTOSAVE_SEC * 1000);
window.addEventListener('beforeunload', () => {
  if (state) saveGame(state, 'auto');
});

// 渲染
function frame() {
  if (state && !document.getElementById('game-screen').hidden) {
    renderer.setCam(state.camera);
    renderer.render(state, view);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

renderTitleSlots();
