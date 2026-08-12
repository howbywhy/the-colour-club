/** Shared motion timing — no imports; safe for state + motion layers. */
export const TIMING = {
  ease: 'cubic-bezier(.32,.94,.35,1)',
  /* Filter feel — quieter ease-out; not the project-open spring. */
  filterEase: 'cubic-bezier(.33,0,.15,1)',
  flip: 380,
  view: 420,
  filterLeave: 110,
  filterFlip: 220,
  /* Large compositional closes keep FLIP — duration eases out with distance. */
  filterFlipMax: 420,
  filterEnter: 90,
  /* Skip only imperceptible moves. No upper snap ceiling — mixed snap/FLIP
     across filter pairs was breaking parity with All↔Hospitality. */
  filterMoveMin: 16,
  /* Desktop: Infinity via nullish check in Collection; mobile forces 0 (fade-only). */
  filterMoveMax: 1e6,
  open: 430,
  closeFade: 180,
  close: 400,
  lateralFade: 160,
  lateral: 360,
  depth: 150,
  ideaRestore: 420,
  infoThen: 200,
  intro: 1350,
  brandDelay: 250,
  viewAfterClose: 650,
  hashDepth: 0,
  watchdog: 1500,
};
