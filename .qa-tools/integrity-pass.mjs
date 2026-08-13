/** Integrity pass: stack invariant, filter feel, stack window size. */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function pageReady() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('tccIntro', '1');
      sessionStorage.setItem('tccAllV', '1');
    } catch (e) {}
  });
  await page.goto(BASE + '?allv=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colgrid .tile');
  await sleep(400);
  return page;
}

const fail = [];
const log = {};

function assertStackGone(label, s) {
  if (s.selected != null) fail.push(label + ':selected');
  if (s.show) fail.push(label + ':show');
  if (s.idea) fail.push(label + ':idea');
  if (parseFloat(s.op) > 0.001) fail.push(label + ':op:' + s.op);
  if (s.vis !== 'hidden') fail.push(label + ':vis:' + s.vis);
  if (s.pe !== 'none') fail.push(label + ':pe:' + s.pe);
  if (s.children > 0) fail.push(label + ':children:' + s.children);
}

async function stackSnap(page) {
  return page.evaluate(() => {
    const st = document.querySelector('#stack');
    const cs = getComputedStyle(st);
    return {
      selected: world.selected,
      show: st.classList.contains('show'),
      idea: document.querySelector('#inspect').classList.contains('idea'),
      op: cs.opacity,
      vis: cs.visibility,
      pe: cs.pointerEvents,
      children: st.querySelectorAll('.sth').length,
    };
  });
}

/* Idea → Close via clicks */
{
  const page = await pageReady();
  await page.click('#colgrid .tile[data-id="dopa"] .ph');
  await sleep(650);
  await page.click('#mIdea');
  await sleep(350);
  const during = await page.evaluate(() => document.querySelectorAll('#stack .sth').length);
  log.stackWindow = during;
  if (during !== 8) fail.push('stack-window:' + during);
  await page.click('#insClose');
  await sleep(1100);
  const s = await stackSnap(page);
  log.ideaClose = s;
  assertStackGone('ideaClose', s);
  await page.close();
}

/* Images close */
{
  const page = await pageReady();
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    openProject('roy', true);
    await sleep(40);
    closeProject();
    for (let i = 0; i < 80; i++) {
      await sleep(20);
      if (!world.selected && !world.lock) break;
    }
    await sleep(100);
  });
  const s = await stackSnap(page);
  log.imagesClose = s;
  assertStackGone('imagesClose', s);
  await page.close();
}

/* Idea → Info → Close Info → Close */
{
  const page = await pageReady();
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    openProject('dopa', true);
    setDepth('idea', true);
    openInfo(true);
    await sleep(40);
    closeInfo(null, true);
    await sleep(40);
    closeProject();
    for (let i = 0; i < 80; i++) {
      await sleep(20);
      if (!world.selected && !world.lock) break;
    }
    await sleep(100);
  });
  const s = await stackSnap(page);
  log.ideaInfoClose = s;
  assertStackGone('ideaInfoClose', s);
  await page.close();
}

/* Filter: no stmt/scroll drift; sector paths idle clean */
{
  const page = await pageReady();
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitIdle = async () => {
      for (let i = 0; i < 120; i++) {
        if (filterCtrl.phase === 'idle' && !world.lock) return true;
        await sleep(16);
      }
      return filterCtrl.phase === 'idle';
    };
    const issues = [];
    const seq = ['hospitality', 'fmcg', 'spatial', 'all', 'spatial', 'hospitality', 'fmcg', 'all'];
    for (const sec of seq) {
      const st = document.querySelector('#collectionIntro').getBoundingClientRect();
      const y = scrollY;
      setFilter(sec);
      await waitIdle();
      const st2 = document.querySelector('#collectionIntro').getBoundingClientRect();
      if (Math.abs(st2.top - st.top) > 0.5) issues.push('stmt:' + sec);
      if (scrollY !== y) issues.push('scroll:' + sec);
      const stale = [...document.querySelectorAll('#colgrid .tile')].filter(
        (t) => getComputedStyle(t).transform !== 'none' || t.style.transform
      );
      if (stale.length) issues.push('stale:' + sec);
      const badOp = [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].filter(
        (t) => parseFloat(getComputedStyle(t).opacity) < 0.98
      );
      if (badOp.length) issues.push('op:' + sec);
    }
    return issues;
  });
  log.filter = r;
  r.forEach((x) => fail.push(x));
  await page.close();
}

/* Favicon link present */
{
  const page = await pageReady();
  const ok = await page.evaluate(() => !!document.querySelector('link[rel="icon"][data-tcc]'));
  log.favicon = ok;
  if (!ok) fail.push('favicon');
  await page.close();
}

console.log(JSON.stringify({ fail, log }, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
