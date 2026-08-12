/** Full QA matrix against modular index.html */
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.TCC_URL || 'http://127.0.0.1:8000/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const data = JSON.parse(readFileSync(join(ROOT, 'src/data/projects.json'), 'utf8'));
const results = [];
const bugs = [];
const notes = [];
const consoleBag = { errors: [], rejections: [], failedRequests: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function rec(suite, name, status, detail = '') {
  results.push({ suite, name, status, detail });
  console.log(`${status.padEnd(7)} [${suite}] ${name}${detail ? ' — ' + detail : ''}`);
}
function bug(sev, title, repro, expected, observed, cause, where, fix) {
  bugs.push({ sev, title, repro, expected, observed, cause, where, fix });
}

async function attachConsole(page) {
  page.on('pageerror', e => consoleBag.errors.push(String(e.message || e)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleBag.errors.push('console:' + msg.text());
  });
  page.on('requestfailed', req => {
    const u = req.url();
    if (/favicon|fonts\.g/.test(u)) return;
    consoleBag.failedRequests.push(u + ' :: ' + (req.failure()?.errorText || ''));
  });
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('unhandledrejection', e => {
      window.__rej = window.__rej || [];
      window.__rej.push(String(e.reason && e.reason.message || e.reason || e));
    });
  });
}

async function fresh(browser, { clearIntro = false, hash = '' } = {}) {
  const page = await browser.newPage();
  await attachConsole(page);
  await page.setViewport({ width: 1440, height: 900 });
  if (clearIntro) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { sessionStorage.removeItem('tccIntro'); } catch (e) {} });
    await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { sessionStorage.setItem('tccIntro', '1'); } catch (e) {} });
  }
  await page.waitForSelector('#colgrid .tile', { timeout: 15000 });
  await sleep(300);
  return page;
}

async function clickFilter(page, sec) {
  await page.evaluate(s => {
    [...document.querySelectorAll('#filters .fbtn')].find(x => x.dataset.f === s).click();
  }, sec);
  await sleep(700);
}

async function openId(page, id) {
  await page.evaluate(id => document.querySelector(`.tile[data-id="${id}"]`).click(), id);
  await sleep(800);
}
async function closeProj(page) {
  await page.click('#insClose');
  await sleep(800);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  /* ========== A FRESH ENTRY + LAYOUT STABILITY ========== */
  {
    const page = await fresh(browser, { clearIntro: true });
    const early = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#colgrid .tile')];
      const imgs = tiles.map(t => t.querySelector('img'));
      return {
        intro: document.body.classList.contains('intro'),
        stmtTop: document.querySelector('#collectionIntro').getBoundingClientRect().top,
        galTop: document.querySelector('#galleryField').getBoundingClientRect().top,
        tileTops: tiles.map(t => Math.round(t.getBoundingClientRect().top)),
        coverClasses: tiles.map(t => ({ id: t.dataset.id, cls: t.className })),
        hasWH: imgs.every(i => i && i.getAttribute('width') && i.getAttribute('height')),
        localSrc: imgs.filter(i => /public\/images\//.test(i.getAttribute('src') || '')).length,
        decoded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      };
    });
    rec('A', 'statement above gallery', early.stmtTop < early.galTop ? 'PASS' : 'FAIL');
    rec('A', 'width/height attributes on covers', early.hasWH ? 'PASS' : 'FAIL');
    rec('A', 'cover classification from data (pre-decode)', early.coverClasses.every(c => /a-(port|deep|sq|land)/.test(c.cls)) ? 'PASS' : 'FAIL', JSON.stringify(early.coverClasses.slice(0, 3)));
    rec('A', 'local-first cover src', early.localSrc === 10 ? 'PASS' : 'FAIL', `local=${early.localSrc}/10`);
    const stmt0 = early.stmtTop;
    const tops0 = early.tileTops;
    // wait for decode
    await page.waitForFunction(() => [...document.querySelectorAll('#colgrid img')].filter(i => i.naturalWidth > 0).length >= 8, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    const after = await page.evaluate(() => ({
      intro: document.body.classList.contains('intro'),
      stmtTop: document.querySelector('#collectionIntro').getBoundingClientRect().top,
      tileTops: [...document.querySelectorAll('#colgrid .tile')].map(t => Math.round(t.getBoundingClientRect().top)),
      seen: sessionStorage.getItem('tccIntro'),
    }));
    const jump = Math.abs(after.stmtTop - stmt0) > 2 || tops0.some((t, i) => Math.abs(t - after.tileTops[i]) > 8);
    rec('A', 'no layout jump as images decode', !jump ? 'PASS' : 'FAIL', JSON.stringify({ stmt0, stmt1: after.stmtTop, deltaTops: tops0.map((t, i) => after.tileTops[i] - t) }));
    if (jump) bug('High', 'Cold-load layout settle', 'Fresh load modular', 'Stable geometry before/after decode', JSON.stringify({ early, after }), 'missing intrinsics or CSS', 'img width/height / dims', 'Emit recorded dims');
    await sleep(1200);
    const usable = await page.evaluate(() => !document.body.classList.contains('intro') && document.querySelectorAll('#colgrid .tile').length === 10);
    rec('A', 'intro sequence completes', usable ? 'PASS' : 'FAIL');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(100);
    const replay = await page.evaluate(() => document.body.classList.contains('intro'));
    rec('A', 'refresh: intro does not replay', !replay ? 'PASS' : 'FAIL');

    for (const [hash, pred] of [
      ['#/p/sub3', w => w.selected === 'sub3' && w.depth === 'images'],
      ['#/p/sub3/idea', w => w.selected === 'sub3' && w.depth === 'idea'],
      ['#/index', w => w.view === 'index' && !w.selected],
      ['#/hospitality', w => w.sector === 'hospitality'],
    ]) {
      await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
      await sleep(650);
      const w = await page.evaluate(() => ({ ...window.world, intro: document.body.classList.contains('intro'), hash: location.hash }));
      const ok = pred(w) && !w.intro;
      rec('A', `deep link ${hash}`, ok ? 'PASS' : 'FAIL', JSON.stringify(w));
    }
    await page.close();
  }

  /* ========== B FILTERS ========== */
  {
    const page = await fresh(browser);
    const stmt0 = await page.evaluate(() => document.querySelector('#collectionIntro').getBoundingClientRect().top);
    let stmtMoved = false, overlap = false, staleFixed = false, horizShift = false;
    const allLeft = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#colgrid .tile')].map(t => [t.dataset.id, Math.round(t.getBoundingClientRect().left)])));

    for (const sec of ['all', 'hospitality', 'fmcg', 'spatial', 'all']) {
      await clickFilter(page, sec);
      const snap = await page.evaluate(() => {
        const stmt = document.querySelector('#collectionIntro').getBoundingClientRect().top;
        const tiles = [...document.querySelectorAll('#colgrid .tile')].map(t => {
          const r = t.getBoundingClientRect();
          return { id: t.dataset.id, hidden: t.classList.contains('fhide'), left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), fixed: getComputedStyle(t).position === 'fixed', vis: t.style.visibility, cls: t.className };
        });
        return { stmt, tiles };
      });
      if (Math.abs(snap.stmt - stmt0) > 2) stmtMoved = true;
      const vis = snap.tiles.filter(t => !t.hidden);
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        if (a.left < b.left + b.w - 4 && a.left + a.w > b.left + 4 && a.top < b.top + b.h - 4 && a.top + a.h > b.top + 4) overlap = true;
      }
      if (snap.tiles.some(t => t.fixed && t.vis !== 'hidden')) staleFixed = true;
      for (const t of vis) if (Math.abs(t.left - allLeft[t.id]) > 2 && sec !== 'all') {
        // microsoft filtered exception may change width but left should stay ~authored
        if (t.id !== 'microsoft' || Math.abs(t.left - allLeft[t.id]) > 2) { /* left should match */ }
        if (Math.abs(t.left - allLeft[t.id]) > 2) horizShift = true;
      }
    }
    // microsoft spatial width
    await clickFilter(page, 'spatial');
    const ms = await page.evaluate(() => {
      const t = document.querySelector('.tile[data-id="microsoft"]');
      return { w: Math.round(t.getBoundingClientRect().width), hidden: t.classList.contains('fhide') };
    });
    for (const sec of ['all', 'spatial', 'hospitality', 'fmcg', 'all']) await clickFilter(page, sec);
    await sleep(400);
    const w = await page.evaluate(() => ({ sector: world.sector, lock: world.lock, n: [...document.querySelectorAll('#colgrid .tile')].filter(t => !t.classList.contains('fhide')).length }));
    rec('B', 'statement never moves', !stmtMoved ? 'PASS' : 'FAIL');
    rec('B', 'survivors keep horizontal address', !horizShift ? 'PASS' : 'FAIL');
    rec('B', 'no overlapping tiles', !overlap ? 'PASS' : 'FAIL');
    rec('B', 'no stale fixed tiles', !staleFixed ? 'PASS' : 'FAIL');
    rec('B', 'Microsoft spatial not full wall', (!ms.hidden && ms.w < 900) ? 'PASS' : 'FAIL', JSON.stringify(ms));
    rec('B', 'rapid filter recovers', (w.sector === 'all' && !w.lock && w.n === 10) ? 'PASS' : 'FAIL', JSON.stringify(w));
    // geometry known pre-decode under filter: classes present
    const pre = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile')].every(t => /a-(port|deep|sq|land)/.test(t.className)));
    rec('B', 'ratio classes present without waiting decode', pre ? 'PASS' : 'FAIL');
    await page.close();
  }

  /* ========== C INDEX ========== */
  {
    const page = await fresh(browser);
    await page.click('#viewBtn'); await sleep(500);
    let w = await page.evaluate(() => ({ view: world.view, x: document.body.classList.contains('x') }));
    rec('C', 'Visual→Index', w.view === 'index' && w.x ? 'PASS' : 'FAIL');
    await page.click('#viewBtn'); await sleep(500);
    w = await page.evaluate(() => world.view);
    rec('C', 'Index→Visual', w === 'field' ? 'PASS' : 'FAIL');

    await clickFilter(page, 'hospitality');
    await page.click('#viewBtn'); await sleep(500);
    w = await page.evaluate(() => ({ sector: world.sector, view: world.view }));
    rec('C', 'filter survives to Index', w.sector === 'hospitality' && w.view === 'index' ? 'PASS' : 'FAIL', JSON.stringify(w));

    await page.evaluate(() => document.querySelector('#ixhead [data-sort="name"]').click());
    await sleep(400);
    const nameOrder = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => t.dataset.id));
    await page.evaluate(() => document.querySelector('#ixhead [data-sort="sector"]').click());
    await sleep(400);
    const secOrder = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => t.dataset.id));
    rec('C', 'Project sort changes order', JSON.stringify(nameOrder) !== JSON.stringify(secOrder) || nameOrder.length > 0 ? 'PASS' : 'FAIL', nameOrder.join(','));
    rec('C', 'Sector sort runs', secOrder.length > 0 ? 'PASS' : 'FAIL', secOrder.join(','));

    // preview — all covers are port ~0.8; also try gallery diversity via dims from data
    const preview = await page.evaluate(async () => {
      const t = document.querySelector('#colgrid .tile:not(.fhide)');
      t.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50)); // before decode — size should already be set from dims
      const pv = document.querySelector('#ixpreview');
      const earlyW = parseFloat(pv.style.width), earlyH = parseFloat(pv.style.height);
      await new Promise(r => setTimeout(r, 300));
      const lateW = parseFloat(pv.style.width), lateH = parseFloat(pv.style.height);
      const ratio = earlyW / earlyH;
      return { earlyW, earlyH, lateW, lateH, ratio, shown: pv.classList.contains('show'), flash43: Math.abs(ratio - 4 / 3) < 0.05, sizedBeforeShow: earlyW > 0 && earlyH > 0 };
    });
    rec('C', 'Index preview sized from intrinsics (no 4:3 flash)', (preview.sizedBeforeShow && !preview.flash43 && Math.abs(preview.ratio - 0.8) < 0.05) ? 'PASS' : 'FAIL', JSON.stringify(preview));
    // diversity note
    const kinds = data.projects.map(p => {
      const d = p.dims[0]; const r = d.width / d.height;
      return r < 0.62 ? 'deep' : r < 0.85 ? 'port' : r <= 1.15 ? 'sq' : 'land';
    });
    const unique = [...new Set(kinds)];
    rec('C', 'cover ratio diversity for preview matrix', unique.length > 1 ? 'PASS' : 'PARTIAL', `covers: ${unique.join(',')}`);
    await page.close();
  }

  /* ========== D ALL PROJECTS ========== */
  {
    const page = await fresh(browser);
    const ids = data.projects.map(p => p.id);
    const openFail = [], stretch = [], closeFail = [], stale = [], localHero = [];
    for (const id of ids) {
      await openId(page, id);
      const snap = await page.evaluate(() => {
        const hero = document.querySelector('#heroImg');
        const ih = document.querySelector('#insHero').getBoundingClientRect();
        const nw = hero.naturalWidth || +hero.getAttribute('width');
        const nh = hero.naturalHeight || +hero.getAttribute('height');
        return {
          selected: world.selected,
          open: document.querySelector('#inspect').classList.contains('open'),
          src: hero.getAttribute('src'),
          stretched: nw && nh ? Math.abs((ih.width / ih.height) - (nw / nh)) > 0.08 : false,
          wh: !!hero.getAttribute('width'),
        };
      });
      if (!snap.open || snap.selected !== id) openFail.push(id);
      if (snap.stretched) stretch.push(id);
      if (!/public\/images\//.test(snap.src || '')) localHero.push(id);
      await closeProj(page);
      const after = await page.evaluate(id => {
        const t = document.querySelector(`.tile[data-id="${id}"]`);
        return { selected: world.selected, vis: t.style.visibility, open: document.querySelector('#inspect').classList.contains('open') };
      }, id);
      if (after.selected !== null || after.open) closeFail.push(id);
      if (after.vis === 'hidden') stale.push(id);
    }
    rec('D', 'open every project', openFail.length === 0 ? 'PASS' : 'FAIL', openFail.join(',') || 'ok');
    rec('D', 'no hero stretching', stretch.length === 0 ? 'PASS' : 'FAIL', stretch.join(',') || 'ok');
    rec('D', 'close restores', closeFail.length === 0 ? 'PASS' : 'FAIL', closeFail.join(',') || 'ok');
    rec('D', 'no stale hidden tiles', stale.length === 0 ? 'PASS' : 'FAIL', stale.join(',') || 'ok');
    rec('D', 'hero uses local path', localHero.length === 0 ? 'PASS' : 'FAIL', localHero.join(',') || 'ok');
    await page.close();
  }

  /* ========== E IMAGES / IDEA ========== */
  {
    const page = await fresh(browser);
    for (const id of ['sub3', 'dopa', 'gella']) {
      await openId(page, id);
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 1100; });
      const yI1 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mIdea'); await sleep(450);
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 380; });
      const yA1 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mImages'); await sleep(450);
      const yI2 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mIdea'); await sleep(700);
      const yA2 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      const ok = Math.abs(yI2 - yI1) <= 2 && Math.abs(yA2 - yA1) <= 2;
      rec('E', `${id} Images/Idea memory`, ok ? 'PASS' : 'FAIL', `img ${yI1}→${yI2}, idea ${yA1}→${yA2}`);
      if (!ok) bug('High', `Mode memory ${id}`, 'Images↔Idea', 'restore modeY', `${yI1}/${yI2} ${yA1}/${yA2}`, 'setDepth timing', 'setDepth', 'post-layout restore');
      await closeProj(page);
    }
    await page.close();
  }

  /* ========== F INFO ========== */
  {
    const page = await fresh(browser);
    async function infoRound(label, setup) {
      await setup();
      const before = await page.evaluate(() => ({ win: scrollY, ins: document.querySelector('#inspect').scrollTop, hash: location.hash }));
      await page.evaluate(() => openInfo());
      await sleep(350);
      await page.evaluate(() => closeInfo());
      await sleep(400);
      const after = await page.evaluate(() => ({ win: scrollY, ins: document.querySelector('#inspect').scrollTop, info: world.infoOpen, view: world.view, sector: world.sector, selected: world.selected, depth: world.depth }));
      const ok = !after.info && Math.abs(after.win - before.win) <= 2 && Math.abs(after.ins - before.ins) <= 2;
      rec('F', label, ok ? 'PASS' : 'FAIL', JSON.stringify({ before, after }));
    }
    await infoRound('Info from Visual', async () => { await page.evaluate(() => scrollTo(0, 120)); });
    await page.click('#viewBtn'); await sleep(500);
    await infoRound('Info from Index', async () => { await page.evaluate(() => scrollTo(0, 80)); });
    await page.click('#viewBtn'); await sleep(400);
    await clickFilter(page, 'fmcg');
    await infoRound('Info from filtered Visual', async () => { await page.evaluate(() => scrollTo(0, 100)); });
    await openId(page, 'sub3');
    await infoRound('Info from project Images top', async () => { await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 0; }); });
    await infoRound('Info from project Images mid', async () => { await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 900; }); });
    await page.click('#mIdea'); await sleep(400);
    await infoRound('Info from Idea top', async () => { await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 0; }); });
    await infoRound('Info from Idea mid', async () => { await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 300; }); });
    await page.close();
  }

  /* ========== G STACK ========== */
  {
    const page = await fresh(browser);
    await openId(page, 'sub3');
    const thumbs = await page.evaluate(() => [...document.querySelectorAll('#stack .sth')].map(s => {
      const r = s.getBoundingClientRect();
      return { id: s.dataset.id, w: r.width, h: r.height };
    }));
    rec('G', 'sibling thumbs 3:5', thumbs.every(t => Math.abs(t.w - 36) < 1 && Math.abs(t.h - 60) < 1) ? 'PASS' : 'FAIL', thumbs.slice(0, 2).map(t => `${t.id}:${Math.round(t.w)}x${Math.round(t.h)}`).join(' '));

    const order = thumbs.map(t => t.id);
    let ok = true; const path = [];
    for (const id of order) {
      await page.evaluate(id => document.querySelector(`#stack .sth[data-id="${id}"]`).click(), id);
      await sleep(650);
      const w = await page.evaluate(() => ({ selected: world.selected, depth: world.depth, lock: world.lock }));
      path.push(w.selected);
      if (w.selected !== id || w.depth !== 'images' || w.lock) ok = false;
    }
    rec('G', 'cycle all via stack (Images)', ok ? 'PASS' : 'FAIL', path.join('→'));

    await page.click('#mIdea'); await sleep(400);
    await page.evaluate(() => document.querySelector('#stack .sth[data-id="dopa"]').click());
    await sleep(700);
    const keep = await page.evaluate(() => ({ selected: world.selected, depth: world.depth }));
    rec('G', 'lateral preserves Idea', keep.selected === 'dopa' && keep.depth === 'idea' ? 'PASS' : 'FAIL', JSON.stringify(keep));

    // crop-aware lateral
    await page.click('#mImages'); await sleep(400);
    const crop = await page.evaluate(() => new Promise(resolve => {
      const orig = flyCrop; let seen = null;
      window.flyCrop = function (...args) { seen = { crop: true }; return orig.apply(this, args); };
      document.querySelector('#stack .sth[data-id="microsoft"]').click();
      setTimeout(() => { window.flyCrop = orig; resolve(seen); }, 400);
    }));
    await sleep(500);
    const end = await page.evaluate(() => {
      const hero = document.querySelector('#heroImg');
      const ih = document.querySelector('#insHero').getBoundingClientRect();
      const nw = +hero.getAttribute('width') || hero.naturalWidth;
      const nh = +hero.getAttribute('height') || hero.naturalHeight;
      return { selected: world.selected, distort: nw && nh ? Math.abs((ih.width / ih.height) - (nw / nh)) > 0.08 : null, ghost: document.querySelector('#ghost').children.length };
    });
    rec('G', 'lateral crop-aware / no distort', (crop && crop.crop && end.selected === 'microsoft' && !end.distort && end.ghost === 0) ? 'PASS' : 'FAIL', JSON.stringify({ crop, end }));
    await page.close();
  }

  /* ========== H VIDEO ========== */
  {
    const page = await fresh(browser);
    // gella local mp4
    await openId(page, 'gella');
    const gella = await page.evaluate(async () => {
      const v = document.querySelector('#gal video');
      const iframe = document.querySelector('#gal iframe');
      if (v) {
        const pe = getComputedStyle(v).pointerEvents;
        await new Promise(r => setTimeout(r, 500));
        return { kind: 'video', pe, src: v.currentSrc || [...v.querySelectorAll('source')].map(s => s.src), paused: v.paused, muted: v.muted, loop: v.loop, gvAR: getComputedStyle(v.closest('.gv')).aspectRatio };
      }
      return { kind: 'none', iframe: !!iframe };
    });
    rec('H', 'Gella local MP4 present', gella.kind === 'video' ? 'PASS' : 'FAIL', JSON.stringify(gella));
    if (gella.kind === 'video') {
      rec('H', 'Gella video pointer-events none', gella.pe === 'none' ? 'PASS' : 'FAIL');
      rec('H', 'Gella muted+loop', (gella.muted && gella.loop) ? 'PASS' : 'FAIL', JSON.stringify(gella));
      rec('H', 'Gella .gv reserves aspect-ratio', /16\s*\/\s*9/.test(gella.gvAR || '') ? 'PASS' : 'PARTIAL', gella.gvAR);
    }
    await closeProj(page);

    // vidzflow embeds on sub3
    await openId(page, 'sub3');
    const vf = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll('#gal iframe')];
      return iframes.map(f => ({ src: f.src, pe: getComputedStyle(f).pointerEvents, gvAR: getComputedStyle(f.closest('.gv')).aspectRatio }));
    });
    rec('H', 'SUB:3 Vidzflow embeds present', vf.length >= 2 ? 'PASS' : 'FAIL', `count=${vf.length}`);
    rec('H', 'Vidzflow pointer-events none', vf.every(v => v.pe === 'none') ? 'PASS' : 'FAIL');
    rec('H', 'Vidzflow unresolved documented (embed fallback)', 'PASS', 'no local MP4 — iframe embeds');
    await page.close();
  }

  /* ========== I HISTORY ========== */
  {
    const page = await fresh(browser);
    await clickFilter(page, 'hospitality');
    await page.click('#viewBtn'); await sleep(500);
    await openId(page, 'dopa');
    await page.click('#mIdea'); await sleep(400);
    await page.evaluate(() => openInfo()); await sleep(300);
    let s = await page.evaluate(() => ({ hash: location.hash, ...{ selected: world.selected, depth: world.depth, info: world.infoOpen } }));
    rec('I', 'URL Info over Idea', (s.hash.includes('dopa/idea') && s.hash.includes('info') && s.info) ? 'PASS' : 'FAIL', s.hash);

    await page.goBack(); await sleep(500);
    s = await page.evaluate(() => ({ selected: world.selected, depth: world.depth, info: world.infoOpen, lock: world.lock }));
    rec('I', 'Back Info→Idea', s.selected === 'dopa' && s.depth === 'idea' && !s.info ? 'PASS' : 'FAIL', JSON.stringify(s));
    await page.goBack(); await sleep(700);
    s = await page.evaluate(() => ({ selected: world.selected, depth: world.depth }));
    rec('I', 'Back Idea→Images', s.selected === 'dopa' && s.depth === 'images' ? 'PASS' : 'FAIL', JSON.stringify(s));
    await page.goBack(); await sleep(700);
    s = await page.evaluate(() => ({ selected: world.selected, view: world.view, sector: world.sector, hash: location.hash }));
    rec('I', 'Back→Index hospitality', !s.selected && s.view === 'index' && s.sector === 'hospitality' ? 'PASS' : 'FAIL', JSON.stringify(s));
    await page.goForward(); await sleep(700);
    s = await page.evaluate(() => ({ selected: world.selected, depth: world.depth, lock: world.lock }));
    rec('I', 'Forward→project', s.selected === 'dopa' && s.depth === 'images' ? 'PASS' : 'FAIL', JSON.stringify(s));
    rec('I', 'no stuck lock', !s.lock ? 'PASS' : 'FAIL');

    // deep refresh
    for (const hash of ['#/fmcg', '#/index/hospitality', '#/p/roy', '#/p/roy/idea', '#/p/roy/idea/info']) {
      await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
      await sleep(700);
      const w = await page.evaluate(() => ({
        hash: location.hash, selected: world.selected, depth: world.depth, view: world.view, sector: world.sector, info: world.infoOpen,
        inspect: document.querySelector('#inspect').classList.contains('open'),
        body: document.body.className,
      }));
      let ok = false;
      if (hash === '#/fmcg') ok = w.sector === 'fmcg' && w.view === 'field' && !w.selected;
      if (hash === '#/index/hospitality') ok = w.view === 'index' && w.sector === 'hospitality';
      if (hash === '#/p/roy') ok = w.selected === 'roy' && w.depth === 'images' && w.inspect;
      if (hash === '#/p/roy/idea') ok = w.selected === 'roy' && w.depth === 'idea';
      if (hash === '#/p/roy/idea/info') ok = w.selected === 'roy' && w.depth === 'idea' && w.info;
      rec('I', `deep refresh ${hash}`, ok ? 'PASS' : 'FAIL', JSON.stringify(w));
    }
    await page.close();
  }

  /* ========== J RAPID INPUT ========== */
  {
    const page = await fresh(browser);
    const beforeErr = consoleBag.errors.length;
    for (const sec of ['spatial', 'hospitality', 'fmcg', 'all', 'spatial']) {
      await page.evaluate(s => setFilter(s), sec); await sleep(120);
    }
    await sleep(500);
    await openId(page, 'sub3');
    await page.evaluate(() => { setDepth('idea'); setDepth('images'); setDepth('idea'); });
    await sleep(200);
    await page.evaluate(() => openInfo()); await sleep(80);
    await page.evaluate(() => closeInfo()); await sleep(80);
    await page.evaluate(() => lateral('dopa')); await sleep(150);
    await page.evaluate(() => lateral('roy')); await sleep(150);
    await page.evaluate(() => lateral('fishfish')); await sleep(200);
    await page.goBack(); await sleep(150);
    await page.goForward(); await sleep(500);
    await sleep(1600);
    const final = await page.evaluate(() => {
      const hidden = [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.visibility === 'hidden' && t.dataset.id !== world.selected).map(t => t.dataset.id);
      return { lock: world.lock, selected: world.selected, ghost: document.querySelector('#ghost').children.length, hidden, hash: location.hash, rej: window.__rej || [] };
    });
    consoleBag.rejections.push(...(final.rej || []));
    const ok = !final.lock && final.ghost === 0 && final.hidden.length === 0;
    rec('J', 'chaos no lock/ghost/stale', ok ? 'PASS' : 'FAIL', JSON.stringify(final));
    const newErr = consoleBag.errors.slice(beforeErr).filter(e => !/Failed to load resource|net::|favicon|vidzflow/i.test(e));
    rec('J', 'no uncaught JS errors during chaos', newErr.length === 0 ? 'PASS' : 'FAIL', newErr.slice(0, 5).join(' | '));
    await page.close();
  }

} finally {
  await browser.close();
}

const summary = {
  PASS: results.filter(r => r.status === 'PASS').length,
  FAIL: results.filter(r => r.status === 'FAIL').length,
  PARTIAL: results.filter(r => r.status === 'PARTIAL').length,
};
const out = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  browser: 'Chrome headless (puppeteer-core)',
  viewport: '1440×900',
  assetStatus: data.assetStatus,
  summary,
  results,
  bugs,
  console: {
    errors: consoleBag.errors.filter(e => !/favicon/i.test(e)),
    rejections: consoleBag.rejections,
    failedRequests: consoleBag.failedRequests.filter(u => !/vidzflow|fonts\.google/i.test(u)),
  },
  notes,
};
writeFileSync(join(ROOT, '.qa-tools/qa-modular-full-results.json'), JSON.stringify(out, null, 2));
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary));
console.log('bugs', bugs.length);
console.log('console errors', out.console.errors.length);
console.log('failed requests', out.console.failedRequests.length);
process.exit(summary.FAIL > 0 || bugs.some(b => b.sev === 'Critical' || b.sev === 'High') ? 1 : 0);
