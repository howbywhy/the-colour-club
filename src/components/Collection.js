/**
 * Collection + filters — positioning statement stays outside gallery FLIP.
 * POSITIONING ≠ GALLERY: only .tile nodes participate in filter geometry.
 *
 * Shared: filter STATE (sector, fhide, latest intent, lock).
 * Divergent MOTION:
 * - Visual: authored-field remove/restore; FLIP; zero-survivor leave ghosts.
 * - Index: fixed table shell; rows only opacity in/out; no ghosts; no FLIP.
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

  /**
   * Lock Index field min-height to the full (unfiltered) stack so sparse
   * filters leave whitespace inside the shell instead of collapsing the page.
   */
  function syncIndexFieldMin() {
    const field = document.querySelector('#galleryField');
    if (!field) return;
    if (!document.body.classList.contains('x')) {
      field.style.minHeight = '';
      return;
    }
    const tiles = [...grid.querySelectorAll('.tile')];
    const hidden = tiles.map((t) => t.classList.contains('fhide'));
    tiles.forEach((t) => t.classList.remove('fhide'));
    void field.offsetHeight;
    const h = Math.ceil(field.getBoundingClientRect().height);
    tiles.forEach((t, i) => t.classList.toggle('fhide', hidden[i]));
    if (h > 0) field.style.minHeight = h + 'px';
  }

  function clearFilterGhosts() {
    document.querySelectorAll('#ghost > .fg').forEach((el) => el.remove());
  }

  /** Visual only — leave ghosts when the visible set has no survivors. */
  function spawnLeaveGhosts(leavers) {
    const layer = $('#ghost');
    if (!layer || !leavers.length) return [];
    return leavers
      .map((t) => {
        const r = t.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        const g = document.createElement('div');
        g.className = 'fg';
        g.dataset.filterGhost = t.dataset.id || '';
        g.style.left = r.left + 'px';
        g.style.top = r.top + 'px';
        g.style.width = r.width + 'px';
        g.style.height = r.height + 'px';
        g.style.opacity = '1';
        const img = t.querySelector('.ph img');
        if (img && img.currentSrc) {
          const clone = document.createElement('img');
          clone.src = img.currentSrc;
          clone.alt = '';
          g.appendChild(clone);
        } else {
          g.style.background = '#EFEFF1';
        }
        layer.appendChild(g);
        return g;
      })
      .filter(Boolean);
  }

  function flipDurationFor(dist) {
    const base = TIMING.filterFlip || 220;
    const max = TIMING.filterFlipMax || 420;
    if (dist <= 240) return base;
    return Math.min(max, Math.round(base + (dist - 240) * 0.08));
  }

  function cancelFilterMotion() {
    cancelElementAnims(grid.querySelectorAll('.tile'));
    clearFilterGhosts();
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

  function classify(sec) {
    const tiles = [...grid.querySelectorAll('.tile')];
    const leaving = tiles.filter((t) => !t.classList.contains('fhide') && !filterWillShow(sec, t));
    const survivors = tiles.filter((t) => !t.classList.contains('fhide') && filterWillShow(sec, t));
    const entering = tiles.filter((t) => t.classList.contains('fhide') && filterWillShow(sec, t));
    return { tiles, leaving, survivors, entering };
  }

  function applyShowHide(sec, tiles, entering, survivors, enterOpacity) {
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
      t.style.opacity = enterOpacity;
    });
    survivors.forEach((t) => {
      t.style.opacity = '';
      t.style.transform = '';
    });
    void grid.offsetHeight;
  }

  function finishFilter(gen, sy0, leaving, survivors, entering) {
    if (gen !== filterCtrl.gen) return false;
    clearFilterGhosts();
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
    return true;
  }

  /** Index — table shell fixed; rows opacity only; no ghosts; no FLIP. */
  async function transitionFilterIndex(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    const { tiles, leaving, survivors, entering } = classify(sec);
    filterCtrl.leavers = leaving.length;
    filterCtrl.survivors = survivors.length;
    filterCtrl.enterers = entering.length;
    const sy0 = scrollY;
    onDbg && onDbg();
    try {
      clearFilterGhosts();
      /* Drop residual view-switch FLIP transforms — Index filter is opacity-only. */
      tiles.forEach((t) => {
        t.getAnimations().forEach((a) => {
          try {
            a.cancel();
          } catch (_) {}
        });
        t.style.transform = '';
      });

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
      /* Survivors settle instantly in-table — no FLIP rides. */
      applyShowHide(sec, tiles, entering, survivors, RM ? '' : '0.001');

      filterCtrl.phase = 'entering';
      const enterWait = [];
      if (!RM) {
        entering.forEach((t) => {
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
      } else {
        entering.forEach((t) => {
          t.style.opacity = '';
        });
      }
      filterCtrl.animCount = enterWait.length;
      onDbg && onDbg();
      if (enterWait.length) await Promise.allSettled(enterWait);
      finishFilter(gen, sy0, leaving, survivors, entering);
    } catch (err) {
      console.error('[tcc] filter index', err);
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

  /** Visual — authored field; FLIP; zero-survivor leave ghosts. */
  async function transitionFilterVisual(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    const { tiles, leaving, survivors, entering } = classify(sec);
    filterCtrl.leavers = leaving.length;
    filterCtrl.survivors = survivors.length;
    filterCtrl.enterers = entering.length;
    const sy0 = scrollY;
    const bridgeLeave = !RM && survivors.length === 0 && leaving.length > 0;
    onDbg && onDbg();
    try {
      const before = new Map();
      survivors.forEach((t) => before.set(t, t.getBoundingClientRect()));

      clearFilterGhosts();
      let ghostWait = [];
      if (bridgeLeave) {
        const ghosts = spawnLeaveGhosts(leaving);
        filterCtrl.phase = 'leaving';
        onDbg && onDbg();
        ghostWait = ghosts.map((g) => {
          const an = g.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: TIMING.filterLeave,
            easing: TIMING.filterEase,
            fill: 'forwards',
          });
          return an.finished.then(
            () => {
              try {
                an.cancel();
              } catch (_) {}
              g.remove();
            },
            () => {
              try {
                g.remove();
              } catch (_) {}
            }
          );
        });
        filterCtrl.animCount = ghosts.length;
        onDbg && onDbg();
      } else {
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
      }

      if (gen !== filterCtrl.gen) return;

      filterCtrl.phase = 'flipping';
      onDbg && onDbg();
      applyShowHide(sec, tiles, entering, survivors, bridgeLeave || RM ? '' : '0.001');

      filterCtrl.phase = 'entering';
      const flipWait = [];
      const enterWait = [];
      const moveMin = TIMING.filterMoveMin || 16;
      const narrow = matchMedia('(max-width:767px)').matches;
      const moveMax = narrow ? 0 : TIMING.filterMoveMax || 1e6;
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
            duration: flipDurationFor(dist),
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
          if (bridgeLeave) {
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
      const allWait = [...ghostWait, ...flipWait, ...enterWait];
      filterCtrl.animCount = allWait.length;
      onDbg && onDbg();
      if (allWait.length) await Promise.allSettled(allWait);
      finishFilter(gen, sy0, leaving, survivors, entering);
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

  async function transitionFilter(sec, gen) {
    if (document.body.classList.contains('x')) return transitionFilterIndex(sec, gen);
    return transitionFilterVisual(sec, gen);
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
    addEventListener('resize', () => {
      if (document.body.classList.contains('x')) syncIndexFieldMin();
    });
  }

  return {
    filterCtrl,
    setFilter,
    buildTiles,
    bindFilters,
    applyFilterLayout,
    filterWillShow,
    syncIndexFieldMin,
  };
}
