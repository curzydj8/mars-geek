// ============================================================
// save.js —— localStorage 多槽位存档 + 自动保存
// ============================================================
import { SAVE_KEY } from './config.js';
import { serialize, deserialize } from './state.js';

export const SLOTS = [
  { id: 'auto',  name: '自动存档' },
  { id: 'slot1', name: '存档 1' },
  { id: 'slot2', name: '存档 2' },
  { id: 'slot3', name: '存档 3' },
];

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
  } catch { return {}; }
}
function writeAll(all) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

export function saveGame(state, slotId) {
  const all = readAll();
  all[slotId] = serialize(state);
  return writeAll(all);
}

export function loadGame(slotId) {
  const all = readAll();
  const json = all[slotId];
  if (!json) return null;
  try { return deserialize(json); }
  catch { return null; }
}

export function deleteSlot(slotId) {
  const all = readAll();
  delete all[slotId];
  writeAll(all);
}

export function slotInfo(slotId) {
  const all = readAll();
  const json = all[slotId];
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    return { sol: d.sol, savedAt: d.savedAt || 0, population: d.population?.count ?? 0 };
  } catch { return null; }
}

export function hasAnySave() {
  return SLOTS.some(s => slotInfo(s.id));
}

export function wipeAll() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
