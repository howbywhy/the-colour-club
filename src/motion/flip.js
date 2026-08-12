import { $, RM } from '../state/worldState.js';
import { TIMING } from './timing.js';

function runAnim(anim, cleanup) {
  const finish = () => { try { cleanup && cleanup(); } catch (_) {} };
  if (!anim || typeof anim.finished?.then !== 'function') {
    finish();
    return Promise.resolve();
  }
  return anim.finished.then(finish, finish);
}

/* crop-aware flight: container tweens rects; image keeps intrinsic proportions. */
export function flyCrop(url, from, to, ms, done) {
  if (RM || !from || !to) { done && done(); return Promise.resolve(); }
  const g = document.createElement('div'); g.className = 'gc';
  g.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;`;
  g.innerHTML = `<img src="${url}" alt="">`;
  $('#ghost').appendChild(g);
  const a = g.animate(
    [{ left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' },
     { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' }],
    { duration: ms, easing: TIMING.ease, fill: 'forwards' });
  return runAnim(a, () => { g.remove(); done && done(); });
}

export function fly(url, from, to, ms, done) {
  if (RM || !from || !to) { done && done(); return Promise.resolve(); }
  const g = document.createElement('img'); g.src = url;
  g.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;transform-origin:top left;`;
  $('#ghost').appendChild(g);
  const dx = from.left - to.left, dy = from.top - to.top, sx = from.width / to.width, sy = from.height / to.height;
  const a = g.animate(
    [{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transform: 'none' }],
    { duration: ms, easing: TIMING.ease });
  return runAnim(a, () => { g.remove(); done && done(); });
}

export function flipTiles(grid, mutate, opts) {
  opts = opts || {};
  const tiles = [...grid.querySelectorAll('.tile')];
  const before = tiles.map(t => t.getBoundingClientRect());
  mutate();
  tiles.forEach((t, i) => {
    const b = before[i], a = t.getBoundingClientRect();
    if (a.width === 0 || b.width === 0) return;
    const dx = b.left - a.left, dy = b.top - a.top;
    if (RM || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return;
    t.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
      { duration: opts.dur || TIMING.flip, easing: TIMING.ease, delay: Math.min(i * 12, opts.cap || 140) });
  });
}
