// ============================================================
// input.js —— 指针输入：拖拽平移 / 滚轮缩放 / 点击选中 / 建造放置
// 支持触屏：单指拖拽平移、双指捏合缩放、点选
// ============================================================
import { TILE, MAP_W, MAP_H, BUILDINGS } from './config.js';
import { canPlace } from './sim.js';

export function createInput(canvas, renderer, getState, view, hooks) {
  const pointers = new Map();
  let downPos = null;
  let panning = false;
  let pinchDist = 0;
  const DRAG_THRESHOLD = 6;

  function clampCam(cam) {
    cam.zoom = Math.max(0.4, Math.min(2.4, cam.zoom));
    const vw = canvas.clientWidth / cam.zoom;
    const vh = canvas.clientHeight / cam.zoom;
    const ww = MAP_W * TILE, wh = MAP_H * TILE;
    cam.x = Math.max(-vw * 0.3, Math.min(ww - vw * 0.7, cam.x));
    cam.y = Math.max(-vh * 0.3, Math.min(wh - vh * 0.7, cam.y));
  }

  function updateGhost(clientX, clientY) {
    if (!view.placing) { view.ghost = null; return; }
    const w = renderer.screenToWorld(clientX, clientY);
    const def = view.placingDef;
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    const chk = canPlace(getState(), view.placing, tx, ty, MAP_W, MAP_H);
    view.ghost = { type: view.placing, tx, ty, ok: chk.ok, reason: chk.reason };
    view.showGrid = true;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downPos = { x: e.clientX, y: e.clientY };
      panning = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      panning = true; // 双指即视为缩放手势，不再触发点击
    }
  });

  canvas.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const state = getState();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          const rect = canvas.getBoundingClientRect();
          const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
          zoomAt(state, d / pinchDist, cx, cy);
        }
        pinchDist = d;
        return;
      }
      if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > DRAG_THRESHOLD) {
        panning = true;
      }
      if (panning) {
        state.camera.x -= dx / state.camera.zoom;
        state.camera.y -= dy / state.camera.zoom;
        clampCam(state.camera);
        view.ghost = null;
      }
    }
    if (view.placing && !panning) updateGhost(e.clientX, e.clientY);
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && downPos) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (!panning && moved <= DRAG_THRESHOLD) handleTap(e.clientX, e.clientY);
      downPos = null;
      panning = false;
    }
    if (pointers.size < 2) pinchDist = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function handleTap(clientX, clientY) {
    const state = getState();
    const w = renderer.screenToWorld(clientX, clientY);
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    if (view.placing) {
      hooks.onPlace(tx, ty);
      return;
    }
    const b = state.buildings.find(x => {
      const def = BUILDINGS[x.type];
      return tx >= x.tx && tx < x.tx + def.w && ty >= x.ty && ty < x.ty + def.h;
    });
    hooks.onSelect(b || null);
  }

  function zoomAt(state, factor, cx, cy) {
    const cam = state.camera;
    const old = cam.zoom;
    const nz = Math.max(0.4, Math.min(2.4, old * factor));
    // 以光标为中心缩放
    cam.x = (cx / old + cam.x) - cx / nz;
    cam.y = (cy / old + cam.y) - cy / nz;
    cam.zoom = nz;
    clampCam(cam);
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(getState(), Math.pow(1.0015, -e.deltaY), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    hooks.onCancelPlacement();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (view.placing) hooks.onCancelPlacement();
      else hooks.onSelect(null);
    }
  });

  // 触屏：防止双击缩放等默认行为
  canvas.style.touchAction = 'none';

  return { clampCam, updateGhost };
}
