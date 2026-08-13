/**
 * Dynamic TCC favicon — pointer/touch/scroll movement advances the club palette.
 * Throttled updates; reuses one canvas. Not a pixel eyedropper.
 */
import { TCC_HUES, TCC_BLUE } from '../theme/palette.js';
import { RM } from '../state/worldState.js';

const STEP_PX = 140;
const MIN_MS = RM ? 400 : 140;

export function bindFaviconColour() {
  let link = document.querySelector('link[rel="icon"][data-tcc]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.dataset.tcc = '1';
    document.head.appendChild(link);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  let hueI = 0;
  let acc = 0;
  let lastX = null;
  let lastY = null;
  let lastPaint = 0;
  let pending = null;
  let colour = TCC_BLUE;

  function paint(c) {
    colour = c;
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 11px Dia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TCC', 16, 17);
    link.href = canvas.toDataURL('image/png');
  }

  function advance(dist) {
    acc += dist;
    while (acc >= STEP_PX) {
      acc -= STEP_PX;
      hueI = (hueI + 1) % TCC_HUES.length;
    }
    const now = performance.now();
    if (now - lastPaint < MIN_MS) {
      if (pending == null) {
        pending = setTimeout(() => {
          pending = null;
          lastPaint = performance.now();
          paint(TCC_HUES[hueI]);
        }, MIN_MS - (now - lastPaint));
      }
      return;
    }
    lastPaint = now;
    paint(TCC_HUES[hueI]);
  }

  function onPoint(x, y) {
    if (lastX == null) {
      lastX = x;
      lastY = y;
      return;
    }
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    advance(dist);
  }

  paint(TCC_BLUE);

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') onPoint(e.clientX, e.clientY);
    },
    { passive: true }
  );
  addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) onPoint(t.clientX, t.clientY);
    },
    { passive: true }
  );

  let lastScroll = scrollY;
  addEventListener(
    'scroll',
    () => {
      const y = scrollY;
      advance(Math.abs(y - lastScroll));
      lastScroll = y;
    },
    { passive: true }
  );

  return {
    getColour: () => colour,
  };
}
