
import puppeteer from 'puppeteer-core';
const BASE=process.env.TCC_URL||'http://127.0.0.1:8000/tcc-v2-dev.html';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1440,height:900});
await page.goto(BASE,{waitUntil:'domcontentloaded'});
await page.evaluate(()=>sessionStorage.setItem('tccIntro','1'));
await page.waitForSelector('#colgrid .tile');
await sleep(600);

// BUG-01
await page.evaluate(()=>document.querySelector('.tile[data-id="sub3"]').click());
await sleep(900);
const hit=await page.evaluate(()=>{
  const btn=document.querySelector('#insClose');
  const r=btn.getBoundingClientRect();
  const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {isClose:el===btn, top:el&&(el.id||el.tagName+(el.getAttribute('href')||'')), z:getComputedStyle(btn).zIndex};
});
console.log('BUG01 Close hit', hit.isClose?'PASS':'FAIL', hit);

// click Close for real
await page.click('#insClose');
await sleep(900);
console.log('BUG01 Close click', await page.evaluate(()=>({selected:world.selected, open:document.querySelector('#inspect').classList.contains('open')})));

// BUG-02
await page.evaluate(()=>openProject('sub3'));
await sleep(900);
await page.evaluate(()=>{document.querySelector('#inspect').scrollTop=1200});
const yImages1=await page.evaluate(()=>document.querySelector('#inspect').scrollTop);
await page.evaluate(()=>setDepth('idea'));
await sleep(500);
await page.evaluate(()=>{document.querySelector('#inspect').scrollTop=400});
const yIdea1=await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, ledger:world.ledger.modeY}));
await page.evaluate(()=>setDepth('images'));
await sleep(500);
const yImages2=await page.evaluate(()=>document.querySelector('#inspect').scrollTop);
await page.evaluate(()=>setDepth('idea'));
await sleep(700);
const yIdea2=await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, ledger:world.ledger.modeY, sh:document.querySelector('#inspect').scrollHeight}));
const memOk=Math.abs(yImages2-yImages1)<=2 && Math.abs(yIdea2.y-yIdea1.y)<=2;
console.log('BUG02 memory', memOk?'PASS':'FAIL', {yImages1,yImages2,yIdea1,yIdea2});

// regression: filters statement + open/close another project + history snippet
await page.evaluate(()=>closeProject());
await sleep(900);
const stmt0=await page.evaluate(()=>document.querySelector('#collectionIntro').getBoundingClientRect().top);
await page.evaluate(()=>setFilter('hospitality'));
await sleep(700);
const stmt1=await page.evaluate(()=>document.querySelector('#collectionIntro').getBoundingClientRect().top);
console.log('REG filter statement', Math.abs(stmt1-stmt0)<=2?'PASS':'FAIL', {stmt0,stmt1});
await page.evaluate(()=>openProject('dopa'));
await sleep(800);
await page.click('#insClose');
await sleep(900);
console.log('REG dopa close', await page.evaluate(()=>({selected:world.selected, vis:document.querySelector('.tile[data-id="dopa"]').style.visibility})));

await browser.close();
