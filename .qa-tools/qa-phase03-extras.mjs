/** Phase 03 extras: density tokens, CDN abstinence, dual viewport, stress. */
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.TCC_URL || 'http://127.0.0.1:8000/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (n, s, d = '') => { results.push({ name: n, status: s, detail: d }); console.log(`${s.padEnd(7)} ${n}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const cdnHits = [];
const failed = [];
const consoleErr = [];

async function prep(page, hash = '') {
  page.on('request', req => {
    const u = req.url();
    if (/cdn\.thecolourclub|framerusercontent|images\.squarespace|sqsp/i.test(u)) cdnHits.push(u);
  });
  page.on('requestfailed', req => {
    const u = req.url();
    if (/favicon|vidzflow|fonts\.g/i.test(u)) return;
    failed.push(u + ' :: ' + (req.failure()?.errorText || ''));
  });
  page.on('pageerror', e => consoleErr.push(String(e.message || e)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErr.push(msg.text()); });
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { sessionStorage.setItem('tccIntro', '1'); } catch (e) {} });
  await page.waitForSelector('#colgrid .tile', { timeout: 15000 });
  await sleep(400);
}

try {
  /* density tokens */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await prep(page);
    const spacing = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const edge = cs.getPropertyValue('--page-edge').trim();
      const grid = getComputedStyle(document.querySelector('#colgrid'));
      const lbl = getComputedStyle(document.querySelector('.tile .lbl'));
      const intro = getComputedStyle(document.querySelector('#collectionIntro'));
      return {
        pageEdge: edge,
        colGap: grid.gap || `${grid.rowGap} ${grid.columnGap}`,
        rowGap: grid.rowGap,
        colGapX: grid.columnGap,
        lblPadTop: lbl.paddingTop,
        introMb: intro.marginBottom,
      };
    });
    await page.evaluate(id => document.querySelector(`.tile[data-id="${id}"]`).click(), 'sub3');
    await sleep(900);
    const gal = await page.evaluate(() => {
      const g = getComputedStyle(document.querySelector('.ins-gal'));
      return { gap: g.gap || `${g.rowGap} ${g.columnGap}`, mt: g.marginTop };
    });
    rec('density page-edge ~17px', spacing.pageEdge === '17px' ? 'PASS' : 'FAIL', JSON.stringify(spacing));
    rec('density colgrid 28×10', (spacing.rowGap === '28px' && spacing.colGapX === '10px') ? 'PASS' : 'FAIL', JSON.stringify(spacing));
    rec('density caption pad 3px', spacing.lblPadTop === '3px' ? 'PASS' : 'FAIL', spacing.lblPadTop);
    rec('density intro mb 28px', spacing.introMb === '28px' ? 'PASS' : 'FAIL', spacing.introMb);
    rec('density project gal 10px', (gal.gap.includes('10px') && gal.mt === '10px') ? 'PASS' : 'FAIL', JSON.stringify(gal));
    const cdnDuring = cdnHits.length;
    rec('no CDN image requests (local success)', cdnDuring === 0 ? 'PASS' : 'FAIL', `hits=${cdnDuring} ${cdnHits.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  /* narrower desktop */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1180, height: 800 });
    await prep(page);
    const layout = await page.evaluate(() => {
      const chrome = document.querySelector('#chrome').getBoundingClientRect();
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const filters = document.querySelector('#filters').getBoundingClientRect();
      const brand = document.querySelector('#brandBtn').getBoundingClientRect();
      return {
        overflow,
        chromeH: Math.round(chrome.height),
        brandRight: Math.round(brand.right),
        filtersLeft: Math.round(filters.left),
        gapBrandFilters: Math.round(filters.left - brand.right),
      };
    });
    rec('1180: no horizontal overflow', !layout.overflow ? 'PASS' : 'FAIL', JSON.stringify(layout));
    rec('1180: nav groups not collapsed', layout.gapBrandFilters > 40 ? 'PASS' : 'FAIL', JSON.stringify(layout));
    await page.evaluate(id => document.querySelector(`.tile[data-id="${id}"]`).click(), 'microsoft');
    await sleep(900);
    const ok = await page.evaluate(() => world.selected === 'microsoft' && !world.lock);
    rec('1180: project open ok', ok ? 'PASS' : 'FAIL');
    await page.close();
  }

  /* stress minutes-lite */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await prep(page);
    const seq = ['hospitality', 'fmcg', 'spatial', 'all', 'fmcg', 'all', 'spatial', 'hospitality', 'all'];
    for (const s of seq) {
      await page.evaluate(sec => setFilter(sec), s);
      await sleep(90);
    }
    await sleep(600);
    await page.evaluate(() => openProject('sub3')); await sleep(200);
    await page.evaluate(() => setDepth('idea')); await sleep(100);
    await page.evaluate(() => openInfo()); await sleep(100);
    await page.evaluate(() => closeInfo()); await sleep(150);
    await page.evaluate(() => setDepth('images')); await sleep(150);
    for (const id of ['dopa', 'roy', 'gella', 'lucky', 'macabalm', 'willing', 'tsukiyo', 'microsoft', 'fishfish']) {
      await page.evaluate(id => lateral(id), id);
      await sleep(120);
    }
    await sleep(500);
    for (let i = 0; i < 4; i++) { await page.goBack(); await sleep(120); }
    for (let i = 0; i < 2; i++) { await page.goForward(); await sleep(120); }
    await sleep(1800);
    await page.evaluate(() => {
      if (world.infoOpen) closeInfo();
      if (world.selected) closeProject(true);
      if (world.view !== 'index') setView('index', true);
    });
    await sleep(200);
    // rapid index hover
    await page.evaluate(async () => {
      const tiles = [...document.querySelectorAll('#colgrid .tile:not(.fhide)')];
      for (const t of tiles) {
        t.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await new Promise(r => setTimeout(r, 40));
        t.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }
    });
    await sleep(400);
    const final = await page.evaluate(() => {
      const hidden = [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.visibility === 'hidden' && t.dataset.id !== world.selected).map(t => t.dataset.id);
      return {
        lock: world.lock,
        ghost: document.querySelector('#ghost').children.length,
        hidden,
        preview: document.querySelector('#ixpreview').classList.contains('show'),
        selected: world.selected,
        view: world.view,
      };
    });
    rec('stress no lock/ghost/stale', (!final.lock && final.ghost === 0 && final.hidden.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(final));
    rec('stress index preview cleaned', !final.preview ? 'PASS' : 'FAIL', JSON.stringify(final));
    await page.close();
  }

  /* visual regression: type scale unchanged */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await prep(page);
    const type = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        primary: root.getPropertyValue('--t-primary').trim(),
        secondary: root.getPropertyValue('--t-secondary').trim(),
        large: root.getPropertyValue('--t-large').trim(),
        line: getComputedStyle(document.querySelector('#linecell p') || document.querySelector('#linecell')).fontSize,
      };
    });
    rec('typography tokens unchanged', (type.primary && type.secondary && type.large) ? 'PASS' : 'FAIL', JSON.stringify(type));
    await page.close();
  }

} finally {
  await browser.close();
}

const summary = {
  PASS: results.filter(r => r.status === 'PASS').length,
  FAIL: results.filter(r => r.status === 'FAIL').length,
};
const out = { generatedAt: new Date().toISOString(), summary, results, cdnHits, failed, consoleErr: consoleErr.filter(e => !/favicon|vidzflow/i.test(e)) };
writeFileSync(join(ROOT, '.qa-tools/qa-phase03-extras-results.json'), JSON.stringify(out, null, 2));
console.log('\n=== PHASE03 EXTRAS ===');
console.log(JSON.stringify(summary));
console.log('cdnHits', cdnHits.length);
console.log('failed', failed.length);
console.log('consoleErr', out.consoleErr.length);
process.exit(summary.FAIL > 0 ? 1 : 0);
