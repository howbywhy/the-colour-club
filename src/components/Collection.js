/**
 * Collection + filters — positioning statement stays outside gallery FLIP.
 * POSITIONING ≠ GALLERY: only .tile nodes participate in filter geometry.
 *
 * Shared: filter STATE (sector, fhide, latest intent, lock).
 * Visual:
 *   All = authored absolute columns
 *   Sector = persistent six-slot canvas (slot geometry stable across queries)
 * Index: shell + row opacity only (unchanged).
 *
 * Visual motion:
 * - All→Sector: leavers fade; every entrant uses SECTOR_SETTLE (no source FLIP)
 * - Sector→All: slot occupants FLIP back when local; All returners quiet resolve
 * - Sector→Sector: slot-level content handoff only — no whole-field fade
 */
import { world, RM, $, acquire, release } from '../state/worldState.js';
import { TIMING, cancelElementAnims, endIntro } from '../motion/transitions.js';
import { applyAllLayout, clearAllLayout } from '../state/allLayouts.js';

const SECTOR_SLOT_COUNT = 6;

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
  /** @type {HTMLElement[]} */
  let slots = [];

  const filterCtrl = {
    phase: 'idle' /* idle | leaving | flipping | entering */,
    target: null,
    gen: 0,
    leavers: 0,
    survivors: 0,
    enterers: 0,
    animCount: 0,
    ownedLock: false,
    /** Last All→Sector per-tile modes — always SECTOR_SETTLE (desktop/mobile). */
    entryModes: [],
  };

  function filterWillShow(sec, t) {
    return sec === 'all' || getById()[t.dataset.id].cat === sec;
  }

  function allTiles() {
    return [...grid.querySelectorAll('.tile')];
  }

  function findTile(id) {
    return grid.querySelector(`.tile[data-id="${id}"]`);
  }

  /**
   * Authored sector occupancy — stable slot order (not raw CMS order).
   * Hospitality 0–5, FMCG/Place 0–3, Culture 0. Empty trailing slots stay sparse.
   */
  const SECTOR_ORDER = {
    hospitality: ['dopa', 'fishfish', 'roy', 'gella', 'lucky', 'tsukiyo'],
    fmcg: ['sub3', 'macabalm', 'willing', 'rgh'],
    place: ['microsoft', 'mesa', 'adela', 'aogc'],
    culture: ['worthy'],
  };

  function sectorProjectIds(sec) {
    if (sec === 'all') return [];
    const authored = SECTOR_ORDER[sec];
    if (authored) return authored.slice(0, SECTOR_SLOT_COUNT);
    return getProjects()
      .filter((p) => p.cat === sec)
      .map((p) => p.id)
      .slice(0, SECTOR_SLOT_COUNT);
  }

  function ensureSectorSlots() {
    if (slots.length === SECTOR_SLOT_COUNT && slots.every((s) => s.isConnected)) return slots;
    slots = [];
    for (let i = 0; i < SECTOR_SLOT_COUNT; i++) {
      let s = grid.querySelector(`:scope > .sector-slot[data-slot="${i}"]`);
      if (!s) {
        s = document.createElement('div');
        s.className = 'sector-slot';
        s.dataset.slot = String(i);
        s.setAttribute('aria-hidden', 'true');
        grid.appendChild(s);
      }
      slots.push(s);
    }
    return slots;
  }

  /** Move every tile out of slots onto #colgrid in canonical project order. */
  function ejectAllSlots() {
    ensureSectorSlots();
    slots.forEach((slot) => {
      while (slot.firstChild) grid.appendChild(slot.firstChild);
      slot.setAttribute('aria-hidden', 'true');
    });
    getProjects().forEach((p) => {
      const t = findTile(p.id);
      if (t) grid.appendChild(t);
    });
    slots.forEach((s) => grid.appendChild(s));
  }

  /**
   * Mount sector occupancy into the persistent slot canvas (instant).
   * Does not animate — used by quiet routes / RM / commit steps.
   */
  function mountSector(sec) {
    ensureSectorSlots();
    document.body.classList.add('filtered');
    clearAllLayout(grid);
    const ids = sectorProjectIds(sec);
    ejectAllSlots();
    allTiles().forEach((t) => {
      const idx = ids.indexOf(t.dataset.id);
      if (idx >= 0) {
        t.classList.remove('fhide');
        t.style.opacity = '';
        t.style.transform = '';
        slots[idx].appendChild(t);
        slots[idx].setAttribute('aria-hidden', 'false');
      } else {
        t.classList.add('fhide');
        t.style.opacity = '';
        t.style.transform = '';
        grid.appendChild(t);
      }
    });
    slots.forEach((s, i) => {
      if (!ids[i]) s.setAttribute('aria-hidden', 'true');
    });
    void grid.offsetHeight;
  }

  function applyFilterLayout(sec) {
    if (document.body.classList.contains('x')) {
      ejectAllSlots();
      clearAllLayout(grid);
      document.body.classList.toggle('filtered', sec !== 'all');
      allTiles().forEach((t) => {
        t.classList.toggle('fhide', !filterWillShow(sec, t));
        t.style.opacity = '';
        t.style.transform = '';
      });
      return;
    }
    if (sec === 'all') {
      document.body.classList.remove('filtered');
      ejectAllSlots();
      allTiles().forEach((t) => {
        t.classList.remove('fhide');
        t.style.opacity = '';
        t.style.transform = '';
      });
      applyAllLayout(grid, world.allVariant || 1);
      return;
    }
    clearAllLayout(grid);
    mountSector(sec);
  }

  /** Keep slot DOM coherent when Visual ↔ Index toggles. */
  function syncSectorCanvas() {
    applyFilterLayout(world.sector);
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
    ejectAllSlots();
    const tiles = allTiles();
    const hidden = tiles.map((t) => t.classList.contains('fhide'));
    tiles.forEach((t) => t.classList.remove('fhide'));
    void field.offsetHeight;
    const h = Math.ceil(field.getBoundingClientRect().height);
    tiles.forEach((t, i) => t.classList.toggle('fhide', hidden[i]));
    if (h > 0) field.style.minHeight = h + 'px';
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

  function classify(sec) {
    const tiles = allTiles();
    const leaving = tiles.filter((t) => !t.classList.contains('fhide') && !filterWillShow(sec, t) && isTileVisible(t));
    const survivors = tiles.filter((t) => isTileVisible(t) && filterWillShow(sec, t));
    const entering = tiles.filter((t) => !isTileVisible(t) && filterWillShow(sec, t));
    return { tiles, leaving, survivors, entering };
  }

  function isTileVisible(t) {
    if (t.classList.contains('fhide')) return false;
    if (t.parentElement && t.parentElement.classList.contains('sector-slot')) return true;
    if (document.body.classList.contains('filtered') && document.body.classList.contains('g')) {
      /* Parked direct child while sector canvas is active */
      return false;
    }
    return true;
  }

  function finishFilter(gen, sy0, touched) {
    if (gen !== filterCtrl.gen) return false;
    (touched || allTiles()).forEach((t) => {
      t.getAnimations?.().forEach((a) => {
        try {
          a.cancel();
        } catch (_) {}
      });
      t.style.transform = '';
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

  function animateOpacity(el, from, to, duration) {
    const an = el.animate([{ opacity: from }, { opacity: to }], {
      duration,
      easing: TIMING.filterEase,
      fill: 'forwards',
    });
    return an.finished.then(
      () => {
        el.style.opacity = String(to);
        try {
          an.cancel();
        } catch (_) {}
      },
      () => {}
    );
  }

  async function leaveTiles(leaving, gen) {
    filterCtrl.phase = 'leaving';
    onDbg && onDbg();
    if (!RM && leaving.length) {
      const leaveWait = leaving.map((t) => animateOpacity(t, 1, 0, TIMING.filterLeave));
      filterCtrl.animCount = leaving.length;
      onDbg && onDbg();
      await Promise.allSettled(leaveWait);
      if (gen !== filterCtrl.gen) return false;
      leaving.forEach((t) => {
        t.style.opacity = '0';
      });
    } else {
      leaving.forEach((t) => {
        t.style.opacity = '0';
      });
    }
    return gen === filterCtrl.gen;
  }

  function flipDurationFor(dist) {
    const base = TIMING.filterFlip || 220;
    const max = TIMING.filterFlipMax || 320;
    const d = Math.min(Math.max(dist, 0), TIMING.filterMoveMax || 800);
    return Math.min(max, Math.max(180, Math.round(base + (d - 16) * 0.12)));
  }

  /* ---------- Sector slot handoff (Sector → Sector) ---------- */

  async function slotClear(slot, outTile, gen) {
    if (!RM) await animateOpacity(outTile, 1, 0, TIMING.slotOut);
    if (gen !== filterCtrl.gen) return;
    outTile.classList.add('fhide');
    outTile.style.opacity = '';
    grid.appendChild(outTile);
    slot.setAttribute('aria-hidden', 'true');
  }

  async function slotFill(slot, nextId, gen) {
    const inTile = findTile(nextId);
    if (!inTile) return;
    inTile.classList.remove('fhide');
    if (RM) {
      inTile.style.opacity = '';
      slot.appendChild(inTile);
      slot.setAttribute('aria-hidden', 'false');
      return;
    }
    const floor = TIMING.slotHandoffFloor ?? 0.15;
    inTile.style.opacity = String(floor);
    slot.appendChild(inTile);
    slot.setAttribute('aria-hidden', 'false');
    void inTile.offsetWidth;
    await animateOpacity(inTile, floor, 1, TIMING.slotIn);
    if (gen !== filterCtrl.gen) return;
    inTile.style.opacity = '';
  }

  async function slotReplace(slot, outTile, nextId, gen) {
    const inTile = findTile(nextId);
    if (!inTile) return;
    const floor = TIMING.slotHandoffFloor ?? 0.15;
    if (RM) {
      outTile.classList.add('fhide');
      outTile.style.opacity = '';
      grid.appendChild(outTile);
      inTile.classList.remove('fhide');
      inTile.style.opacity = '';
      slot.appendChild(inTile);
      slot.setAttribute('aria-hidden', 'false');
      return;
    }
    await animateOpacity(outTile, 1, floor, TIMING.slotOut);
    if (gen !== filterCtrl.gen) return;
    outTile.classList.add('fhide');
    outTile.style.opacity = '';
    grid.appendChild(outTile);
    inTile.classList.remove('fhide');
    inTile.style.opacity = String(floor);
    slot.appendChild(inTile);
    slot.setAttribute('aria-hidden', 'false');
    void inTile.offsetWidth;
    await animateOpacity(inTile, floor, 1, TIMING.slotIn);
    if (gen !== filterCtrl.gen) return;
    inTile.style.opacity = '';
  }

  /**
   * Sector → Sector: persistent canvas; only slot contents change.
   * Never fades #colgrid / #galleryField / parent.
   */
  async function transitionSectorQuery(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    ensureSectorSlots();
    const ids = sectorProjectIds(sec);
    filterCtrl.leavers = 0;
    filterCtrl.survivors = 0;
    filterCtrl.enterers = 0;
    const sy0 = scrollY;
    filterCtrl.phase = 'entering';
    onDbg && onDbg();
    try {
      const jobs = [];
      for (let i = 0; i < SECTOR_SLOT_COUNT; i++) {
        const slot = slots[i];
        const cur = slot.querySelector(':scope > .tile');
        const nextId = ids[i] || null;
        const curId = cur ? cur.dataset.id : null;
        if (curId === nextId) {
          if (cur) {
            cur.style.opacity = '';
            cur.classList.remove('fhide');
          }
          continue;
        }
        if (curId && nextId) {
          filterCtrl.leavers++;
          filterCtrl.enterers++;
          jobs.push(slotReplace(slot, cur, nextId, gen));
        } else if (curId && !nextId) {
          filterCtrl.leavers++;
          jobs.push(slotClear(slot, cur, gen));
        } else if (!curId && nextId) {
          filterCtrl.enterers++;
          jobs.push(slotFill(slot, nextId, gen));
        }
      }
      filterCtrl.animCount = jobs.length;
      onDbg && onDbg();
      if (jobs.length) await Promise.allSettled(jobs);
      if (gen !== filterCtrl.gen) return;

      /* Ensure non-occupants stay parked */
      allTiles().forEach((t) => {
        if (!ids.includes(t.dataset.id)) {
          t.classList.add('fhide');
          t.style.opacity = '';
          if (t.parentElement?.classList.contains('sector-slot')) grid.appendChild(t);
          else if (t.parentElement !== grid) grid.appendChild(t);
        }
      });
      finishFilter(gen, sy0, allTiles());
    } catch (err) {
      console.error('[tcc] filter sector-query', err);
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

  /** Universal All→Sector arrival — same offset/opacity/duration for every sector. */
  function sectorSettleOffsetY() {
    const narrow = matchMedia('(max-width:767px)').matches;
    return narrow ? TIMING.sectorSettleYMobile ?? 24 : TIMING.sectorSettleY ?? 40;
  }

  function runSectorSettle(t) {
    const y = sectorSettleOffsetY();
    const op0 = TIMING.sectorSettleOp ?? 0.28;
    const dur = TIMING.sectorSettle ?? 260;
    t.style.opacity = String(op0);
    t.style.transform = `translateY(${y}px)`;
    void t.offsetWidth;
    const an = t.animate(
      [
        { transform: `translateY(${y}px)`, opacity: op0 },
        { transform: 'translateY(0px)', opacity: 1 },
      ],
      { duration: dur, easing: TIMING.filterEase }
    );
    t.style.transform = '';
    t.style.opacity = '';
    return an.finished.then(
      () => {
        try {
          an.cancel();
        } catch (_) {}
        t.style.transform = '';
        t.style.opacity = '';
      },
      () => {
        t.style.transform = '';
        t.style.opacity = '';
      }
    );
  }

  /** All → Sector: subtract All; every entrant uses SECTOR_SETTLE into fixed slots. */
  async function transitionAllToSector(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    filterCtrl.entryModes = [];
    const { tiles, leaving, survivors } = classify(sec);
    filterCtrl.leavers = leaving.length;
    filterCtrl.survivors = survivors.length;
    filterCtrl.enterers = 0;
    const sy0 = scrollY;
    onDbg && onDbg();
    try {
      const ids = sectorProjectIds(sec);

      /* Leave starts; identical overlap for every sector — arrival before empty field */
      filterCtrl.phase = 'leaving';
      onDbg && onDbg();
      const leaveP = leaveTiles(leaving, gen);
      const overlap = RM ? 0 : TIMING.sectorLeaveOverlap ?? 56;
      if (overlap > 0) await new Promise((r) => setTimeout(r, overlap));
      if (gen !== filterCtrl.gen) return;

      filterCtrl.phase = 'flipping';
      onDbg && onDbg();

      leaving.forEach((t) => {
        t.classList.add('fhide');
        t.style.opacity = '';
        t.style.transform = '';
        grid.appendChild(t);
      });

      ensureSectorSlots();
      document.body.classList.add('filtered');
      const y0 = sectorSettleOffsetY();
      const op0 = TIMING.sectorSettleOp ?? 0.28;
      ids.forEach((id, i) => {
        const t = findTile(id);
        if (!t) return;
        t.classList.remove('fhide');
        t.style.opacity = RM ? '' : String(op0);
        t.style.transform = RM ? '' : `translateY(${y0}px)`;
        slots[i].appendChild(t);
        slots[i].setAttribute('aria-hidden', 'false');
      });
      slots.forEach((s, i) => {
        if (!ids[i]) s.setAttribute('aria-hidden', 'true');
      });
      void grid.offsetHeight;

      filterCtrl.phase = 'entering';
      filterCtrl.entryModes = ids.map((id) => ({ id, mode: 'SECTOR_SETTLE' }));
      const waits = [];

      if (RM) {
        ids.forEach((id) => {
          const t = findTile(id);
          if (!t) return;
          t.style.opacity = '';
          t.style.transform = '';
        });
      } else {
        ids.forEach((id) => {
          const t = findTile(id);
          if (t) waits.push(runSectorSettle(t));
        });
      }

      waits.push(leaveP.then(() => {}));

      filterCtrl.animCount = waits.length;
      onDbg && onDbg();
      if (waits.length) await Promise.allSettled(waits);
      if (gen !== filterCtrl.gen) return;
      finishFilter(gen, sy0, tiles);
    } catch (err) {
      console.error('[tcc] filter all→sector', err);
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

  /** Viewport-aware Sector→All motion class — shared for every sector. */
  function classifyReturn(before, after, vh) {
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const dist = Math.hypot(dx, dy);
    const micro = TIMING.filterReturnMicro ?? 20;
    const localMax = TIMING.filterReturnLocal ?? 280;
    const pad = TIMING.filterReturnViewPad ?? 48;
    const inView = (r) => r.bottom > -pad && r.top < vh + pad;
    if (dist < micro) return { kind: 'micro', dx, dy, dist };
    if (inView(before) && inView(after) && dist <= localMax && Math.abs(dy) <= localMax) {
      return { kind: 'local', dx, dy, dist };
    }
    return { kind: 'remote', dx, dy, dist };
  }

  /**
   * Sector → All — one shared restoration pipeline for every sector.
   * 1 capture Sector rects
   * 2 fade occupants out in place (no travel)
   * 3 commit session All variant geometry with everything opacity 0
   * 4 classify: micro / local FLIP / remote resolve
   * 5 prepare invert or hidden state before paint
   * 6 FLIP only local survivors; fade remotes + returners at All
   */
  async function transitionSectorToAll(gen) {
    beginFilterLock();
    filterCtrl.target = 'all';
    ensureSectorSlots();
    const occupants = slots.map((s) => s.querySelector(':scope > .tile')).filter(Boolean);
    const occIds = new Set(occupants.map((t) => t.dataset.id));
    const returners = allTiles().filter((t) => !occIds.has(t.dataset.id));
    filterCtrl.leavers = 0;
    filterCtrl.survivors = occupants.length;
    filterCtrl.enterers = returners.length;
    const sy0 = scrollY;
    const vh = innerHeight;
    const narrow = matchMedia('(max-width:767px)').matches;
    onDbg && onDbg();
    try {
      const before = new Map();
      occupants.forEach((t) => before.set(t, t.getBoundingClientRect()));

      /* 2 — resolve Sector contents locally first (shared across all sectors) */
      filterCtrl.phase = 'leaving';
      onDbg && onDbg();
      if (!RM && occupants.length) {
        await Promise.allSettled(occupants.map((t) => animateOpacity(t, 1, 0, TIMING.slotOut)));
        if (gen !== filterCtrl.gen) return;
      } else {
        occupants.forEach((t) => {
          t.style.opacity = '0';
        });
      }

      /* 3 — commit authored All (variant already on body) while fully hidden */
      filterCtrl.phase = 'flipping';
      onDbg && onDbg();
      document.body.classList.remove('filtered');
      ejectAllSlots();
      allTiles().forEach((t) => {
        t.classList.remove('fhide');
        t.style.opacity = '0';
        t.style.transform = '';
      });
      applyAllLayout(grid, world.allVariant || 1);
      void grid.offsetHeight;

      /* 4 — classify against real All destinations */
      const plans = occupants.map((t) => {
        const b = before.get(t);
        const a = t.getBoundingClientRect();
        const cls =
          narrow || RM || !b || a.width === 0
            ? { kind: 'remote', dx: 0, dy: 0, dist: 0 }
            : classifyReturn(b, a, vh);
        return { t, cls };
      });

      /* 5 — prepare expose state synchronously (no full-opacity All frame) */
      plans.forEach(({ t, cls }) => {
        if (cls.kind === 'local') {
          t.style.transform = `translate(${cls.dx}px,${cls.dy}px)`;
          t.style.opacity = '1';
        } else {
          t.style.transform = '';
          t.style.opacity = '0';
        }
      });
      returners.forEach((t) => {
        t.style.transform = '';
        t.style.opacity = '0';
      });
      void grid.offsetHeight;

      filterCtrl.phase = 'entering';
      const flipWait = [];
      const enterWait = [];

      if (RM) {
        allTiles().forEach((t) => {
          t.style.opacity = '';
          t.style.transform = '';
        });
      } else {
        plans.forEach(({ t, cls }) => {
          if (cls.kind === 'local') {
            const an = t.animate(
              [{ transform: `translate(${cls.dx}px,${cls.dy}px)` }, { transform: 'none' }],
              { duration: flipDurationFor(cls.dist), easing: TIMING.filterEase }
            );
            t.style.transform = '';
            flipWait.push(
              an.finished.then(
                () => {
                  try {
                    an.cancel();
                  } catch (_) {}
                  t.style.transform = '';
                  t.style.opacity = '';
                },
                () => {}
              )
            );
          } else {
            enterWait.push(
              animateOpacity(t, 0, 1, TIMING.filterEnter).then(() => {
                t.style.opacity = '';
              })
            );
          }
        });
        returners.forEach((t) => {
          enterWait.push(
            animateOpacity(t, 0, 1, TIMING.filterEnter).then(() => {
              t.style.opacity = '';
            })
          );
        });
      }

      const allWait = [...flipWait, ...enterWait];
      filterCtrl.animCount = allWait.length;
      onDbg && onDbg();
      if (allWait.length) await Promise.allSettled(allWait);
      if (Math.abs(scrollY - sy0) > 0) scrollTo(0, sy0);
      finishFilter(gen, sy0, allTiles());
    } catch (err) {
      console.error('[tcc] filter sector→all', err);
      if (gen !== filterCtrl.gen) return;
      cancelFilterMotion();
      applyFilterLayout('all');
      filterCtrl.phase = 'idle';
      filterCtrl.target = null;
      filterCtrl.animCount = 0;
      endFilterLock();
      onDbg && onDbg();
    }
  }

  /** Index — table shell fixed; rows opacity only; no ghosts; no FLIP. */
  async function transitionFilterIndex(sec, gen) {
    beginFilterLock();
    filterCtrl.target = sec;
    ejectAllSlots();
    document.body.classList.toggle('filtered', sec !== 'all');
    const tiles = allTiles();
    const leaving = tiles.filter((t) => !t.classList.contains('fhide') && !filterWillShow(sec, t));
    const survivors = tiles.filter((t) => !t.classList.contains('fhide') && filterWillShow(sec, t));
    const entering = tiles.filter((t) => t.classList.contains('fhide') && filterWillShow(sec, t));
    filterCtrl.leavers = leaving.length;
    filterCtrl.survivors = survivors.length;
    filterCtrl.enterers = entering.length;
    const sy0 = scrollY;
    onDbg && onDbg();
    try {
      tiles.forEach((t) => {
        t.getAnimations().forEach((a) => {
          try {
            a.cancel();
          } catch (_) {}
        });
        t.style.transform = '';
      });

      if (!(await leaveTiles(leaving, gen))) return;
      if (gen !== filterCtrl.gen) return;

      filterCtrl.phase = 'flipping';
      onDbg && onDbg();
      tiles.forEach((t) => {
        const show = filterWillShow(sec, t);
        t.classList.toggle('fhide', !show);
        if (!show) {
          t.style.opacity = '';
          t.style.transform = '';
        }
      });
      entering.forEach((t) => {
        t.style.opacity = RM ? '' : '0.001';
      });
      survivors.forEach((t) => {
        t.style.opacity = '';
        t.style.transform = '';
      });
      void grid.offsetHeight;

      filterCtrl.phase = 'entering';
      const enterWait = [];
      if (!RM) {
        entering.forEach((t) => {
          enterWait.push(animateOpacity(t, 0.001, 1, TIMING.filterEnterIndex || 100).then(() => {
            t.style.opacity = '';
          }));
        });
      } else {
        entering.forEach((t) => {
          t.style.opacity = '';
        });
      }
      filterCtrl.animCount = enterWait.length;
      onDbg && onDbg();
      if (enterWait.length) await Promise.allSettled(enterWait);
      finishFilter(gen, sy0, tiles);
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

  async function transitionFilterVisual(sec, gen, prev) {
    const toSector = sec !== 'all';
    const fromSector = prev !== 'all' && document.body.classList.contains('filtered');

    if (fromSector && toSector) return transitionSectorQuery(sec, gen);
    if (!fromSector && toSector) return transitionAllToSector(sec, gen);
    if (fromSector && !toSector) return transitionSectorToAll(gen);
    /* all → all */
    applyFilterLayout('all');
  }

  async function transitionFilter(sec, gen, prev) {
    if (document.body.classList.contains('x')) return transitionFilterIndex(sec, gen);
    return transitionFilterVisual(sec, gen, prev);
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

    const prev = world.sector;
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
    transitionFilter(sec, gen, prev);
  }

  function buildTiles() {
    ensureSectorSlots();
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
    /* Slots after tiles in DOM; shown only when filtered Visual */
    slots.forEach((s) => grid.appendChild(s));
    sweep(grid);
    if (!document.body.classList.contains('filtered') && document.body.classList.contains('g')) {
      applyAllLayout(grid, world.allVariant || 1);
    }
  }

  function bindFilters() {
    document.querySelectorAll('#filters .fbtn').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.f)));
    addEventListener('resize', () => {
      if (document.body.classList.contains('x')) syncIndexFieldMin();
      else if (!document.body.classList.contains('filtered') && document.body.classList.contains('g')) {
        applyAllLayout(grid, world.allVariant || 1);
      }
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
    syncSectorCanvas,
    applyAllLayout: () => applyAllLayout(grid, world.allVariant || 1),
    SECTOR_SLOT_COUNT,
  };
}
