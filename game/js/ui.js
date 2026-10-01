// ============================================================
// ui.js —— 游戏界面：资源栏 / 建造菜单 / 建筑面板 / 科研 / 任务 / 日志
// ============================================================
import {
  BUILDINGS, BUILD_CATS, TECHS, MISSIONS, RESOURCES, RES_IDS,
} from './config.js';
import {
  powerStats, resourceFlows, storageCap, housingCapacity,
  missionProgress, upgradeCost, buildingRates, getTechMult,
} from './sim.js';
import { SLOTS, slotInfo, formatTime } from './save.js';

function fmt(n) {
  n = Math.floor(n);
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function fmtSigned(n) {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return (v >= 0 ? '+' : '') + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));
}
function costText(cost) {
  return Object.entries(cost).map(([r, v]) => {
    const res = RESOURCES.find(x => x.id === r);
    return `${res?.icon || ''}${v}`;
  }).join(' ');
}
export function clockText(state) {
  const h = Math.floor(state.minute / 60), m = Math.floor(state.minute % 60);
  const p = n => String(n).padStart(2, '0');
  return `Sol ${state.sol} · ${p(h)}:${p(m)}`;
}

export function createUI(getState, view, actions) {
  const $ = id => document.getElementById(id);
  const els = {
    topbar: $('topbar'), toolbar: $('toolbar'), panel: $('side-panel'),
    log: $('event-log'), clock: $('clock'), alerts: $('alerts'),
    hint: $('place-hint'), speedBtns: [...document.querySelectorAll('[data-speed]')],
  };

  // ---------- 事件日志 ----------
  function gameLog(text) {
    const s = getState();
    if (!s) return;
    s.log.push({ sol: s.sol, minute: Math.floor(s.minute), text });
    if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
    renderLog();
  }
  function renderLog() {
    const s = getState();
    if (!s) return;
    els.log.innerHTML = s.log.slice(-8).reverse().map(e => {
      const h = Math.floor(e.minute / 60), m = Math.floor(e.minute % 60);
      const p = n => String(n).padStart(2, '0');
      return `<div class="log-line"><span class="log-t">S${e.sol} ${p(h)}:${p(m)}</span>${escapeHtml(e.text)}</div>`;
    }).join('');
  }
  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 顶部资源栏 ----------
  function refreshTopbar() {
    const s = getState();
    if (!s) return;
    const flows = resourceFlows(s);
    const caps = storageCap(s);
    const ps = powerStats(s);
    let html = '';
    for (const r of RESOURCES) {
      const f = flows[r.id];
      const net = f.prod - f.cons;
      const netCls = net > 0.05 ? 'pos' : net < -0.05 ? 'neg' : '';
      const extra = r.id === 'power'
        ? `<span class="res-sub">${Math.round(ps.prod)}/${Math.round(ps.cons)}</span>` : '';
      html += `<div class="res ${r.id === 'power' && ps.shortage ? 'warn' : ''}" title="${r.name}：产量 ${f.prod.toFixed(1)}/分，消耗 ${f.cons.toFixed(1)}/分">
        <span class="res-icon">${r.icon}</span>
        <span class="res-val">${fmt(s.amounts[r.id])}</span><span class="res-cap">/${fmt(caps[r.id])}</span>
        <span class="res-flow ${netCls}">${fmtSigned(net)}</span>${extra}
      </div>`;
    }
    const cap = housingCapacity(s);
    const happy = Math.round(s.population.happiness);
    const happyIcon = happy >= 60 ? '😊' : happy >= 35 ? '😐' : '😞';
    html += `<div class="res" title="人口：${s.population.count}/${cap}，幸福度 ${happy}">
      <span class="res-icon">🧑‍🚀</span><span class="res-val">${s.population.count}</span><span class="res-cap">/${cap}</span>
      <span class="res-flow">${happyIcon}${happy}</span></div>`;
    html += `<div class="res" title="科技点：建造科研实验室获取">
      <span class="res-icon">🔬</span><span class="res-val">${fmt(s.research)}</span></div>`;
    els.topbar.innerHTML = html;
  }

  // ---------- 时钟 / 告警 / 提示 ----------
  function refreshChrome() {
    const s = getState();
    if (!s) return;
    els.clock.textContent = clockText(s);
    els.speedBtns.forEach(b => {
      const sp = b.dataset.speed;
      b.classList.toggle('on', sp === 'pause' ? s.paused : (!s.paused && s.speed === Number(sp)));
    });
    const ps = powerStats(s);
    const alerts = [];
    if (ps.shortage) alerts.push(`<div class="alert danger">⚡ 电力短缺！产量 ${Math.round(ps.prod)}/分，需求 ${Math.round(ps.cons)}/分，建筑降效运行</div>`);
    const oxyFlow = resourceFlows(s).oxygen;
    if (s.population.count > 0 && oxyFlow.prod - 0.5 * s.population.count < 0 && (s.amounts.oxygen || 0) < 20) {
      alerts.push(`<div class="alert danger">🫁 氧气短缺！殖民者受到影响</div>`);
    }
    els.alerts.innerHTML = alerts.join('');
    if (view.placing) {
      const def = BUILDINGS[view.placing];
      els.hint.hidden = false;
      els.hint.innerHTML = `正在放置：<b>${def.icon} ${def.name}</b>（${costText(def.cost)}）—— 点击地图确认，右键 / Esc 取消`;
    } else {
      els.hint.hidden = true;
    }
  }

  // ---------- 建造菜单 ----------
  function renderBuildPanel() {
    const s = getState();
    const cat = view.buildCat || 'energy';
    let html = `<div class="panel-head"><h3>🏗️ 建造</h3><button class="x" data-action="close-panel">✕</button></div>`;
    html += `<div class="cat-tabs">` + BUILD_CATS.map(c =>
      `<button class="cat-tab ${c.id === cat ? 'on' : ''}" data-action="build-cat" data-cat="${c.id}">${c.name}</button>`
    ).join('') + `</div><div class="build-list">`;
    for (const [type, def] of Object.entries(BUILDINGS)) {
      if (!def.buildable || def.cat !== cat) continue;
      const afford = Object.entries(def.cost).every(([r, v]) => (s.amounts[r] ?? 0) >= v);
      html += `<div class="build-card ${afford ? '' : 'poor'}" data-action="start-place" data-type="${type}">
        <div class="bc-icon">${def.icon}</div>
        <div class="bc-body">
          <div class="bc-name">${def.name} <span class="bc-size">${def.w}×${def.h}</span></div>
          <div class="bc-desc">${def.desc}</div>
          <div class="bc-cost">${costText(def.cost)} · ⏱${def.buildTime}分</div>
        </div></div>`;
    }
    html += `</div>`;
    els.panel.innerHTML = html;
  }

  // ---------- 建筑信息面板 ----------
  function renderBuildingPanel() {
    const s = getState();
    const b = s.buildings.find(x => x.id === view.selectedId);
    if (!b) { renderEmptyPanel(); return; }
    const def = BUILDINGS[b.type];
    const { produces, consumes } = buildingRates(s, b);
    const rateLine = (obj, sign, cls) => Object.entries(obj).map(([r, v]) => {
      const res = RESOURCES.find(x => x.id === r);
      const name = r === 'research' ? '科技点' : res?.name;
      const icon = r === 'research' ? '🔬' : res?.icon;
      return `<span class="${cls}">${icon}${name} ${sign}${v.toFixed(1)}/分</span>`;
    }).join(' ');
    let html = `<div class="panel-head"><h3>${def.icon} ${def.name}</h3><button class="x" data-action="close-panel">✕</button></div>`;
    html += `<div class="binfo">
      <div class="brow"><span>状态</span><b>${b.status === 'active' ? '运行中' : `建造中 ${Math.min(99, Math.round(b.progress / def.buildTime * 100))}%`}</b></div>
      <div class="brow"><span>等级</span><b>Lv.${b.level} / 3</b></div>`;
    if (def.housing) html += `<div class="brow"><span>住房</span><b>+${def.housing} 床位</b></div>`;
    if (def.storage) html += `<div class="brow"><span>仓储</span><b>资源上限 +${def.storage}</b></div>`;
    const pl = rateLine(produces, '+', 'pos'), cl = rateLine(consumes, '-', 'neg');
    if (pl || cl) html += `<div class="brow rates"><span>产出/消耗</span><b>${pl} ${cl}</b></div>`;
    html += `<p class="bdesc">${def.desc}</p></div><div class="b-actions">`;
    if (b.status === 'active' && b.level < 3 && def.buildable) {
      const cost = upgradeCost(b.type, b.level);
      const afford = Object.entries(cost).every(([r, v]) => (s.amounts[r] ?? 0) >= v);
      html += `<button class="btn primary ${afford ? '' : 'disabled'}" data-action="upgrade" data-id="${b.id}">⬆️ 升级到 Lv.${b.level + 1}（${costText(cost)}）</button>`;
    }
    if (def.buildable) {
      html += `<button class="btn danger" data-action="demolish" data-id="${b.id}">💥 拆除建筑</button>`;
    }
    html += `</div>`;
    els.panel.innerHTML = html;
  }

  function renderEmptyPanel() {
    els.panel.innerHTML = `<div class="panel-head"><h3>🔍</h3><button class="x" data-action="close-panel">✕</button></div>
      <p class="empty-tip">点击地图上的建筑查看详情。<br><br>点左侧「建造」开始扩张你的殖民地。</p>`;
  }

  // ---------- 科研 ----------
  function renderResearchPanel() {
    const s = getState();
    let html = `<div class="panel-head"><h3>🔬 科研 <span class="rp">科技点 ${fmt(s.research)}</span></h3><button class="x" data-action="close-panel">✕</button></div><div class="build-list">`;
    for (const [id, t] of Object.entries(TECHS)) {
      const done = !!s.techs[id];
      const afford = s.research >= t.cost;
      html += `<div class="build-card ${done ? 'done' : afford ? '' : 'poor'}">
        <div class="bc-icon">${t.icon}</div>
        <div class="bc-body">
          <div class="bc-name">${t.name} ${done ? '<span class="tag">已解锁</span>' : ''}</div>
          <div class="bc-desc">${t.desc}</div>
          ${done ? '' : `<button class="btn primary sm ${afford ? '' : 'disabled'}" data-action="research" data-id="${id}">解锁（🔬${t.cost}）</button>`}
        </div></div>`;
    }
    html += `</div>`;
    els.panel.innerHTML = html;
  }

  // ---------- 任务 ----------
  function renderMissionsPanel() {
    const s = getState();
    let html = `<div class="panel-head"><h3>🎯 任务</h3><button class="x" data-action="close-panel">✕</button></div><div class="build-list">`;
    for (const m of MISSIONS) {
      const st = s.missions[m.id]; // undefined | done | claimed
      const prog = missionProgress(s, m);
      const rewardTxt = Object.entries(m.reward).map(([r, v]) => {
        if (r === 'research') return `🔬${v}`;
        const res = RESOURCES.find(x => x.id === r);
        return `${res?.icon}${v}`;
      }).join(' ');
      html += `<div class="build-card ${st === 'claimed' ? 'done' : ''}">
        <div class="bc-icon">${m.icon}</div>
        <div class="bc-body">
          <div class="bc-name">${m.name} ${st === 'claimed' ? '<span class="tag">已完成</span>' : st === 'done' ? '<span class="tag hot">可领取</span>' : ''}</div>
          <div class="bc-desc">${m.desc}</div>
          ${prog.details.map(d => `<div class="mreq ${d.done ? 'ok' : ''}">${d.done ? '✅' : '⬜'} ${d.text}</div>`).join('')}
          <div class="bc-cost">奖励：${rewardTxt}</div>
          ${st === 'done' ? `<button class="btn primary sm" data-action="claim" data-id="${m.id}">领取奖励</button>` : ''}
        </div></div>`;
    }
    html += `</div>`;
    els.panel.innerHTML = html;
  }

  // ---------- 存档菜单 ----------
  function renderMenuPanel() {
    let html = `<div class="panel-head"><h3>💾 殖民地档案</h3><button class="x" data-action="close-panel">✕</button></div><div class="build-list">`;
    for (const slot of SLOTS) {
      const info = slotInfo(slot.id);
      html += `<div class="build-card"><div class="bc-body">
        <div class="bc-name">${slot.name}</div>
        <div class="bc-desc">${info ? `Sol ${info.sol} · 人口 ${info.population} · ${formatTime(info.savedAt)}` : '空'}</div>
        <div class="slot-btns">
          <button class="btn sm" data-action="save-slot" data-id="${slot.id}">保存</button>
          ${info ? `<button class="btn sm" data-action="load-slot" data-id="${slot.id}">读取</button>
          <button class="btn sm danger" data-action="del-slot" data-id="${slot.id}">删除</button>` : ''}
        </div></div></div>`;
    }
    html += `</div>
      <div class="menu-foot">
        <button class="btn danger" data-action="new-colony">🆕 新开殖民地</button>
        <button class="btn" data-action="to-title">🏠 返回标题</button>
      </div>
      <p class="fine">Phase 3 将接入账号云存档（复用现有登录系统）。</p>`;
    els.panel.innerHTML = html;
  }

  function refreshPanel() {
    if (view.panel === 'build') renderBuildPanel();
    else if (view.panel === 'building') renderBuildingPanel();
    else if (view.panel === 'research') renderResearchPanel();
    else if (view.panel === 'missions') renderMissionsPanel();
    else if (view.panel === 'menu') renderMenuPanel();
    els.panel.hidden = !view.panel;
    document.querySelectorAll('#toolbar button').forEach(b => {
      b.classList.toggle('on', b.dataset.panel === view.panel);
    });
  }

  // ---------- 面板内点击代理 ----------
  els.panel.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (el.classList.contains('disabled')) return;
    actions.onPanelAction(a, el.dataset);
  });

  els.toolbar.addEventListener('click', e => {
    const btn = e.target.closest('button[data-panel]');
    if (!btn) return;
    const p = btn.dataset.panel;
    if (p === 'building') return;
    view.panel = view.panel === p ? null : p;
    if (view.panel === 'building') view.panel = null;
    actions.onPanelSwitch();
  });

  document.querySelector('.time-controls').addEventListener('click', e => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    actions.onSpeed(btn.dataset.speed);
  });

  return {
    gameLog, renderLog, refreshTopbar, refreshChrome, refreshPanel,
    refreshHUD() { refreshTopbar(); refreshChrome(); },
  };
}
