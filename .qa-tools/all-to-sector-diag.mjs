/** Prove All→Sector motion branch per project (Hospitality / FMCG / Spatial). */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});

async function measure(sec) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto('http://127.0.0.1:8000/index.html?_=' + Date.now(), { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof setFilter === 'function');
  await sleep(200);
  await page.evaluate(() => setFilter('all', true));
  await sleep(100);

  const report = await page.evaluate((sector) => {
    const vh = innerHeight;
    const min = 16;
    const max = 760;
    const ids = [...document.querySelectorAll('#colgrid .tile')]
      .map((t) => t.dataset.id)
      .filter((id) => {
        const p = window.world && null;
        return true;
      });
    /* matching tiles = will show for sector */
    const byId = {};
    [...document.querySelectorAll('#colgrid .tile')].forEach((t) => {
      byId[t.dataset.id] = t;
    });
    /* read cat from tile visibility via setFilter quiet probe — use data from open world */
    const projects = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.id);
    /* Simulate: capture All rects for sector members by temporarily mounting */
    const catOf = (id) => {
      /* infer from known sets via current DOM after quiet filter */
      return null;
    };
    setFilter(sector, true);
    const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
    const dest = {};
    slots.forEach((s, i) => {
      const t = s.querySelector('.tile');
      if (t) dest[t.dataset.id] = { slot: i, rect: t.getBoundingClientRect().toJSON() };
    });
    setFilter('all', true);
    void document.querySelector('#colgrid').offsetHeight;
    const rows = Object.keys(dest).map((id) => {
      const t = byId[id];
      const b = t.getBoundingClientRect();
      const a = dest[id].rect;
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const dist = Math.hypot(dx, dy);
      let mode = 'FADE_ONLY';
      let branch = 'none';
      if (dist < min) {
        mode = 'SNAP_MICRO';
        branch = 'invertForFlip:null dist<min';
      } else if (dist > max) {
        mode = 'FADE_ONLY';
        branch = 'invertForFlip:null dist>filterMoveMax(760)';
      } else {
        mode = 'REAL_FLIP';
        branch = 'invertForFlip:ok → WAAPI translate';
      }
      const srcInView = b.bottom > -48 && b.top < vh + 48;
      return {
        id,
        slot: dest[id].slot,
        all: { x: +b.left.toFixed(1), y: +b.top.toFixed(1) },
        sector: { x: +a.left.toFixed(1), y: +a.top.toFixed(1) },
        dx: +dx.toFixed(1),
        dy: +dy.toFixed(1),
        dist: +dist.toFixed(1),
        srcInView,
        mode,
        branch,
        direction: dy > 16 ? 'UP into sector' : dy < -16 ? 'DOWN into sector' : 'horizontal/micro',
      };
    });
    return { sector, vh, filterMoveMax: max, rows };
  }, sec);

  await page.close();
  return report;
}

for (const s of ['hospitality', 'fmcg', 'spatial']) {
  console.log('\n==== All →', s, '====');
  console.log(JSON.stringify(await measure(s), null, 2));
}
await browser.close();
