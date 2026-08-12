
import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:8000/tcc-v2-stable.html';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1440,height:900});
await page.goto(BASE,{waitUntil:'domcontentloaded'});
await page.evaluate(()=>sessionStorage.setItem('tccIntro','1'));
await page.waitForSelector('#colgrid .tile');
await sleep(800);

await page.evaluate(()=>document.querySelector('.tile[data-id="sub3"]').click());
await sleep(900);
const hit=await page.evaluate(()=>{
  const btn=document.querySelector('#insClose');
  const r=btn.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  const topEl=document.elementFromPoint(cx,cy);
  return {
    show:btn.classList.contains('show'),
    rect:{x:r.left,y:r.top,w:r.width,h:r.height},
    topEl: topEl?`${topEl.tagName}#${topEl.id}.${topEl.className}`:null,
    zBtn:getComputedStyle(btn).zIndex,
    zChrome:getComputedStyle(document.querySelector('#chrome')).zIndex,
  };
});
console.log('CLOSE HIT', JSON.stringify(hit,null,2));

await page.evaluate(()=>closeProject());
await sleep(900);
console.log('AFTER closeProject()', await page.evaluate(()=>({
  selected:world.selected, lock:world.lock,
  open:document.querySelector('#inspect').classList.contains('open'),
  sub3vis:document.querySelector('.tile[data-id="sub3"]').style.visibility,
})));

await page.evaluate(()=>openProject('sub3'));
await sleep(900);
await page.evaluate(()=>{document.querySelector('#inspect').scrollTop=1200});
console.log('imagesY', await page.evaluate(()=>document.querySelector('#inspect').scrollTop));
await page.evaluate(()=>setDepth('idea'));
await sleep(500);
await page.evaluate(()=>{document.querySelector('#inspect').scrollTop=400});
console.log('idea after scroll', await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, ledger:world.ledger.modeY, depth:world.depth, sh:document.querySelector('#inspect').scrollHeight})));
await page.evaluate(()=>setDepth('images'));
await sleep(500);
console.log('back images', await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, ledger:world.ledger.modeY})));
await page.evaluate(()=>setDepth('idea'));
await sleep(50);
console.log('idea +50ms', await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, sh:document.querySelector('#inspect').scrollHeight, ledger:{...world.ledger.modeY}})));
await sleep(450);
console.log('idea +500ms', await page.evaluate(()=>({y:document.querySelector('#inspect').scrollTop, sh:document.querySelector('#inspect').scrollHeight, ledger:{...world.ledger.modeY}})));

await page.evaluate(()=>{document.querySelector('#inspect').scrollTop=500; openInfo()});
await sleep(400);
console.log('INFO CLOSE HIT', await page.evaluate(()=>{
  const btn=document.querySelector('#infoClose');
  const r=btn.getBoundingClientRect();
  const topEl=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {topEl:topEl?`${topEl.tagName}#${topEl.id}`:null, infoOpen:world.infoOpen};
}));
await page.evaluate(()=>closeInfo());
await sleep(400);
console.log('after info', await page.evaluate(()=>({info:world.infoOpen, ins:document.querySelector('#inspect').scrollTop})));

// Index preview ratios available
await page.evaluate(()=>{closeProject()});
await sleep(900);
await page.evaluate(()=>setView('index'));
await sleep(600);
console.log('INDEX RATIOS', await page.evaluate(()=>[...document.querySelectorAll('#colgrid .tile')].map(t=>{
  const im=t.querySelector('img');
  const r=im&&im.naturalWidth?+(im.naturalWidth/im.naturalHeight).toFixed(3):null;
  return {id:t.dataset.id,r,nw:im?.naturalWidth,nh:im?.naturalHeight};
})));

await browser.close();
