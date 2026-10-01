// ============================================================
// sim.js —— 游戏模拟：资源 / 电力 / 人口 / 建造 / 科研 / 任务
// 纯逻辑模块，无 DOM 依赖，可在 Node 直接单元测试
// 所有速率单位：每游戏分钟
// ============================================================
import {
  BUILDINGS, LEVEL_MULT, MAX_LEVEL, TECHS, MISSIONS, POP,
  RES_IDS, RESOURCES,
} from './config.js';

const CONS_LEVEL_MULT = [1, 1.2, 1.5]; // 升级后消耗倍率（产出涨幅更大）

export function levelMult(level) {
  return LEVEL_MULT[Math.min(level, MAX_LEVEL) - 1] ?? 1;
}
function consLevelMult(level) {
  return CONS_LEVEL_MULT[Math.min(level, MAX_LEVEL) - 1] ?? 1;
}

// 科技加成：建筑类型 / 种类(produces|consumes) / 资源 -> 倍率
export function getTechMult(state, btype, kind, resId) {
  let m = 1;
  for (const tid of Object.keys(state.techs)) {
    const t = TECHS[tid];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.effects)) {
      if (k === `${btype}.${kind}.${resId}` || k === `global.${kind}.${resId}`) m *= v;
    }
  }
  return m;
}

export function isActive(b) { return b.status === 'active'; }

// 单建筑实际产出/消耗（已含等级与科技，不含电力效率）
export function buildingRates(state, b) {
  const def = BUILDINGS[b.type];
  const active = isActive(b);
  const produces = {};
  const consumes = {};
  if (active && def) {
    const lm = levelMult(b.level);
    const clm = consLevelMult(b.level);
    for (const [r, v] of Object.entries(def.produces || {})) {
      produces[r] = v * lm * getTechMult(state, b.type, 'produces', r);
    }
    for (const [r, v] of Object.entries(def.consumes || {})) {
      consumes[r] = v * clm * getTechMult(state, b.type, 'consumes', r);
    }
  }
  return { produces, consumes };
}

export function housingCapacity(state) {
  let cap = 0;
  for (const b of state.buildings) {
    if (!isActive(b)) continue;
    cap += BUILDINGS[b.type]?.housing || 0;
  }
  return cap;
}

export function storageCap(state) {
  const base = {};
  for (const r of RESOURCES) base[r.id] = r.baseCap;
  for (const b of state.buildings) {
    if (!isActive(b)) continue;
    const s = BUILDINGS[b.type]?.storage || 0;
    if (s) for (const id of RES_IDS) base[id] += s;
  }
  return base;
}

// 电力总览（供 UI / 任务判定）
export function powerStats(state) {
  let prod = 0, cons = 0;
  for (const b of state.buildings) {
    const { produces, consumes } = buildingRates(state, b);
    prod += produces.power || 0;
    cons += consumes.power || 0;
  }
  const eff = cons > 0 ? Math.min(1, prod / cons) : 1;
  return { prod, cons, eff, shortage: prod < cons };
}

// 每种资源每分钟产出/消耗（供 UI 显示）
export function resourceFlows(state) {
  const flows = {};
  for (const id of RES_IDS) flows[id] = { prod: 0, cons: 0 };
  const { eff } = powerStats(state);
  for (const b of state.buildings) {
    const { produces, consumes } = buildingRates(state, b);
    for (const [r, v] of Object.entries(produces)) {
      if (flows[r]) flows[r].prod += r === 'power' ? v : v * eff;
    }
    for (const [r, v] of Object.entries(consumes)) {
      if (flows[r]) flows[r].cons += v;
    }
  }
  return flows;
}

export function canAfford(state, cost) {
  for (const [r, v] of Object.entries(cost)) {
    if ((state.amounts[r] ?? 0) < v) return false;
  }
  return true;
}

export function payCost(state, cost) {
  for (const [r, v] of Object.entries(cost)) {
    state.amounts[r] = Math.max(0, (state.amounts[r] ?? 0) - v);
  }
}

export function upgradeCost(type, level) {
  const base = BUILDINGS[type]?.cost || {};
  const k = level >= 2 ? 3 : 1.5; // 1->2: 1.5x, 2->3: 3x
  const out = {};
  for (const [r, v] of Object.entries(base)) out[r] = Math.round(v * k);
  return out;
}

export function rectsOverlap(a, b) {
  return a.tx < b.tx + b.w && a.tx + a.w > b.tx &&
         a.ty < b.ty + b.h && a.ty + a.h > b.ty;
}

export function canPlace(state, type, tx, ty, mapW, mapH) {
  const def = BUILDINGS[type];
  if (!def || !def.buildable) return { ok: false, reason: '不可建造' };
  if (tx < 0 || ty < 0 || tx + def.w > mapW || ty + def.h > mapH) {
    return { ok: false, reason: '超出地图边界' };
  }
  const rect = { tx, ty, w: def.w, h: def.h };
  for (const b of state.buildings) {
    const bd = BUILDINGS[b.type];
    if (rectsOverlap(rect, { tx: b.tx, ty: b.ty, w: bd.w, h: bd.h })) {
      return { ok: false, reason: '位置被占用' };
    }
  }
  if (!canAfford(state, def.cost)) return { ok: false, reason: '资源不足' };
  return { ok: true };
}

export function placeBuilding(state, type, tx, ty, mapW, mapH, log) {
  const chk = canPlace(state, type, tx, ty, mapW, mapH);
  if (!chk.ok) return { ok: false, reason: chk.reason };
  const def = BUILDINGS[type];
  payCost(state, def.cost);
  const b = {
    id: 'b' + Math.random().toString(36).slice(2, 9),
    type, tx, ty, level: 1, status: 'constructing', progress: 0,
  };
  state.buildings.push(b);
  state.stats.builtTotal++;
  log?.(`${def.name} 开始建造。`);
  return { ok: true, building: b };
}

export function demolishBuilding(state, id, log) {
  const i = state.buildings.findIndex(b => b.id === id);
  if (i < 0) return false;
  const def = BUILDINGS[state.buildings[i].type];
  if (def.buildable === false) return false; // 着陆舱不可拆除
  state.buildings.splice(i, 1);
  log?.(`${def.name} 已拆除。`);
  return true;
}

export function upgradeBuilding(state, id, log) {
  const b = state.buildings.find(u => u.id === id);
  if (!b || !isActive(b) || b.level >= MAX_LEVEL) return { ok: false };
  const cost = upgradeCost(b.type, b.level);
  if (!canAfford(state, cost)) return { ok: false, reason: '资源不足' };
  payCost(state, cost);
  b.level++;
  log?.(`${BUILDINGS[b.type].name} 升级到 Lv.${b.level}。`);
  return { ok: true };
}

export function researchTech(state, techId, log) {
  const t = TECHS[techId];
  if (!t || state.techs[techId]) return { ok: false };
  if (state.research < t.cost) return { ok: false, reason: '科技点不足' };
  state.research -= t.cost;
  state.techs[techId] = true;
  log?.(`科技解锁：${t.icon} ${t.name}。`);
  return { ok: true };
}

// ---- 任务 ----
export function missionProgress(state, m) {
  const { prod } = powerStats(state);
  const details = m.requires.map(r => {
    if (r.kind === 'building') {
      const n = state.buildings.filter(
        b => b.type === r.type && isActive(b)).length;
      return { text: `${BUILDINGS[r.type].name} ${n}/${r.count}`, done: n >= r.count };
    }
    if (r.kind === 'powerProd') {
      return { text: `电力产量 ${Math.floor(prod)}/${r.value}/分钟`, done: prod >= r.value };
    }
    if (r.kind === 'population') {
      return { text: `人口 ${state.population.count}/${r.value}`, done: state.population.count >= r.value };
    }
    return { text: '?', done: false };
  });
  return { details, done: details.every(d => d.done) };
}

export function checkMissions(state, log) {
  for (const m of MISSIONS) {
    if (state.missions[m.id]) continue;
    if (missionProgress(state, m).done) {
      state.missions[m.id] = 'done';
      log?.(`任务完成：${m.icon} ${m.name}，可领取奖励！`);
    }
  }
}

export function claimMission(state, id, log) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m || state.missions[id] !== 'done') return { ok: false };
  const caps = storageCap(state);
  for (const [r, v] of Object.entries(m.reward)) {
    if (r === 'research') state.research += v;
    else state.amounts[r] = Math.min(caps[r] ?? 1e9, (state.amounts[r] ?? 0) + v);
  }
  state.missions[id] = 'claimed';
  log?.(`领取任务奖励：${m.name}。`);
  return { ok: true };
}

// ---- 主 tick：推进 dtMin 个游戏分钟 ----
export function tick(state, dtMin, log) {
  // 1. 时钟
  state.minute += dtMin;
  while (state.minute >= 1440) { state.minute -= 1440; state.sol++; }
  state.stats.playMin += dtMin;

  // 2. 建造进度
  for (const b of state.buildings) {
    if (b.status === 'constructing') {
      b.progress += dtMin;
      if (b.progress >= (BUILDINGS[b.type].buildTime || 1)) {
        b.status = 'active';
        b.progress = 0;
        log?.(`${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} 建造完成，投入运行。`);
      }
    }
  }

  // 3. 电力效率
  const { eff, shortage } = powerStats(state);

  // 4. 建筑生产
  const caps = storageCap(state);
  for (const b of state.buildings) {
    if (!isActive(b)) continue;
    const { produces, consumes } = buildingRates(state, b);
    // 非电力输入不足则本轮停机
    let stalled = false;
    for (const [r, v] of Object.entries(consumes)) {
      if (r === 'power') continue;
      if ((state.amounts[r] ?? 0) < v * dtMin) { stalled = true; break; }
    }
    if (stalled) continue;
    for (const [r, v] of Object.entries(consumes)) {
      if (r === 'power') continue;
      state.amounts[r] -= v * dtMin;
    }
    for (const [r, v] of Object.entries(produces)) {
      if (r === 'research') { state.research += v * eff * dtMin; continue; }
      const gain = (r === 'power' ? v : v * eff) * dtMin;
      state.amounts[r] = Math.min(caps[r] ?? 1e9, (state.amounts[r] ?? 0) + gain);
    }
  }

  // 5. 人口
  const pop = state.population;
  const cap = housingCapacity(state);
  let shortageAny = false;
  for (const [r, v] of Object.entries(POP.consumes)) {
    const need = pop.count * v * dtMin;
    const have = state.amounts[r] ?? 0;
    if (have >= need) state.amounts[r] = have - need;
    else { state.amounts[r] = 0; shortageAny = true; }
  }
  const overcrowded = pop.count > cap;
  const target = shortageAny ? 20 : overcrowded ? 45 : 80;
  pop.happiness += (target - pop.happiness) * Math.min(1, dtMin / 30);
  pop.happiness = Math.max(0, Math.min(100, pop.happiness));

  state.popTimer += dtMin;
  if (state.popTimer >= POP.growthInterval) {
    state.popTimer = 0;
    if (pop.count < cap && !shortageAny) {
      pop.count++;
      log?.(`🧑‍🚀 新的殖民者抵达火星！当前人口 ${pop.count}。`);
    }
  }
  if (pop.happiness < POP.leaveThreshold && pop.count > 1) {
    state.leaveTimer += dtMin;
    if (state.leaveTimer >= POP.leaveInterval) {
      state.leaveTimer = 0;
      pop.count--;
      log?.(`😞 一名殖民者离开了基地（幸福度过低）。`);
    }
  } else {
    state.leaveTimer = 0;
  }

  // 6. 任务
  checkMissions(state, log);

  return { powerShortage: shortage, eff };
}
