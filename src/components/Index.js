/**
 * Index — row presentation, 4:5 nav thumbs (CSS), sort, natural-ratio hover preview.
 * Sector filter remains world state (owned with Collection/filters).
 * Hover preview stays source-image ratio — never 4:5.
 */
import { world, $ } from '../state/worldState.js';

export function createIndex({ grid, getById, media, nextHue, flipTiles, onDbg }) {
  const { dimOf, setImg } = media;

  function hidePreview(forId) {
    const pv = $('#ixpreview');
    if (!pv) return;
    if (forId && pv.dataset.for !== forId) return;
    pv.classList.remove('show');
    delete pv.dataset.for;
  }

  /** Desktop Index hover — natural-ratio floating preview; no touch equivalent. */
  function attachPreview(tile, p) {
    tile.addEventListener('mouseenter', () => {
      const c = nextHue();
      tile.style.setProperty('--hue', c);
      if (world.view !== 'index') return;
      if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
      const pv = $('#ixpreview'),
        pi = $('#ixpImg');
      if (!pv || !pi) return;
      pv.style.setProperty('--hue', c);
      pv.dataset.for = p.id;
      const d = dimOf(p, 0);
      const sizePreview = (w, h) => {
        const sc = Math.min(380 / w, (innerHeight * 0.62) / h);
        const W = Math.round(w * sc),
          H = Math.round(h * sc);
        pv.style.width = W + 'px';
        pv.style.height = H + 'px';
        const want = parseFloat(pv.dataset.top || '120');
        pv.style.top = Math.min(want, innerHeight - H - 24) + 'px';
      };
      if (d) sizePreview(d.width, d.height);
      const reveal = () => {
        if (pv.dataset.for !== p.id) return;
        if (!d && pi.naturalWidth) sizePreview(pi.naturalWidth, pi.naturalHeight);
        if (d || pi.naturalWidth) pv.classList.add('show');
      };
      pi.onload = reveal;
      setImg(pi, p, 0);
      if (pi.complete && (d || pi.naturalWidth)) reveal();
    });
    tile.addEventListener('mouseleave', () => hidePreview(p.id));
  }

  function sortIndex(key) {
    if (world.view !== 'index') return;
    const byId = getById();
    world.sort = key;
    world.last = 'sort:' + key;
    flipTiles(() => {
      [...grid.querySelectorAll('.tile')]
        .sort((a, b) =>
          key === 'name'
            ? byId[a.dataset.id].name.localeCompare(byId[b.dataset.id].name)
            : byId[a.dataset.id].sector.localeCompare(byId[b.dataset.id].sector)
        )
        .forEach((t) => grid.appendChild(t));
    });
    document.querySelectorAll('#ixhead [data-sort]').forEach((b) => b.classList.toggle('sorted', b.dataset.sort === key));
    onDbg && onDbg();
  }

  function bindSortHeaders() {
    document.querySelectorAll('#ixhead [data-sort]').forEach((b) => b.addEventListener('click', () => sortIndex(b.dataset.sort)));
  }

  return { attachPreview, sortIndex, bindSortHeaders, hidePreview };
}
