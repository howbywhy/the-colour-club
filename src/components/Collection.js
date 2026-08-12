/**
 * Collection + filters — positioning statement stays outside gallery FLIP.
 * POSITIONING ≠ GALLERY: only .tile nodes participate in filter geometry.
 *
 * Filter baseline (preserve exactly):
 * - latest intent wins; immediate active filter; promise completion
 * - no stagger; leave primary; survivors do not fade; enter quietly
 * - thresholded desktop FLIP (<16 snap, >240 snap — perceptual); mobile fade-only
 * - no statement motion; no scroll drift
 */
import { world, RM, $, acquire, release } from '../state/worldState.js';
import { TIMING, cancelElementAnims, endIntro } from '../motion/transitions.js';

export function createCollection({
  grid,
  getById,
  getProjects,
  media,
  attachPreview,
  openProject,
  syncHash,
  onDbg,
}) {
  const { classFromDim, imgTag, sweep } = media;

  const filterCtrl = {
    phase: 'idle' /* idle | leaving | flipping | entering */,
    target: null,
    gen: 0,
    leavers: 0,
    survivors: 0,
    enterers: 0,
    animCount: 0,
    ownedLock: false,
  };

  function filterWillShow(sec, t) {
    return sec === 'all' || getById()[t.dataset.id].cat === sec;
  }

  function applyFilterLayout(sec) {
    document.body.classList.toggle('filtered', sec !== 'all');
    [...grid.querySelectorAll('.tile')].forEach((t) => {
      t.classList.toggle('fhide', !filterWillShow(sec, t));
      t.style.opacity = '';
      t.style.transform = '';
    });
  }

  function cancelFilterMotion() {
    cancelElementAnims(grid.querySelectorAll('.tile'));
    filterCtrl.animCount = 0;
  }

  function beginFilterLock() {
    if (!world.lock) acquire();
    else {
      clearTimeout(world._wd);
      world._wd = setTimeout(() => {
        world.lock = false;
        filterCtrl.ownedLock = false;
      }, TIMING.watchdog);
    }
    filterCtrl.ownedLock = true;
  }

  function endFilterLock() {
    if (!filterCtrl.ownedLock) return;
    filterCtrl.ownedLock = false;
    release();
  }

  async function transitionFilter(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    const tiles = [...grid.querySelectorAll('.tile')];
    const leaving = tiles.filter((t) => !t.classList.contains('fhide') && !filterWillShow(sec, t));
    const survivors = tiles.filter((t) => !t.classList.contains('fhide') && filterWillShow(sec, t));
    const entering = tiles.filter((t) => t.classList.contains('fhide') && filterWillShow(sec, t));
    filterCtrl.leavers = leaving.length;
    filterCtrl.survivors = survivors.length;
    filterCtrl.enterers = entering.length;
    const sy0 = scrollY;
    onDbg && onDbg();
    try {
      const before = new Map();
      survivors.forEach((t) => before.set(t, t.getBoundingClientRect()));

      filterCtrl.phase = 'leaving';
      onDbg && onDbg();
      if (!RM && leaving.length) {
        const leaveWait = leaving.map((t) => {
          const an = t.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: TIMING.filterLeave,
            easing: TIMING.filterEase,
            fill: 'forwards',
          });
          return an.finished.then(
            () => {
              t.style.opacity = '0';
              try {
                an.cancel();
              } catch (_) {}
            },
            () => {}
          );
        });
        filterCtrl.animCount = leaving.length;
        onDbg && onDbg();
        await Promise.allSettled(leaveWait);
        if (gen !== filterCtrl.gen) return;
        leaving.forEach((t) => {
          t.style.opacity = '0';
        });
      } else {
        leaving.forEach((t) => {
          t.style.opacity = '0';
        });
      }

      if (gen !== filterCtrl.gen) return;

      filterCtrl.phase = 'flipping';
      onDbg && onDbg();
      document.body.classList.toggle('filtered', sec !== 'all');
      tiles.forEach((t) => {
        const show = filterWillShow(sec, t);
        t.classList.toggle('fhide', !show);
        if (!show) {
          t.style.opacity = '';
          t.style.transform = '';
        }
      });
      entering.forEach((t) => {
        /* Avoid a blank-frame reload feel: Index shows instantly; Visual starts near-visible. */
        if (!document.body.classList.contains('x')) t.style.opacity = '0.001';
      });
      survivors.forEach((t) => {
        t.style.opacity = '';
      });
      void grid.offsetHeight;

      filterCtrl.phase = 'entering';
      const flipWait = [];
      const enterWait = [];
      const moveMin = TIMING.filterMoveMin || 16;
      const narrow = matchMedia('(max-width:767px)').matches;
      const moveMax = narrow ? 0 : TIMING.filterMoveMax || 240;
      if (!RM) {
        survivors.forEach((t) => {
          const b = before.get(t),
            a = t.getBoundingClientRect();
          if (!b || a.width === 0 || b.width === 0) return;
          const dx = b.left - a.left,
            dy = b.top - a.top;
          const dist = Math.hypot(dx, dy);
          if (dist < moveMin || dist > moveMax) return;
          const an = t.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], {
            duration: TIMING.filterFlip,
            easing: TIMING.filterEase,
          });
          flipWait.push(
            an.finished.then(
              () => {
                try {
                  an.cancel();
                } catch (_) {}
                t.style.transform = '';
              },
              () => {}
            )
          );
        });
        entering.forEach((t) => {
          /* Index: instant restore — mass fade reads as page reload.
             Visual: quiet opacity resolve only (no stagger). */
          if (document.body.classList.contains('x')) {
            t.style.opacity = '';
            return;
          }
          const an = t.animate([{ opacity: 0.001 }, { opacity: 1 }], {
            duration: TIMING.filterEnter,
            easing: TIMING.filterEase,
            fill: 'forwards',
          });
          enterWait.push(
            an.finished.then(
              () => {
                t.style.opacity = '1';
                try {
                  an.cancel();
                } catch (_) {}
                t.style.opacity = '';
              },
              () => {}
            )
          );
        });
      }
      const allWait = [...flipWait, ...enterWait];
      filterCtrl.animCount = allWait.length;
      onDbg && onDbg();
      if (allWait.length) await Promise.allSettled(allWait);
      if (gen !== filterCtrl.gen) return;

      survivors.forEach((t) => {
        t.getAnimations().forEach((a) => {
          try {
            a.cancel();
          } catch (_) {}
        });
        t.style.transform = '';
        t.style.opacity = '';
      });
      entering.forEach((t) => {
        t.getAnimations().forEach((a) => {
          try {
            a.cancel();
          } catch (_) {}
        });
        t.style.opacity = '';
      });
      leaving.forEach((t) => {
        t.style.opacity = '';
      });

      if (Math.abs(scrollY - sy0) > 0) scrollTo(0, sy0);

      filterCtrl.phase = 'idle';
      filterCtrl.target = null;
      filterCtrl.animCount = 0;
      filterCtrl.leavers = 0;
      filterCtrl.survivors = 0;
      filterCtrl.enterers = 0;
      endFilterLock();
      onDbg && onDbg();
    } catch (err) {
      console.error('[tcc] filter', err);
      if (gen !== filterCtrl.gen) return;
      cancelFilterMotion();
      applyFilterLayout(sec);
      filterCtrl.phase = 'idle';
      filterCtrl.target = null;
      filterCtrl.animCount = 0;
      endFilterLock();
      onDbg && onDbg();
    }
  }

  function setFilter(sec, quiet) {
    if (quiet) {
      filterCtrl.gen++;
      cancelFilterMotion();
      world.sector = sec;
      world.last = 'filter:' + sec;
      document.querySelectorAll('#filters .fbtn').forEach((b) => b.classList.toggle('on', b.dataset.f === sec));
      applyFilterLayout(sec);
      filterCtrl.phase = 'idle';
      filterCtrl.target = null;
      filterCtrl.animCount = 0;
      endFilterLock();
      onDbg && onDbg();
      return;
    }
    endIntro();
    const alreadyThere = world.sector === sec && (filterCtrl.phase === 'idle' || filterCtrl.target === sec);
    if (alreadyThere) return;
    if (world.lock && filterCtrl.phase === 'idle') return;

    world.sector = sec;
    world.last = 'filter:' + sec;
    document.querySelectorAll('#filters .fbtn').forEach((b) => b.classList.toggle('on', b.dataset.f === sec));
    syncHash();
    onDbg && onDbg();

    if (RM) {
      applyFilterLayout(sec);
      return;
    }

    if (filterCtrl.phase !== 'idle') cancelFilterMotion();
    const gen = ++filterCtrl.gen;
    transitionFilter(sec, gen);
  }

  function buildTiles() {
    getProjects().forEach((p) => {
      const t = document.createElement('article');
      const coverClass = classFromDim(p, 0);
      t.className = 'tile ' + p.emp + (coverClass ? ' ' + coverClass : '');
      t.dataset.id = p.id;
      t.tabIndex = 0;
      t.setAttribute('role', 'button');
      t.setAttribute('aria-label', 'Open ' + p.name);
      t.innerHTML = `<div class="ph">${imgTag(p, 0, 'loading="lazy" alt="' + p.name + '"')}</div>
    <div class="lbl"><span class="nm">${p.name}</span><span class="st">${p.strap}</span>
    <span class="ix sec">${p.sector}</span><span class="ix sco">${p.deliv.slice(0, 3).join(' · ')}${p.deliv.length > 3 ? ' +' + (p.deliv.length - 3) : ''}</span></div>`;
      t.addEventListener('click', () => openProject(p.id));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openProject(p.id);
      });
      attachPreview(t, p);
      grid.appendChild(t);
    });
    sweep(grid);
  }

  function bindFilters() {
    document.querySelectorAll('#filters .fbtn').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.f)));
  }

  return {
    filterCtrl,
    setFilter,
    buildTiles,
    bindFilters,
    applyFilterLayout,
    filterWillShow,
  };
}
