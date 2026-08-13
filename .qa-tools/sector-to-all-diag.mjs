/** Diagnose Sector→All geometry + flash frames for hospitality/fmcg/spatial. */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});

async function pageFresh() {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto('http://127.0.0.1:8000/index.html?_=' + Date.now(), {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction(() => typeof setFilter === 'function');
  await sleep(300);
  return page;
}

async function measure(sector) {
  const page = await pageFresh();
  await page.evaluate((s) => setFilter(s, true), sector);
  await sleep(200);

  const report = await page.evaluate((sec) => {
    const vh = innerHeight;
    const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
    const occ = slots.map((s) => s.querySelector(':scope > .tile')).filter(Boolean);
    const before = new Map(occ.map((t) => [t.dataset.id, t.getBoundingClientRect().toJSON()]));

    /* Simulate commit without anim — same order as current code */
    document.body.classList.remove('filtered');
    slots.forEach((slot) => {
      while (slot.firstChild) document.querySelector('#colgrid').appendChild(slot.firstChild);
    });
    const tiles = [...document.querySelectorAll('#colgrid .tile')];
    tiles.forEach((t) => {
      t.classList.remove('fhide');
      t.style.opacity = before.has(t.dataset.id) ? '' : '0.001';
    });
    void document.querySelector('#colgrid').offsetHeight;

    const rows = occ.map((t) => {
      const b = before.get(t.dataset.id);
      const a = t.getBoundingClientRect().toJSON();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const dist = Math.hypot(dx, dy);
      const destOff =
        a.bottom < 0 || a.top > vh || a.top > vh * 0.92;
      const wouldFlip = dist >= 16 && dist <= 760;
      return {
        id: t.dataset.id,
        sector: { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1) },
        all: { x: +a.left.toFixed(1), y: +a.top.toFixed(1), w: +a.width.toFixed(1) },
        dx: +dx.toFixed(1),
        dy: +dy.toFixed(1),
        dist: +dist.toFixed(1),
        destOff,
        wouldFlip,
        parentAfter: t.parentElement?.id || t.parentElement?.className,
      };
    });

    const returners = tiles
      .filter((t) => !before.has(t.dataset.id))
      .map((t) => ({
        id: t.dataset.id,
        op: getComputedStyle(t).opacity,
        y: +t.getBoundingClientRect().top.toFixed(1),
        visibleLayout: t.getBoundingClientRect().width > 0,
      }));

    return {
      sec,
      allV: document.body.dataset.allV || document.documentElement.dataset.allV,
      bodyAllV: document.body.getAttribute('data-all-v'),
      scrollY,
      vh,
      survivors: rows,
      returnerCount: returners.length,
      returnersSample: returners.slice(0, 4),
      flashRisk:
        rows.some((r) => r.wouldFlip === false && r.dist > 16) ||
        rows.filter((r) => !r.wouldFlip).length >= 0,
    };
  }, sector);

  await page.close();
  return report;
}

for (const s of ['hospitality', 'fmcg', 'spatial']) {
  const r = await measure(s);
  console.log('\n====', s, '→ all ====');
  console.log(JSON.stringify(r, null, 2));
}

await browser.close();
