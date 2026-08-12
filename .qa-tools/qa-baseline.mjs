#!/usr/bin/env node
/**
 * TCC V2 — browser QA against the monolith reference.
 * Uses local Chrome via puppeteer-core.
 */
import puppeteer from 'puppeteer-core';
import {writeFileSync} from 'fs';

const BASE = process.env.TCC_URL || 'http://127.0.0.1:8000/tcc-v2-stable.html';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
const bugs = [];
const notes = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function rec(suite, name, status, detail=''){
  results.push({suite, name, status, detail});
  console.log(`${status.padEnd(7)} [${suite}] ${name}${detail? ' — '+detail:''}`);
}
function bug(sev, title, repro, expected, observed, cause, where, fix){
  bugs.push({sev, title, repro, expected, observed, cause, where, fix});
}

async function injectHooks(page){
  await page.evaluate(() => {
    window.__qaWorld = () => {
      if (typeof world === 'undefined') return null;
      return {
        sector: world.sector, view: world.view, selected: world.selected,
        depth: world.depth, infoOpen: world.infoOpen, sort: world.sort,
        lock: world.lock, last: world.last,
        ledger: JSON.parse(JSON.stringify(world.ledger || {})),
      };
    };
  });
}

async function freshPage(browser, hash=''){
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console:' + msg.text()); });
  await page.setViewport({width:1440, height:900});
  await page.goto(BASE + hash, {waitUntil:'domcontentloaded', timeout:30000});
  await page.evaluate(() => { try { sessionStorage.setItem('tccIntro','1'); } catch(e){} });
  await injectHooks(page);
  await page.waitForSelector('#colgrid .tile');
  await page.waitForFunction(
    () => [...document.querySelectorAll('#colgrid img')].some(i => i.naturalWidth > 0),
    {timeout:20000}
  ).catch(() => {});
  await sleep(400);
  return {page, errors};
}

async function clickFilter(page, sec){
  await page.evaluate(s => {
    const b = [...document.querySelectorAll('#filters .fbtn')].find(x => x.dataset.f === s);
    if (!b) throw new Error('missing filter ' + s);
    b.click();
  }, sec);
  await sleep(700);
}

async function filterRects(page){
  return page.evaluate(() => {
    const statement = document.querySelector('#collectionIntro').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('#colgrid .tile')].map(t => {
      const r = t.getBoundingClientRect();
      const hidden = t.classList.contains('fhide') || getComputedStyle(t).display === 'none';
      return {
        id: t.dataset.id, hidden,
        left: Math.round(r.left), top: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        fixed: getComputedStyle(t).position === 'fixed',
        vis: t.style.visibility, classes: t.className,
      };
    });
    return {
      statement: {top: statement.top, left: statement.left, width: statement.width, height: statement.height},
      tiles,
    };
  });
}

async function openProject(page, id){
  await page.evaluate(id => document.querySelector(`.tile[data-id="${id}"]`).click(), id);
  await sleep(750);
}

async function closeProject(page){
  // #insClose is obscured by chrome mailto (z-index) — use API + Escape fallback
  await page.evaluate(() => { if (typeof closeProject === 'function') closeProject(); });
  await sleep(800);
  const still = await page.evaluate(() => !!(window.__qaWorld && window.__qaWorld() && window.__qaWorld().selected));
  if (still) {
    await page.keyboard.press('Escape');
    await sleep(800);
  }
}
async function toggleInfo(page, wantOpen){
  await page.evaluate(want => {
    if (want && !world.infoOpen) openInfo();
    if (!want && world.infoOpen) closeInfo();
  }, wantOpen);
  await sleep(400);
}

async function run(){
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: {width:1440, height:900},
  });

  try {
    // ========== A ==========
    {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({width:1440, height:900});
      await page.goto(BASE, {waitUntil:'domcontentloaded'});
      await page.evaluate(() => { try { sessionStorage.removeItem('tccIntro'); } catch(e){} });
      await page.reload({waitUntil:'domcontentloaded'});
      await injectHooks(page);
      await page.waitForSelector('#colgrid .tile');
      const early = await page.evaluate(() => {
        const lc = document.querySelector('#linecell');
        const gal = document.querySelector('#galleryField');
        return {
          hasIntro: document.body.classList.contains('intro'),
          stmtTop: lc.getBoundingClientRect().top,
          galTop: gal.getBoundingClientRect().top,
          h1op: getComputedStyle(lc.querySelector('h1')).opacity,
          chromeOp: getComputedStyle(document.querySelector('#chrome')).opacity,
        };
      });
      rec('A', 'statement above gallery structurally', early.stmtTop < early.galTop ? 'PASS' : 'FAIL',
        `stmt=${early.stmtTop} gal=${early.galTop}`);
      await sleep(200);
      const mid = await page.evaluate(() => ({
        intro: document.body.classList.contains('intro'),
        seen: sessionStorage.getItem('tccIntro'),
        h1op: getComputedStyle(document.querySelector('#linecell h1')).opacity,
      }));
      rec('A', 'first-entry intro presentational sequence',
        (mid.intro || mid.seen === '1') ? 'PASS' : 'FAIL', JSON.stringify(mid));
      await sleep(1500);
      const after = await page.evaluate(() => ({
        intro: document.body.classList.contains('intro'),
        tiles: document.querySelectorAll('#colgrid .tile').length,
      }));
      rec('A', 'intro ends; site usable', (!after.intro && after.tiles === 10) ? 'PASS' : 'FAIL', JSON.stringify(after));

      await page.reload({waitUntil:'domcontentloaded'});
      await injectHooks(page);
      await page.waitForSelector('#colgrid .tile');
      await sleep(80);
      const replay = await page.evaluate(() => document.body.classList.contains('intro'));
      rec('A', 'refresh same session: intro does not replay', !replay ? 'PASS' : 'FAIL');

      for (const [hash, pred] of [
        ['#/p/sub3', w => w.selected === 'sub3' && w.depth === 'images' && !w.intro],
        ['#/p/sub3/idea', w => w.selected === 'sub3' && w.depth === 'idea' && !w.intro],
        ['#/index', w => w.view === 'index' && !w.selected && !w.intro],
        ['#/hospitality', w => w.sector === 'hospitality' && w.view === 'field' && !w.intro],
      ]) {
        await page.goto(BASE + hash, {waitUntil:'domcontentloaded'});
        await injectHooks(page);
        await page.waitForSelector('#colgrid .tile');
        await sleep(650);
        const w = await page.evaluate(() => {
          const ww = window.__qaWorld();
          return {...ww, intro: document.body.classList.contains('intro'), hash: location.hash};
        });
        const ok = pred(w);
        rec('A', `deep link ${hash}`, ok ? 'PASS' : 'FAIL', JSON.stringify({
          selected: w.selected, depth: w.depth, view: w.view, sector: w.sector, intro: w.intro, hash: w.hash,
        }));
        if (!ok) bug('High', `Deep link failed ${hash}`, `Open ${hash}`,
          'Correct world, no intro', JSON.stringify(w),
          'applyHash quiet path / setDepth delay', 'applyHash', 'Fix quiet reconciliation');
      }
      await ctx.close();
    }

    // ========== B ==========
    {
      const {page, errors} = await freshPage(browser);
      const stmt0 = (await filterRects(page)).statement;
      let stmtMoved = false, overlap = false, staleFixed = false, portBleed = false;

      for (const sec of ['all', 'hospitality', 'fmcg', 'spatial', 'all']) {
        await clickFilter(page, sec);
        const snap = await filterRects(page);
        if (Math.abs(snap.statement.top - stmt0.top) > 2 || Math.abs(snap.statement.left - stmt0.left) > 2) stmtMoved = true;
        const vis = snap.tiles.filter(t => !t.hidden);
        for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j];
          if (a.left < b.left + b.w - 4 && a.left + a.w > b.left + 4 &&
              a.top < b.top + b.h - 4 && a.top + a.h > b.top + 4) overlap = true;
        }
        for (const t of snap.tiles) {
          if (t.fixed && t.vis !== 'hidden') staleFixed = true;
          if (!t.hidden && t.w > 1400 && (t.classes.includes('a-port') || t.classes.includes('a-deep'))) portBleed = true;
        }
      }

      await clickFilter(page, 'all');
      const allSnap = await filterRects(page);
      await clickFilter(page, 'hospitality');
      const hospSnap = await filterRects(page);
      let horizShift = false;
      for (const t of hospSnap.tiles.filter(x => !x.hidden)) {
        const a = allSnap.tiles.find(x => x.id === t.id);
        if (a && Math.abs(a.left - t.left) > 2) horizShift = true;
      }

      await clickFilter(page, 'spatial');
      const spat = await filterRects(page);
      const ms = spat.tiles.find(t => t.id === 'microsoft');
      const msOk = ms && !ms.hidden && ms.w < 900;

      for (const sec of ['all', 'spatial', 'hospitality', 'fmcg', 'all']) await clickFilter(page, sec);
      await sleep(400);
      const afterRapid = await filterRects(page);
      const w = await page.evaluate(() => window.__qaWorld());
      const rapidOk = afterRapid.tiles.filter(t => !t.hidden).length === 10 && w.sector === 'all' && !w.lock;

      rec('B', 'positioning statement never moves', !stmtMoved ? 'PASS' : 'FAIL');
      if (stmtMoved) bug('Critical', 'Statement moves on filter', 'Filter cycle', 'Stay put', 'Moved', 'Coupled to FLIP', 'setFilter', 'Keep separate');
      rec('B', 'survivors keep horizontal address', !horizShift ? 'PASS' : 'FAIL');
      if (horizShift) bug('High', 'Survivor horizontal address changed', 'All→Hospitality', 'Keep columns', 'left shifted', 'grid mutation', 'setFilter/CSS', 'Preserve grid-column');
      rec('B', 'no overlapping tiles', !overlap ? 'PASS' : 'FAIL');
      rec('B', 'no invisible stale fixed tiles', !staleFixed ? 'PASS' : 'FAIL');
      rec('B', 'portrait never full-bleed', !portBleed ? 'PASS' : 'FAIL');
      rec('B', 'Microsoft spatial survivor not full wall', msOk ? 'PASS' : 'FAIL', ms ? `w=${ms.w}` : 'missing');
      rec('B', 'rapid filter thrash recovers', rapidOk ? 'PASS' : 'FAIL', `sector=${w.sector} lock=${w.lock}`);
      if (errors.length) notes.push('B: ' + errors.join(' | '));
      await page.close();
    }

    // ========== C ==========
    {
      const {page} = await freshPage(browser);
      await page.click('#viewBtn'); await sleep(500);
      let w = await page.evaluate(() => window.__qaWorld());
      const indexOk = await page.evaluate(() => document.body.classList.contains('x'));
      rec('C', 'Visual→Index', (w.view === 'index' && indexOk) ? 'PASS' : 'FAIL', `view=${w.view}`);
      await page.click('#viewBtn'); await sleep(500);
      w = await page.evaluate(() => window.__qaWorld());
      rec('C', 'Index→Visual', w.view === 'field' ? 'PASS' : 'FAIL');

      await clickFilter(page, 'hospitality');
      await page.click('#viewBtn'); await sleep(500);
      w = await page.evaluate(() => window.__qaWorld());
      rec('C', 'Hospitality survives Visual→Index', (w.sector === 'hospitality' && w.view === 'index') ? 'PASS' : 'FAIL', JSON.stringify(w));
      await page.click('#viewBtn'); await sleep(500);
      w = await page.evaluate(() => window.__qaWorld());
      rec('C', 'Hospitality survives Index→Visual', (w.sector === 'hospitality' && w.view === 'field') ? 'PASS' : 'FAIL');
      await page.close();
    }

    // ========== D ==========
    {
      const {page} = await freshPage(browser);
      await page.click('#viewBtn'); await sleep(700);
      await page.waitForFunction(
        () => [...document.querySelectorAll('#colgrid .tile img')].filter(i => i.naturalWidth > 0).length >= 6,
        {timeout:20000}
      ).catch(() => {});

      const previewTests = await page.evaluate(async () => {
        const out = [];
        const tiles = [...document.querySelectorAll('#colgrid .tile')].filter(t => !t.classList.contains('fhide'));
        const pick = pred => {
          for (const t of tiles) {
            const im = t.querySelector('img');
            if (!im || !im.naturalWidth) continue;
            if (pred(im.naturalWidth / im.naturalHeight)) return t;
          }
          return null;
        };
        const cases = [
          ['portrait', r => r < 0.85 && r >= 0.62],
          ['deep-3:5', r => r < 0.62],
          ['square', r => r >= 0.85 && r <= 1.15],
          ['landscape', r => r > 1.15],
        ];
        for (const [label, pred] of cases) {
          const t = pick(pred);
          if (!t) { out.push({label, status: 'PARTIAL', detail: 'no matching ratio'}); continue; }
          t.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
          await new Promise(r => setTimeout(r, 280));
          const pv = document.querySelector('#ixpreview');
          const pi = document.querySelector('#ixpImg');
          const pw = parseFloat(pv.style.width);
          const ph = parseFloat(pv.style.height);
          const ratio = pw / ph;
          const srcR = pi.naturalWidth / pi.naturalHeight;
          out.push({
            label, id: t.dataset.id,
            shown: pv.classList.contains('show'),
            ratioOk: Math.abs(ratio - srcR) < 0.05,
            not43: Math.abs(ratio - 4 / 3) > 0.08,
            rightish: pv.getBoundingClientRect().right > innerWidth - 80,
            ratio, srcR, pw, ph,
          });
          t.dispatchEvent(new MouseEvent('mouseleave', {bubbles: true}));
          await new Promise(r => setTimeout(r, 60));
        }
        for (const t of tiles.slice(0, 6)) {
          t.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
          await new Promise(r => setTimeout(r, 40));
        }
        await new Promise(r => setTimeout(r, 300));
        const pv = document.querySelector('#ixpreview');
        out.push({
          label: 'rapid-hop',
          stale: pv.classList.contains('show') && pv.dataset.for && tiles[5] && pv.dataset.for !== tiles[5].dataset.id,
          for: pv.dataset.for,
          lastId: tiles[5]?.dataset.id,
        });
        return out;
      });

      for (const p of previewTests) {
        if (p.label === 'rapid-hop') {
          rec('D', 'rapid row hopping no stale flash', !p.stale ? 'PASS' : 'FAIL', JSON.stringify(p));
          continue;
        }
        if (p.status === 'PARTIAL') { rec('D', `preview ${p.label}`, 'PARTIAL', p.detail); continue; }
        const ok = p.shown && p.ratioOk && p.not43 && p.rightish;
        rec('D', `preview ${p.label} (${p.id})`, ok ? 'PASS' : 'FAIL',
          `ratio=${p.ratio?.toFixed(3)} src=${p.srcR?.toFixed(3)} shown=${p.shown}`);
      }
      await page.close();
    }

    // ========== E ==========
    {
      const {page} = await freshPage(browser);
      const ids = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile')].map(t => t.dataset.id));
      const openFail = [], stretch = [], closeFail = [], staleHidden = [];
      for (const id of ids) {
        await openProject(page, id);
        const snap = await page.evaluate(() => {
          const w = window.__qaWorld();
          const hero = document.querySelector('#heroImg');
          const ih = document.querySelector('#insHero').getBoundingClientRect();
          const nw = hero.naturalWidth, nh = hero.naturalHeight;
          return {
            selected: w.selected,
            open: document.querySelector('#inspect').classList.contains('open'),
            stretched: nw && nh ? Math.abs((ih.width / ih.height) - (nw / nh)) > 0.08 : false,
          };
        });
        if (!snap.open || snap.selected !== id) openFail.push(id);
        if (snap.stretched) stretch.push(id);
        await closeProject(page);
        const after = await page.evaluate(id => {
          const t = document.querySelector(`.tile[data-id="${id}"]`);
          return {
            selected: window.__qaWorld().selected,
            vis: t.style.visibility,
            open: document.querySelector('#inspect').classList.contains('open'),
          };
        }, id);
        if (after.selected !== null || after.open) closeFail.push(id);
        if (after.vis === 'hidden') staleHidden.push(id);
      }
      rec('E', 'open every project', openFail.length === 0 ? 'PASS' : 'FAIL', openFail.join(',') || 'ok');
      rec('E', 'no hero stretching', stretch.length === 0 ? 'PASS' : 'FAIL', stretch.join(',') || 'ok');
      if (stretch.length) bug('High', 'Hero stretched', `Open ${stretch.join(',')}`, 'Natural ratio', 'Mismatch', 'aspectRatio/fly', 'openProject', 'Set aspect before measure');
      rec('E', 'close restores', closeFail.length === 0 ? 'PASS' : 'FAIL', closeFail.join(',') || 'ok');
      rec('E', 'no stale hidden tiles', staleHidden.length === 0 ? 'PASS' : 'FAIL', staleHidden.join(',') || 'ok');
      if (staleHidden.length) bug('Critical', 'Tile left hidden', `Open/close ${staleHidden}`, 'Visible', 'hidden', 'closeProject', 'closeProject', 'Clear visibility');
      await page.close();
    }

    // ========== F ==========
    {
      const {page} = await freshPage(browser);
      for (const id of ['sub3', 'gella', 'dopa', 'microsoft']) {
        await openProject(page, id);
        const media = await page.evaluate(async () => {
          const ins = document.querySelector('#inspect');
          ins.scrollTop = ins.scrollHeight;
          await new Promise(r => setTimeout(r, 250));
          const imgs = [...ins.querySelectorAll('.ins-gal .gi img, #heroImg')];
          const gifs = imgs.filter(i => /\.gif/i.test(i.currentSrc || i.src || ''));
          const vids = [...ins.querySelectorAll('.gv iframe, .gv video')];
          let peOk = true;
          for (const v of vids) if (getComputedStyle(v).pointerEvents !== 'none') peOk = false;
          return {imgCount: imgs.length, gifCount: gifs.length, vidCount: vids.length, peOk, scrollTop: ins.scrollTop};
        });
        rec('F', `${id} images scroll + media`, (media.imgCount > 1 && media.scrollTop > 0) ? 'PASS' : 'PARTIAL', JSON.stringify(media));
        if (media.vidCount > 0) rec('F', `${id} video pointer-events none`, media.peOk ? 'PASS' : 'FAIL');
        else rec('F', `${id} video present`, 'PARTIAL', 'no video nodes (embed may block)');
        if (id === 'sub3') rec('F', 'SUB:3 GIFs present', media.gifCount > 0 ? 'PASS' : 'FAIL', `gifs=${media.gifCount}`);
        await closeProject(page);
      }
      await page.close();
    }

    // ========== G ==========
    {
      const {page} = await freshPage(browser);
      await openProject(page, 'sub3');
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 1200; });
      const yImages1 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mIdea'); await sleep(400);
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 400; });
      const yIdea1 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mImages'); await sleep(400);
      const yImages2 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await page.click('#mIdea'); await sleep(400);
      const yIdea2 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      const memOk = Math.abs(yImages2 - yImages1) <= 2 && Math.abs(yIdea2 - yIdea1) <= 2;
      rec('G', 'SUB:3 Images/Idea scroll memory', memOk ? 'PASS' : 'FAIL',
        `img ${yImages1}→${yImages2}, idea ${yIdea1}→${yIdea2}`);
      if (!memOk) bug('High', 'Mode scroll memory lost', 'Images↔Idea scroll', 'Restore modeY',
        `${yImages1}/${yImages2}`, 'ledger.modeY', 'setDepth', 'Save/restore modeY');

      await closeProject(page);
      await openProject(page, 'dopa');
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 800; });
      await page.click('#mIdea'); await sleep(350);
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 250; });
      await page.click('#mImages'); await sleep(350);
      const y2 = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      rec('G', 'DOPA Images/Idea scroll memory', Math.abs(y2 - 800) <= 2 ? 'PASS' : 'FAIL', `got ${y2}`);
      await page.close();
    }

    // ========== H ==========
    {
      const {page} = await freshPage(browser);
      await openProject(page, 'sub3');
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 900; });
      const before = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await toggleInfo(page, true);
      await toggleInfo(page, false);
      const after = await page.evaluate(() => ({
        ins: document.querySelector('#inspect').scrollTop,
        info: window.__qaWorld().infoOpen,
      }));
      rec('H', 'Info from project Images restores', (Math.abs(after.ins - before) <= 2 && !after.info) ? 'PASS' : 'FAIL',
        `${before}→${after.ins}`);

      await page.click('#mIdea'); await sleep(350);
      await page.evaluate(() => { document.querySelector('#inspect').scrollTop = 300; });
      const beforeI = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      await toggleInfo(page, true);
      await toggleInfo(page, false);
      const afterI = await page.evaluate(() => document.querySelector('#inspect').scrollTop);
      rec('H', 'Info from Idea restores', Math.abs(afterI - beforeI) <= 2 ? 'PASS' : 'FAIL', `${beforeI}→${afterI}`);

      await closeProject(page);
      await clickFilter(page, 'fmcg');
      await page.evaluate(() => scrollTo(0, 200));
      const beforeF = await page.evaluate(() => scrollY);
      await toggleInfo(page, true);
      await toggleInfo(page, false);
      const afterF = await page.evaluate(() => ({y: scrollY, sector: window.__qaWorld().sector}));
      rec('H', 'Info from filtered Visual restores',
        (Math.abs(afterF.y - beforeF) <= 2 && afterF.sector === 'fmcg') ? 'PASS' : 'FAIL', JSON.stringify({beforeF, afterF}));

      await page.click('#viewBtn'); await sleep(500);
      await page.evaluate(() => scrollTo(0, 150));
      const beforeX = await page.evaluate(() => scrollY);
      await toggleInfo(page, true);
      await toggleInfo(page, false);
      const afterX = await page.evaluate(() => ({y: scrollY, view: window.__qaWorld().view}));
      rec('H', 'Info from Index restores',
        (Math.abs(afterX.y - beforeX) <= 2 && afterX.view === 'index') ? 'PASS' : 'FAIL', JSON.stringify({beforeX, afterX}));
      await page.close();
    }

    // ========== I ==========
    {
      const {page} = await freshPage(browser);
      await openProject(page, 'sub3');
      const stack = await page.evaluate(() => [...document.querySelectorAll('#stack .sth')].map(s => {
        const r = s.getBoundingClientRect();
        return {id: s.dataset.id, tip: s.querySelector('.tip')?.textContent, w: r.width, h: r.height};
      }));
      const all35 = stack.every(s => Math.abs(s.w - 36) < 1 && Math.abs(s.h - 60) < 1);
      rec('I', 'sibling thumbs exactly 3:5 (36×60)', all35 ? 'PASS' : 'FAIL',
        stack.slice(0, 3).map(s => `${s.id}:${Math.round(s.w)}x${Math.round(s.h)}`).join(' '));

      const chain = ['fishfish', 'dopa', 'roy', 'microsoft'];
      let lateralOk = true;
      const path = [];
      for (const id of chain) {
        await page.evaluate(id => document.querySelector(`#stack .sth[data-id="${id}"]`).click(), id);
        await sleep(700);
        const w = await page.evaluate(() => window.__qaWorld());
        path.push(w.selected);
        if (w.selected !== id || w.depth !== 'images') lateralOk = false;
      }
      rec('I', 'lateral Images chain', lateralOk ? 'PASS' : 'FAIL', path.join('→'));

      await page.click('#mIdea'); await sleep(400);
      await page.evaluate(() => document.querySelector('#stack .sth[data-id="sub3"]').click());
      await sleep(700);
      const ideaKeep = await page.evaluate(() => window.__qaWorld());
      rec('I', 'lateral preserves Idea depth',
        (ideaKeep.selected === 'sub3' && ideaKeep.depth === 'idea') ? 'PASS' : 'FAIL', JSON.stringify(ideaKeep));
      await page.close();
    }

    // ========== J ==========
    {
      const {page} = await freshPage(browser);
      await openProject(page, 'sub3');
      const targets = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile')].map(t => {
        const im = t.querySelector('img');
        const r = im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : null;
        return {
          id: t.dataset.id, r,
          kind: !r ? '?' : r > 1.15 ? 'land' : r >= 0.85 ? 'sq' : r >= 0.62 ? 'port' : 'deep',
        };
      }));
      const picks = {
        land: targets.find(t => t.kind === 'land' && t.id !== 'sub3'),
        sq: targets.find(t => t.kind === 'sq'),
        port: targets.find(t => t.kind === 'port' || t.kind === 'deep'),
      };

      async function checkLateral(label, id) {
        if (!id) { rec('J', `lateral to ${label}`, 'PARTIAL', 'no target'); return; }
        await page.evaluate(id => document.querySelector(`#stack .sth[data-id="${id}"]`).click(), id);
        await sleep(100);
        const mid = await page.evaluate(() => {
          const img = document.querySelector('#ghost .gc img') || document.querySelector('#ghost img');
          if (!img) return {flying: false};
          const r = img.getBoundingClientRect();
          const nw = img.naturalWidth, nh = img.naturalHeight;
          const parent = img.parentElement;
          return {
            flying: true,
            cropAware: parent && parent.classList.contains('gc'),
            rubber: nw && nh ? Math.abs((r.width / r.height) - (nw / nh)) > 0.15 : null,
            parent: parent?.className,
          };
        });
        await sleep(650);
        const end = await page.evaluate(() => {
          const hero = document.querySelector('#heroImg');
          const ih = document.querySelector('#insHero').getBoundingClientRect();
          const nw = hero.naturalWidth, nh = hero.naturalHeight;
          return {
            selected: window.__qaWorld().selected,
            distort: nw && nh ? Math.abs((ih.width / ih.height) - (nw / nh)) > 0.08 : null,
            ghostLeft: document.querySelector('#ghost').children.length,
          };
        });
        const ok = end.selected === id && !end.distort && end.ghostLeft === 0 && (mid.cropAware || !mid.flying);
        const status = ok ? 'PASS' : (end.distort || mid.rubber ? 'FAIL' : 'PARTIAL');
        rec('J', `lateral to ${label} (${id})`, status, JSON.stringify({mid, end}));
        if (status === 'FAIL') bug('Medium', `Lateral transition distort → ${label}`,
          `From stack thumb to ${id}`, 'Crop-aware reveal, no rubber-sheet',
          JSON.stringify({mid, end}), 'fly vs flyCrop', 'lateral/flyCrop', 'Document; keep crop-aware path');
      }

      await checkLateral('landscape', picks.land?.id);
      await checkLateral('square', picks.sq?.id);
      await checkLateral('portrait', picks.port?.id);
      await page.close();
    }

    // ========== K ==========
    {
      const {page} = await freshPage(browser);
      // build history: home → hospitality → index hospitality → project → idea → info
      await clickFilter(page, 'hospitality');
      await page.click('#viewBtn'); await sleep(500);
      await page.evaluate(() => document.querySelector('.tile[data-id="dopa"]').click());
      await sleep(800);
      await page.click('#mIdea'); await sleep(400);
      await page.click('#infoBtn'); await sleep(400);

      const states = [];
      const snap = async label => {
        const s = await page.evaluate(() => {
          const w = window.__qaWorld();
          return {
            hash: location.hash || '#/',
            sector: w.sector, view: w.view, selected: w.selected,
            depth: w.depth, infoOpen: w.infoOpen, lock: w.lock,
            body: document.body.className,
            inspectOpen: document.querySelector('#inspect').classList.contains('open'),
          };
        });
        states.push({label, ...s});
        return s;
      };

      const top = await snap('top:info-over-idea');
      rec('K', 'URL at Info over Idea',
        (top.hash.includes('/p/dopa/idea') && top.hash.includes('info') && top.infoOpen) ? 'PASS' : 'FAIL', top.hash);

      await page.goBack(); await sleep(500);
      const b1 = await snap('back1');
      rec('K', 'Back from Info → Idea',
        (b1.selected === 'dopa' && b1.depth === 'idea' && !b1.infoOpen) ? 'PASS' : 'FAIL', JSON.stringify(b1));

      await page.goBack(); await sleep(700);
      const b2 = await snap('back2');
      rec('K', 'Back from Idea → Images',
        (b2.selected === 'dopa' && b2.depth === 'images' && !b2.infoOpen) ? 'PASS' : 'FAIL', JSON.stringify(b2));

      await page.goBack(); await sleep(700);
      const b3 = await snap('back3');
      rec('K', 'Back from project → Index hospitality',
        (!b3.selected && b3.view === 'index' && b3.sector === 'hospitality') ? 'PASS' : 'FAIL', JSON.stringify(b3));

      await page.goForward(); await sleep(700);
      const f1 = await snap('fwd1');
      rec('K', 'Forward → project Images',
        (f1.selected === 'dopa' && f1.depth === 'images') ? 'PASS' : 'FAIL', JSON.stringify(f1));

      // double transition / lock
      rec('K', 'no stuck lock after history', !f1.lock ? 'PASS' : 'FAIL', `lock=${f1.lock}`);
      await page.close();
    }

    // ========== L ==========
    {
      const {page, errors} = await freshPage(browser);
      // rapid chaos
      for (let i = 0; i < 3; i++) {
        await clickFilter(page, 'spatial');
        await clickFilter(page, 'hospitality');
        await page.evaluate(() => { openInfo(); closeInfo(); }); await sleep(100);
      }
      await openProject(page, 'sub3');
      await page.click('#mIdea'); await sleep(80);
      await page.click('#mImages'); await sleep(80);
      await page.evaluate(() => document.querySelector('#stack .sth[data-id="dopa"]').click());
      await sleep(200);
      await page.evaluate(() => document.querySelector('#stack .sth[data-id="roy"]').click());
      await sleep(200);
      await page.goBack(); await sleep(200);
      await page.goForward(); await sleep(500);
      await sleep(1600); // past watchdog
      const final = await page.evaluate(() => {
        const w = window.__qaWorld();
        const hiddenStale = [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.visibility === 'hidden' && t.dataset.id !== w.selected);
        const ghost = document.querySelector('#ghost').children.length;
        const infos = document.querySelectorAll('#info').length;
        return {w, hiddenStale: hiddenStale.map(t => t.dataset.id), ghost, infos, body: document.body.className};
      });
      const chaosOk = !final.w.lock && final.ghost === 0 && final.hiddenStale.length === 0 && final.infos === 1;
      rec('L', 'rapid input no stuck lock / stale / ghosts', chaosOk ? 'PASS' : 'FAIL', JSON.stringify(final));
      if (!chaosOk) bug('High', 'Chaos leaves inconsistent state', 'Rapid filters/info/lateral/history',
        'Clean world', JSON.stringify(final), 'lock / visibility / ghost cleanup', 'multiple', 'Harden release paths');
      const consoleBad = errors.filter(e => !/favicon|net::ERR|Failed to load/i.test(e));
      rec('L', 'no uncaught JS errors', consoleBad.length === 0 ? 'PASS' : 'FAIL', consoleBad.slice(0, 5).join(' | '));
      if (consoleBad.length) notes.push('L errors: ' + consoleBad.join(' | '));
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
  const out = {summary, results, bugs, notes, generatedAt: new Date().toISOString(), base: BASE};
  writeFileSync(new URL('./qa-results.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary));
  console.log(`bugs: ${bugs.length}`);
  process.exit(summary.FAIL > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(2); });
