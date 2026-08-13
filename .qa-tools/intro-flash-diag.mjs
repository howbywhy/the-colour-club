/** Frame-timed first-entry flash diagnosis (cold session). */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'intro-flash');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  try {
    sessionStorage.clear();
  } catch (_) {}
});

const samples = [];
const capture = async (label) => {
  const shot = path.join(OUT, `frame-${label}.png`);
  await page.screenshot({ path: shot });
  const st = await page
    .evaluate(() => {
      const stage = document.querySelector('#introStage');
      const reel = document.querySelector('#introReel');
      const iframe = reel?.querySelector('iframe');
      const chrome = document.querySelector('#chrome');
      const col = document.querySelector('#collection');
      const mark = document.querySelector('#introMark');
      const cs = stage ? getComputedStyle(stage) : null;
      const rcs = reel ? getComputedStyle(reel) : null;
      return {
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        stageHidden: !!stage?.hidden,
        stageBg: cs?.backgroundColor,
        stageVis: cs?.visibility,
        stageDisp: cs?.display,
        reelOp: rcs?.opacity,
        iframe: !!iframe,
        chromeOp: chrome ? getComputedStyle(chrome).opacity : null,
        colOp: col ? getComputedStyle(col).opacity : null,
        markFs: mark ? getComputedStyle(mark).fontSize : null,
        markColor: mark ? getComputedStyle(mark).color : null,
      };
    })
    .catch((e) => ({ err: String(e) }));
  samples.push({ label, st });
  console.log(label, JSON.stringify(st));
};

const navP = page.goto('http://127.0.0.1:8000/index.html?_=' + Date.now(), {
  waitUntil: 'domcontentloaded',
  timeout: 25000,
});
await page.waitForSelector('body');
const start = Date.now();
for (const t of [0, 16, 33, 50, 100, 200, 400, 600, 900, 1500, 2500]) {
  const wait = start + t - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await capture(String(t).padStart(4, '0') + 'ms');
}
await navP.catch(() => {});
fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples, null, 2));
await browser.close();
console.log('wrote', OUT);
