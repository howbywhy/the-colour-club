/** Phase 04 — filter feel + responsive QA across viewports. */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'mobile-small', w: 375, h: 667 },
  { name: 'mobile-modern', w: 390, h: 844 },
  { name: 'mobile-large', w: 430, h: 932 },
  { name: 'tablet-portrait', w: 768, h: 1024 },
  { name: 'tablet-landscape', w: 1024, h: 768 },
  { name: 'desktop-1180', w: 1180, h: 800 },
  { name: 'desktop-1440', w: 1440, h: 900 },
];

function rec(suite, name, status, detail = '') {
  return { suite, name, status, detail };
}

async function prep(page, hash = '') {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('about:blank');
  await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('tccIntro', '1'); } catch (e) {} });
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#colgrid .tile', { timeout: 15000 });
  await page.evaluate(() => { document.body.classList.remove('intro'); });
  await sleep(200);
  return errors;
}

async function waitFilterIdle(page) {
  await page.waitForFunction(() => filterCtrl.phase === 'idle' && !world.lock, { timeout: 4000 }).catch(() => {});
}

async function runViewport(browser, vp) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.w < 768, hasTouch: vp.w < 1024 });
  const results = [];
  const bugs = [];
  const consoleErrors = await prep(page);

  const isMobile = vp.w <= 767;
  const isTablet = vp.w > 767 && vp.w < 1180;

  /* --- OVERFLOW --- */
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    body: document.body.scrollWidth > document.documentElement.clientWidth + 1,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  results.push(rec('OVERFLOW', 'no horizontal scrollbar', !overflow.doc && !overflow.body ? 'PASS' : 'FAIL', JSON.stringify(overflow)));

  /* --- COLLECTION --- */
  const col = await page.evaluate(() => {
    const stmt = document.querySelector('#linecell h1');
    const tiles = [...document.querySelectorAll('#colgrid .tile')];
    const chrome = document.querySelector('#chrome').getBoundingClientRect();
    const right = document.querySelector('#chrome .right');
    const clockHidden = !right || getComputedStyle(right).display === 'none';
    return {
      tileN: tiles.length,
      stmtH: stmt.getBoundingClientRect().height,
      chromeH: Math.round(chrome.height),
      clockHidden,
      brand: document.querySelector('#brandBtn').textContent,
      filtersVisible: [...document.querySelectorAll('#filters .fbtn')].every(b => b.getBoundingClientRect().height > 0),
    };
  });
  results.push(rec('COLLECTION', 'tiles present', col.tileN === 10 ? 'PASS' : 'FAIL', `n=${col.tileN}`));
  results.push(rec('COLLECTION', 'statement present', col.stmtH > 20 ? 'PASS' : 'FAIL', `h=${col.stmtH}`));
  if (isMobile) {
    results.push(rec('COLLECTION', 'chrome not dominating', col.chromeH < vp.h * 0.28 ? 'PASS' : 'PARTIAL', `chromeH=${col.chromeH}`));
    results.push(rec('COLLECTION', 'utilities demoted', col.clockHidden ? 'PASS' : 'FAIL'));
  }

  /* --- FILTERS --- */
  const stmt0 = await page.evaluate(() => document.querySelector('#collectionIntro').getBoundingClientRect().top);
  let filterOk = true, stmtMoved = false, lockStuck = false, filterDetail = [];
  for (const sec of ['hospitality', 'fmcg', 'spatial', 'all']) {
    await page.evaluate(s => setFilter(s), sec);
    await waitFilterIdle(page);
    await sleep(40);
    const snap = await page.evaluate(() => ({
      sector: world.sector,
      lock: world.lock,
      phase: filterCtrl.phase,
      stmt: document.querySelector('#collectionIntro').getBoundingClientRect().top,
      visible: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].length,
      stuckOp: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].filter(t => parseFloat(getComputedStyle(t).opacity) < 0.2).map(t => t.dataset.id),
      hash: location.hash,
    }));
    const reasons = [];
    if (snap.sector !== sec) reasons.push('sector=' + snap.sector);
    if (snap.phase !== 'idle') reasons.push('phase=' + snap.phase);
    if (snap.lock) reasons.push('lock');
    if (snap.stuckOp.length) reasons.push('stuck:' + snap.stuckOp.join(','));
    if (snap.visible === 0) reasons.push('blank');
    if (reasons.length) { filterOk = false; filterDetail.push(sec + ':' + reasons.join('|')); }
    if (Math.abs(snap.stmt - stmt0) > 1) stmtMoved = true;
    if (snap.lock) lockStuck = true;
  }
  results.push(rec('FILTERS', 'cycle sectors', filterOk ? 'PASS' : 'FAIL', filterDetail.join('; ')));
  results.push(rec('FILTERS', 'statement still', !stmtMoved ? 'PASS' : 'FAIL'));
  results.push(rec('FILTERS', 'no stuck lock', !lockStuck ? 'PASS' : 'FAIL'));

  /* rapid */
  for (let i = 0; i < 12; i++) {
    await page.evaluate(i => setFilter(['hospitality', 'fmcg', 'spatial', 'all'][i % 4]), i);
    await sleep(40);
  }
  await waitFilterIdle(page);
  const rapid = await page.evaluate(() => ({
    lock: world.lock, phase: filterCtrl.phase,
    ghost: document.querySelector('#ghost').children.length,
    bad: [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.visibility === 'hidden').length,
  }));
  results.push(rec('FILTERS', 'rapid recover', (!rapid.lock && rapid.phase === 'idle' && !rapid.ghost && !rapid.bad) ? 'PASS' : 'FAIL', JSON.stringify(rapid)));

  /* --- INDEX --- */
  await page.evaluate(() => { if (world.selected) closeProject(true); if (world.infoOpen) closeInfo(null, true); });
  await page.evaluate(() => setView('index', true));
  await sleep(200);
  const index = await page.evaluate((mobile) => {
    const preview = document.querySelector('#ixpreview');
    const previewShown = preview && getComputedStyle(preview).display !== 'none';
    const row = document.querySelector('#colgrid .tile');
    const r = row.getBoundingClientRect();
    return {
      view: world.view,
      x: document.body.classList.contains('x'),
      previewCssHidden: !previewShown,
      rowW: Math.round(r.width),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      nm: row.querySelector('.nm')?.textContent,
    };
  }, isMobile);
  results.push(rec('INDEX', 'Index view', index.view === 'index' && index.x ? 'PASS' : 'FAIL'));
  results.push(rec('INDEX', 'no overflow', !index.overflow ? 'PASS' : 'FAIL'));
  if (isMobile) {
    results.push(rec('INDEX', 'hover preview disabled', index.previewCssHidden ? 'PASS' : 'FAIL'));
  }
  /* open from index */
  await page.evaluate(() => document.querySelector('#colgrid .tile').click());
  await sleep(900);
  const opened = await page.evaluate(() => ({ selected: world.selected, open: document.querySelector('#inspect').classList.contains('open') }));
  results.push(rec('INDEX', 'tap/click opens project', opened.selected && opened.open ? 'PASS' : 'FAIL', JSON.stringify(opened)));

  /* --- PROJECT IMAGES --- */
  const proj = await page.evaluate(() => {
    const hero = document.querySelector('#insHero').getBoundingClientRect();
    const stack = document.querySelector('#stack');
    const sr = stack.getBoundingClientRect();
    const thumbs = [...document.querySelectorAll('#stack .sth')];
    const mode = document.querySelector('#modeCtl');
    return {
      heroW: Math.round(hero.width),
      heroH: Math.round(hero.height),
      stackShow: stack.classList.contains('show'),
      stackBottom: sr.bottom > innerHeight - 80,
      stackRight: sr.left > innerWidth * 0.7,
      thumbN: thumbs.length,
      thumbMin: thumbs.length ? Math.min(...thumbs.map(t => t.getBoundingClientRect().width)) : 0,
      modeVisible: mode && getComputedStyle(mode).display !== 'none',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  results.push(rec('PROJECT IMAGES', 'hero laid out', proj.heroW > 40 && proj.heroH > 40 ? 'PASS' : 'FAIL', JSON.stringify(proj)));
  results.push(rec('PROJECT IMAGES', 'no overflow', !proj.overflow ? 'PASS' : 'FAIL'));
  results.push(rec('PROJECT IMAGES', 'Images/Idea reachable', proj.modeVisible ? 'PASS' : 'FAIL'));
  if (isMobile) {
    results.push(rec('LATERAL NAV', 'bottom sibling rail', (proj.stackShow && proj.stackBottom && !proj.stackRight) ? 'PASS' : 'PARTIAL', JSON.stringify(proj)));
    results.push(rec('LATERAL NAV', 'touchable thumbs', proj.thumbMin >= 36 ? 'PASS' : 'FAIL', `minW=${proj.thumbMin}`));
  } else {
    results.push(rec('LATERAL NAV', 'desktop stack present', (proj.stackShow && proj.thumbN >= 8) ? 'PASS' : 'FAIL', JSON.stringify(proj)));
  }

  /* lateral */
  const latId = await page.evaluate(() => document.querySelector('#stack .sth')?.dataset.id);
  if (latId) {
    await page.evaluate(id => document.querySelector(`#stack .sth[data-id="${id}"]`).click(), latId);
    await sleep(700);
    const lat = await page.evaluate(id => ({ selected: world.selected, lock: world.lock, want: id }), latId);
    results.push(rec('LATERAL NAV', 'sibling switch', lat.selected === lat.want && !lat.lock ? 'PASS' : 'FAIL', JSON.stringify(lat)));
  }

  /* --- IDEA --- */
  await page.evaluate(() => setDepth('idea'));
  await sleep(500);
  const idea = await page.evaluate(() => {
    const lede = document.querySelector('#ideaLede');
    const beats = [...document.querySelectorAll('#beats .beat')];
    return {
      depth: world.depth,
      ideaClass: document.querySelector('#inspect').classList.contains('idea'),
      ledeH: lede ? lede.getBoundingClientRect().height : 0,
      beatN: beats.length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  results.push(rec('PROJECT IDEA', 'Idea mode', idea.depth === 'idea' && idea.ideaClass ? 'PASS' : 'FAIL'));
  results.push(rec('PROJECT IDEA', 'lede readable', idea.ledeH > 20 ? 'PASS' : 'PARTIAL', `h=${idea.ledeH}`));
  results.push(rec('PROJECT IDEA', 'no overflow', !idea.overflow ? 'PASS' : 'FAIL'));

  /* scroll memory */
  await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 200; });
  await page.evaluate(() => setDepth('images'));
  await sleep(400);
  await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 400; });
  await page.evaluate(() => setDepth('idea'));
  await sleep(700);
  const mem = await page.evaluate(() => Math.abs(document.querySelector('#inspect').scrollTop - 200) <= 4);
  results.push(rec('PROJECT IDEA', 'Images/Idea scroll memory', mem ? 'PASS' : 'FAIL'));

  /* --- INFO --- */
  await page.evaluate(() => openInfo());
  await sleep(350);
  const infoOpen = await page.evaluate(() => {
    const info = document.querySelector('#info');
    const r = info.getBoundingClientRect();
    return {
      open: world.infoOpen,
      w: Math.round(r.width),
      fullish: r.width >= innerWidth * 0.9,
      overflow: info.scrollWidth > info.clientWidth + 2,
    };
  });
  results.push(rec('INFO', 'opens', infoOpen.open ? 'PASS' : 'FAIL'));
  if (isMobile) results.push(rec('INFO', 'near full-screen', infoOpen.fullish ? 'PASS' : 'PARTIAL', `w=${infoOpen.w}`));
  await page.evaluate(() => closeInfo());
  await sleep(400);
  const infoClose = await page.evaluate(() => ({ open: world.infoOpen, depth: world.depth, selected: world.selected }));
  results.push(rec('INFO', 'close restores', (!infoClose.open && infoClose.selected && infoClose.depth === 'idea') ? 'PASS' : 'FAIL', JSON.stringify(infoClose)));

  /* --- VIDEO --- */
  await page.evaluate(() => { closeProject(true); openProject('gella', true); });
  await sleep(400);
  const video = await page.evaluate(() => {
    const v = document.querySelector('#gal video');
    const gv = v?.closest('.gv');
    return {
      has: !!v,
      pe: v ? getComputedStyle(v).pointerEvents : null,
      muted: v?.muted,
      ar: gv ? getComputedStyle(gv).aspectRatio : null,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  results.push(rec('VIDEO', 'Gella MP4 present', video.has ? 'PASS' : 'FAIL'));
  if (video.has) {
    results.push(rec('VIDEO', 'pointer-events none', video.pe === 'none' ? 'PASS' : 'FAIL'));
    results.push(rec('VIDEO', 'muted', video.muted ? 'PASS' : 'FAIL'));
    results.push(rec('VIDEO', 'no overflow', !video.overflow ? 'PASS' : 'FAIL'));
  }

  /* --- HISTORY --- */
  await page.evaluate(() => { closeProject(true); setView('field', true); setFilter('all', true); });
  /* Force a real document load — same-URL hash-only goto is unreliable in Puppeteer */
  await page.goto(BASE.split('#')[0] + '?r=' + Date.now() + '#/p/dopa/idea', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.world && document.querySelectorAll('#colgrid .tile').length === 10, { timeout: 15000 });
  await page.waitForFunction(() => world.selected === 'dopa' && world.depth === 'idea', { timeout: 8000 }).catch(() => {});
  await sleep(200);
  const deep = await page.evaluate(() => ({ selected: world.selected, depth: world.depth, hash: location.hash }));
  results.push(rec('HISTORY', 'deep link Idea', deep.selected === 'dopa' && deep.depth === 'idea' ? 'PASS' : 'FAIL', JSON.stringify(deep)));
  await page.goBack();
  await sleep(600);
  await page.waitForFunction(() => window.world, { timeout: 8000 }).catch(() => {});
  const back = await page.evaluate(() => ({ selected: world?.selected ?? null, lock: world?.lock ?? null, hash: location.hash }));
  results.push(rec('HISTORY', 'Back recovers', back.lock === false || back.lock === null ? 'PASS' : 'FAIL', JSON.stringify(back)));

  /* --- TOUCH TARGETS (mobile) --- */
  if (isMobile) {
    const targets = await page.evaluate(() => {
      const check = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { sel, h: Math.round(r.height), w: Math.round(r.width) };
      };
      return [check('#filters .fbtn'), check('#viewBtn'), check('#infoBtn')].filter(Boolean);
    });
    const ok = targets.every(t => t.h >= 32);
    results.push(rec('TOUCH TARGETS', 'primary controls ≥32px', ok ? 'PASS' : 'PARTIAL', JSON.stringify(targets)));
  }

  const errClean = consoleErrors.filter(e => !/favicon|vidzflow|File not found/i.test(e));
  results.push(rec('CONSOLE', 'no app errors', errClean.length === 0 ? 'PASS' : 'FAIL', errClean.slice(0, 3).join(' | ')));

  await page.close();
  return { viewport: vp, results, bugs, consoleErrors: errClean };
}

/* Desktop filter-feel regression at 1440 */
async function filterFeelCheck(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await prep(page);
  const feel = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    setFilter('all', true);
    await sleep(40);
    const before = Object.fromEntries([...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => {
      const r = t.getBoundingClientRect();
      return [t.dataset.id, { top: r.top, left: r.left }];
    }));
    let animated = 0, snappedLarge = 0, snappedTiny = 0;
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, opts) {
      const isFlip = keyframes && keyframes[0] && 'transform' in keyframes[0];
      if (isFlip && this.classList.contains('tile')) animated++;
      return orig.apply(this, arguments);
    };
    setFilter('hospitality');
    await new Promise(r => { const c = () => filterCtrl.phase === 'idle' && !world.lock ? r() : setTimeout(c, 16); c(); });
    Element.prototype.animate = orig;
    const after = Object.fromEntries([...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => {
      const r = t.getBoundingClientRect();
      return [t.dataset.id, { top: r.top, left: r.left }];
    }));
    for (const id of Object.keys(after)) {
      if (!before[id]) continue;
      const dist = Math.hypot(after[id].left - before[id].left, after[id].top - before[id].top);
      if (dist > 240) snappedLarge++;
      else if (dist > 0.5 && dist < 16) snappedTiny++;
    }
    return {
      animatedFlips: animated,
      snappedLarge,
      snappedTiny,
      timings: { leave: window.__no, /* probe via filter duration */ },
      durationHint: null,
      sector: world.sector,
      stmt: document.querySelector('#collectionIntro').getBoundingClientRect().top,
    };
  });
  await page.close();
  return feel;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const all = [];
let feel;
try {
  feel = await filterFeelCheck(browser);
  console.log('FILTER FEEL', JSON.stringify(feel));
  for (const vp of VIEWPORTS) {
    console.log('\n---', vp.name, `${vp.w}x${vp.h}`, '---');
    const r = await runViewport(browser, vp);
    all.push(r);
    const summary = {
      PASS: r.results.filter(x => x.status === 'PASS').length,
      FAIL: r.results.filter(x => x.status === 'FAIL').length,
      PARTIAL: r.results.filter(x => x.status === 'PARTIAL').length,
    };
    console.log(JSON.stringify(summary));
    r.results.filter(x => x.status !== 'PASS').forEach(x => console.log(' ', x.status, x.suite, x.name, x.detail));
  }

  /* orientation change */
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await prep(page);
  await page.evaluate(() => { setFilter('fmcg', true); openProject('sub3', true); setDepth('idea', true); });
  await sleep(300);
  const beforeOri = await page.evaluate(() => ({ ...world, hash: location.hash }));
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
  await sleep(400);
  const afterOri = await page.evaluate(() => ({
    selected: world.selected, depth: world.depth, sector: world.sector, infoOpen: world.infoOpen, lock: world.lock,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  const oriOk = afterOri.selected === 'sub3' && afterOri.depth === 'idea' && afterOri.sector === 'fmcg' && !afterOri.lock;
  console.log('\nORIENTATION', oriOk ? 'PASS' : 'FAIL', JSON.stringify({ beforeOri, afterOri }));
  all.push({
    viewport: { name: 'orientation-390p-to-land', w: 844, h: 390 },
    results: [rec('HISTORY', 'orientation preserves state', oriOk ? 'PASS' : 'FAIL', JSON.stringify(afterOri))],
    bugs: [],
    consoleErrors: [],
  });
  await page.close();
} finally {
  await browser.close();
}

const flat = all.flatMap(a => a.results.map(r => ({ viewport: a.viewport.name, ...r })));
const totals = {
  PASS: flat.filter(r => r.status === 'PASS').length,
  FAIL: flat.filter(r => r.status === 'FAIL').length,
  PARTIAL: flat.filter(r => r.status === 'PARTIAL').length,
};
const out = { generatedAt: new Date().toISOString(), filterFeel: feel, totals, viewports: all };
writeFileSync(join(ROOT, '.qa-tools/qa-responsive-results.json'), JSON.stringify(out, null, 2));
console.log('\n=== TOTALS ===', totals);
process.exit(totals.FAIL > 0 ? 1 : 0);
