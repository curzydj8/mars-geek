// ============================================================
// state.js —— 存档数据结构、初始状态、序列化
// 纯数据模块，无 DOM 依赖
// ============================================================
import { SAVE_VERSION, RES_IDS } from './config.js';

let nextId = 1;
export function genId() { return 'b' + (nextId++) + '_' + Date.now().toString(36); }
export function resetIdCounter() { nextId = 1; }

// 初始建筑布局（格坐标，地图中央附近）
const INITIAL_BUILDINGS = [
  { type: 'landing_pod',      tx: 27, ty: 16 },
  { type: 'solar_panel',      tx: 25, ty: 16 },
  { type: 'solar_panel',      tx: 25, ty: 18 },
  { type: 'oxygen_generator', tx: 30, ty: 16 },
  { type: 'water_extractor',  tx: 30, ty: 18 },
  { type: 'storage',          tx: 27, ty: 19 },
];

export function createInitialState(seed) {
  resetIdCounter();
  const state = {
    version: SAVE_VERSION,
    seed: seed ?? ((Math.random() * 1e9) | 0),
    sol: 1,
    minute: 480, // 08:00
    speed: 1,
    paused: false,
    camera: { x: 0, y: 0, zoom: 1 },
    amounts: {
      power: 120, water: 120, ore: 60, metal: 220,
      material: 160, food: 120, oxygen: 220,
    },
    research: 0,
    population: { count: 3, happiness: 80 },
    buildings: INITIAL_BUILDINGS.map(b => ({
      id: genId(), type: b.type, tx: b.tx, ty: b.ty,
      level: 1, status: 'active', progress: 0,
    })),
    techs: {},
    missions: {},       // id -> 'done' | 'claimed'
    log: [],
    stats: { builtTotal: INITIAL_BUILDINGS.length, playMin: 0 },
    popTimer: 0,        // 人口增长计时（游戏分钟）
    leaveTimer: 0,      // 人口离开计时
  };
  // 相机初始居中到基地
  state.camera.x = 28 * 48 - 480;
  state.camera.y = 17 * 48 - 320;
  return state;
}

// ---- 序列化（存档只保留可 JSON 化字段） ----
export function serialize(state) {
  return JSON.stringify({
    version: state.version,
    seed: state.seed,
    sol: state.sol,
    minute: state.minute,
    speed: state.speed,
    paused: false,
    camera: state.camera,
    amounts: state.amounts,
    research: state.research,
    population: state.population,
    buildings: state.buildings,
    techs: state.techs,
    missions: state.missions,
    log: state.log.slice(-80),
    stats: state.stats,
    popTimer: state.popTimer,
    leaveTimer: state.leaveTimer,
    savedAt: Date.now(),
  });
}

export function deserialize(json) {
  const d = JSON.parse(json);
  if (d.version !== SAVE_VERSION) throw new Error('存档版本不兼容');
  resetIdCounter();
  // 兜底补齐字段，防止旧档缺字段
  const s = createInitialState(d.seed);
  Object.assign(s, d);
  s.paused = false;
  for (const id of RES_IDS) {
    if (typeof s.amounts[id] !== 'number') s.amounts[id] = 0;
  }
  return s;
}
