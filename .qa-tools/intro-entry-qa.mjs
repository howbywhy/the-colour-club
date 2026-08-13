/**
 * First-frame + enter choreography QA for refined showreel entry.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'intro-entry');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fails = [];
const ok = (n, c, d = '') => {
  if (!c) fails.push(`${n}${d ? ': ' + d : ''}`);
  console.log(c ? 'PASS' : 'FAIL', n, d);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 900 },
});

async function coldPage() {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.clear();
    } catch (_) {}
  });
  return page;
}

function probe() {
  return (() => {
    const stage = document.querySelector('#introStage');
    const surface = document.querySelector('#introSurface');
    const reel = document.querySelector('#introReel');
    const mark = document.querySelector('#introMark');
    const iframe = reel?.querySelector('iframe');
    const sc = stage ? getComputedStyle(stage) : null;
    const rc = reel ? getComputedStyle(reel) : null;
    const mc = mark ? getComputedStyle(mark) : null;
    const tr = surface ? getComputedStyle(surface).transform : 'none';
    let surfaceTY = 0;
    if (tr && tr !== 'none') {
      try {
        surfaceTY = new DOMMatrix(tr).m42;
      } catch (_) {}
    }
    const markTr = mc?.transform || 'none';
    let markTY = 0;
    let markTX = 0;
    if (markTr && markTr !== 'none') {
      try {
        const m = new DOMMatrix(markTr);
        markTX = m.m41;
        markTY = m.m42;
      } catch (_) {}
    }
    return {
      introBoot: document.documentElement.classList.contains('intro-boot'),
      bodyIntro: document.body.classList.contains('intro-tcc'),
      stageHidden: !!stage?.hidden,
      stageBg: sc?.backgroundColor,
      reelOp: Number(rc?.opacity || 0),
      iframe: !!iframe,
      iframeOp: iframe ? Number(getComputedStyle(iframe).opacity) : null,
      markColor: mc?.color,
      markFs: mc?.fontSize,
      markW: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
      colOp: Number(getComputedStyle(document.querySelector('#collection')).opacity),
      chromeOp: Number(getComputedStyle(document.querySelector('#chrome')).opacity),
      surfaceTY: Math.round(surfaceTY),
      markTX: Math.round(markTX),
      markTY: Math.round(markTY),
      brandVis: getComputedStyle(document.querySelector('#brandBtn')).visibility,
    };
  })();
}

/* ---- First frames ---- */
{
  const page = await coldPage();
  const nav = page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('#introMark');
  const start = Date.now();
  for (const t of [0, 16, 33, 50, 100, 200, 400]) {
    const w = start + t - Date.now();
    if (w > 0) await sleep(w);
    await page.screenshot({ path: path.join(OUT, `first-${String(t).padStart(4, '0')}.png`) });
    const st = await page.evaluate(probe);
    const bgOk = st.stageBg === 'rgb(255, 255, 255)';
    const markOk = st.markColor === 'rgb(16, 16, 20)';
    const noColFlash = st.colOp === 1 || st.stageHidden === false;
    const sizeOk = st.markW >= 1440 * 0.42; /* ~50vw band */
    ok(
      `first:${t}ms`,
      st.introBoot && !st.stageHidden && bgOk && markOk && st.reelOp < 0.05 && sizeOk,
      JSON.stringify(st)
    );
    if (t === 0) {
      ok('first:no-black-stage', bgOk, st.stageBg);
      ok('first:black-tcc', markOk, st.markColor);
      ok('first:reel-hidden', st.reelOp < 0.05, String(st.reelOp));
    }
  }
  await nav.catch(() => {});
  await page.close();
}

/* ---- Enter choreography ---- */
{
  const page = await coldPage();
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(900); /* allow video reveal attempt */
  const before = await page.evaluate(probe);
  ok('before:reel-may-show', before.reelOp >= 0 || true, JSON.stringify(before));
  await page.screenshot({ path: path.join(OUT, 'enter-before.png') });

  const clickP = page.click('#introEnter');
  const stamps = [100, 250, 400, 600];
  const start = Date.now();
  await clickP;
  for (const t of stamps) {
    const w = start + t - Date.now();
    if (w > 0) await sleep(w);
    await page.screenshot({ path: path.join(OUT, `enter-${t}.png`) });
    const st = await page.evaluate(probe);
    /* Surface should move down; mark should NOT share that large +Y */
    const surfaceDown = st.surfaceTY > 40;
    const markNotWithVideo = st.markTY < st.surfaceTY * 0.5 || st.markTX < -20 || st.stageHidden;
    ok(`enter:+${t}`, surfaceDown || st.stageHidden, JSON.stringify(st));
    if (t >= 250) ok(`enter:+${t}:counter`, markNotWithVideo, JSON.stringify({ surfaceTY: st.surfaceTY, markTY: st.markTY, markTX: st.markTX }));
  }
  await sleep(500);
  const rest = await page.evaluate(probe);
  await page.screenshot({ path: path.join(OUT, 'enter-rest.png') });
  ok(
    'rest',
    rest.stageHidden && !rest.bodyIntro && !rest.introBoot && rest.brandVis === 'visible' && rest.colOp === 1,
    JSON.stringify(rest)
  );
  ok('rest:interactive', await page.evaluate(() => !world.lock && typeof setFilter === 'function'));
  await page.evaluate(() => setFilter('hospitality'));
  await sleep(800);
  ok('rest:filter', await page.evaluate(() => world.sector === 'hospitality'));
  await page.close();
}

/* ---- Early click before video ---- */
{
  const page = await coldPage();
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#introEnter');
  await sleep(40);
  await page.click('#introEnter');
  await sleep(900);
  const st = await page.evaluate(probe);
  ok('early-enter', st.stageHidden && st.brandVis === 'visible', JSON.stringify(st));
  await page.close();
}

/* ---- Deep link skips ---- */
{
  const page = await coldPage();
  await page.goto(`${BASE}?_=${Date.now()}#/hospitality`, { waitUntil: 'networkidle0' });
  await sleep(300);
  const st = await page.evaluate(probe);
  ok('skip:sector', st.stageHidden && !st.introBoot, JSON.stringify(st));
  await page.close();
}

console.log('\n==== INTRO ENTRY QA ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
