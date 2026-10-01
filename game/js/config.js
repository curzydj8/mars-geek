// ============================================================
// 《火星殖民地》数值配置：建筑 / 科技 / 任务 / 平衡参数
// 纯数据模块，无 DOM 依赖，可在 Node 直接测试
// ============================================================

export const TILE = 48;          // 每格像素
export const MAP_W = 128;        // 地图宽（格）——巨大的火星表面
export const MAP_H = 80;         // 地图高（格）

// 1 游戏分钟 = 1 现实秒（1x 速度）
export const MIN_PER_SEC = 1;

export const RESOURCES = [
  { id: 'power',    name: '电力', icon: '⚡', baseCap: 1000 },
  { id: 'water',    name: '水',   icon: '💧', baseCap: 1000 },
  { id: 'ore',      name: '矿石', icon: '🪨', baseCap: 1000 },
  { id: 'metal',    name: '金属', icon: '🔩', baseCap: 1000 },
  { id: 'material', name: '建材', icon: '🧱', baseCap: 1000 },
  { id: 'food',     name: '食物', icon: '🌱', baseCap: 1000 },
  { id: 'oxygen',   name: '氧气', icon: '🫁', baseCap: 1000 },
];

export const RES_IDS = RESOURCES.map(r => r.id);

// 升级：每级产出倍率（相对上一级）
export const LEVEL_MULT = [1, 1.6, 2.5]; // index = level-1
export const MAX_LEVEL = 3;

// 建筑定义：produces / consumes 单位 = 每游戏分钟
export const BUILDINGS = {
  landing_pod: {
    name: '着陆舱', icon: '🛬', w: 2, h: 2, cat: 'base', buildable: false,
    housing: 6, produces: {}, consumes: {},
    desc: '殖民队的起点。提供 6 个床位，坚不可摧。',
  },
  solar_panel: {
    name: '太阳能板', icon: '🔆', w: 1, h: 1, cat: 'energy', buildable: true,
    cost: { metal: 30, material: 20 }, buildTime: 30,
    produces: { power: 25 }, consumes: {},
    desc: '将火星阳光转化为电力。+25 电力/分钟。',
  },
  water_extractor: {
    name: '净水器', icon: '💧', w: 1, h: 1, cat: 'water', buildable: true,
    cost: { metal: 50, material: 30 }, buildTime: 45,
    produces: { water: 10 }, consumes: { power: 5 },
    desc: '+10 水/分钟，消耗 5 电力/分钟。',
  },
  oxygen_generator: {
    name: '制氧机', icon: '🫁', w: 1, h: 1, cat: 'oxygen', buildable: true,
    cost: { metal: 50, material: 30 }, buildTime: 45,
    produces: { oxygen: 15 }, consumes: { power: 8 },
    desc: '+15 氧气/分钟，消耗 8 电力/分钟。',
  },
  mining_station: {
    name: '采矿站', icon: '⛏️', w: 2, h: 2, cat: 'industry', buildable: true,
    cost: { metal: 60, material: 40 }, buildTime: 60,
    produces: { ore: 15 }, consumes: { power: 10 },
    desc: '+15 矿石/分钟，消耗 10 电力/分钟。',
  },
  metal_refinery: {
    name: '金属精炼厂', icon: '🏭', w: 2, h: 2, cat: 'industry', buildable: true,
    cost: { metal: 80, material: 60 }, buildTime: 75,
    produces: { metal: 8 }, consumes: { ore: 10, power: 12 },
    desc: '矿石 → 金属。+8 金属/分钟，消耗 10 矿石、12 电力/分钟。',
  },
  construction_factory: {
    name: '建材工厂', icon: '🧱', w: 2, h: 2, cat: 'industry', buildable: true,
    cost: { metal: 100, material: 80 }, buildTime: 90,
    produces: { material: 6 }, consumes: { metal: 8, power: 12 },
    desc: '金属 → 建材。+6 建材/分钟，消耗 8 金属、12 电力/分钟。',
  },
  hydroponic_farm: {
    name: '水培农场', icon: '🌿', w: 2, h: 2, cat: 'food', buildable: true,
    cost: { metal: 60, material: 50 }, buildTime: 60,
    produces: { food: 8 }, consumes: { water: 5, power: 5 },
    desc: '+8 食物/分钟，消耗 5 水、5 电力/分钟。',
  },
  habitat: {
    name: '居住舱', icon: '🏠', w: 2, h: 2, cat: 'housing', buildable: true,
    cost: { metal: 120, material: 100 }, buildTime: 120,
    produces: {}, consumes: { power: 4 }, housing: 8,
    desc: '为 8 名殖民者提供住所。消耗 4 电力/分钟。',
  },
  research_lab: {
    name: '科研实验室', icon: '🔬', w: 2, h: 2, cat: 'science', buildable: true,
    cost: { metal: 100, material: 80 }, buildTime: 90,
    produces: { research: 3 }, consumes: { power: 10 },
    desc: '+3 科技点/分钟，消耗 10 电力/分钟。',
  },
  storage: {
    name: '储物仓', icon: '📦', w: 1, h: 1, cat: 'base', buildable: true,
    cost: { metal: 40, material: 30 }, buildTime: 30,
    produces: {}, consumes: {}, storage: 2000,
    desc: '所有资源上限 +2000。',
  },
};

export const BUILD_CATS = [
  { id: 'energy',   name: '能源' },
  { id: 'water',    name: '水资源' },
  { id: 'oxygen',   name: '氧气' },
  { id: 'industry', name: '工业' },
  { id: 'food',     name: '食物' },
  { id: 'housing',  name: '居住' },
  { id: 'science',  name: '科研' },
  { id: 'base',     name: '基地' },
];

// ---- 科研（MVP：列表式，Phase 2 做可视化科技树）----
export const TECHS = {
  t_solar_eff: {
    name: '高效光伏', icon: '🔆', cost: 100,
    desc: '太阳能板发电 +50%。', effects: { 'solar_panel.produces.power': 1.5 },
  },
  t_mining_eff: {
    name: '深层钻探', icon: '⛏️', cost: 150,
    desc: '采矿站产量 +50%。', effects: { 'mining_station.produces.ore': 1.5 },
  },
  t_farm_eff: {
    name: '立体栽培', icon: '🌿', cost: 150,
    desc: '水培农场产量 +50%。', effects: { 'hydroponic_farm.produces.food': 1.5 },
  },
  t_energy_eff: {
    name: '智能电网', icon: '⚡', cost: 200,
    desc: '所有建筑电力消耗 -20%。', effects: { 'global.consumes.power': 0.8 },
  },
  t_automation: {
    name: '自动产线', icon: '🤖', cost: 300,
    desc: '精炼厂与建材工厂产量 +50%。',
    effects: {
      'metal_refinery.produces.metal': 1.5,
      'construction_factory.produces.material': 1.5,
    },
  },
};

// ---- 任务 ----
export const MISSIONS = [
  {
    id: 'm1', name: '建立第一个火星基地', icon: '🎯',
    desc: '建造 3 个太阳能板、1 个净水器、1 台制氧机。',
    requires: [
      { kind: 'building', type: 'solar_panel', count: 3 },
      { kind: 'building', type: 'water_extractor', count: 1 },
      { kind: 'building', type: 'oxygen_generator', count: 1 },
    ],
    reward: { research: 100, metal: 200 },
  },
  {
    id: 'm2', name: '稳定的能源系统', icon: '⚡',
    desc: '电力总产量达到 100/分钟。',
    requires: [ { kind: 'powerProd', value: 100 } ],
    reward: { research: 150, material: 300 },
  },
  {
    id: 'm3', name: '第一批殖民者', icon: '🧑‍🚀',
    desc: '人口达到 10 人。',
    requires: [ { kind: 'population', value: 10 } ],
    reward: { research: 200, metal: 500 },
  },
];

// ---- 人口 ----
export const POP = {
  consumes: { food: 0.2, water: 0.3, oxygen: 0.5 }, // 每人每分钟
  growthInterval: 240,   // 每 240 游戏分钟尝试增长 1 人
  leaveInterval: 120,    // 幸福度过低时每 120 分钟离开 1 人
  leaveThreshold: 30,
};

// ---- 存档 ----
export const SAVE_KEY = 'mars_colony_saves_v1';
export const SAVE_VERSION = 1;
export const AUTOSAVE_SEC = 60; // 现实 60 秒自动保存一次
