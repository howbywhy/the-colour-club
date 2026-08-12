
import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:8000/tcc-v2-stable.html';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
const rec=(s,n,st,d='')=>{results.push({s,n,st,d}); console.log(st.padEnd(7),`[${s}] ${n}${d?' — '+d:''}`);};

const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
async function fresh(){
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:900});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>sessionStorage.setItem('tccIntro','1'));
  await page.waitForSelector('#colgrid .tile');
  await sleep(500);
  return page;
}

// Close button hit-test (user-facing)
{
  const page=await fresh();
  await page.evaluate(()=>document.querySelector('.tile[data-id="sub3"]').click());
  await sleep(900);
  const hit=await page.evaluate(()=>{
    const btn=document.querySelector('#insClose');
    const r=btn.getBoundingClientRect();
    const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {top:el&&(el.id||el.tagName+(el.getAttribute('href')||'')), isClose:el===btn};
  });
  rec('E','#insClose clickable (not under chrome)', hit.isClose?'PASS':'FAIL', JSON.stringify(hit));
  // chrome InfoBtn close path for Info
  await page.evaluate(()=>openInfo());
  await sleep(300);
  await page.click('#infoBtn'); // should say Close
  await sleep(300);
  const infoClosed=await page.evaluate(()=>!world.infoOpen);
  rec('H','chrome Info button closes Info', infoClosed?'PASS':'FAIL');
  await page.close();
}

// J lateral crop-aware to another portrait + measure transition
{
  const page=await fresh();
  await page.evaluate(()=>openProject('sub3'));
  await sleep(900);
  // sample flyCrop usage mid lateral to dopa (portrait)
  const midP=page.evaluate(()=>new Promise(resolve=>{
    const orig=flyCrop;
    let seen=null;
    window.flyCrop=function(url,from,to,ms,done){
      seen={hasFrom:!!from,hasTo:!!to,ms,fromR:from?from.width/from.height:null,toR:to?to.width/to.height:null};
      return orig(url,from,to,ms,()=>{done&&done();});
    };
    document.querySelector('#stack .sth[data-id="dopa"]').click();
    setTimeout(()=>{window.flyCrop=orig; resolve(seen);},500);
  }));
  const mid=await midP;
  await sleep(400);
  const end=await page.evaluate(()=>{
    const hero=document.querySelector('#heroImg');
    const ih=document.querySelector('#insHero').getBoundingClientRect();
    const nw=hero.naturalWidth, nh=hero.naturalHeight;
    return {selected:world.selected, distort:nw&&nh?Math.abs((ih.width/ih.height)-(nw/nh))>0.08:null, ghost:document.querySelector('#ghost').children.length};
  });
  rec('J','lateral uses flyCrop (crop-aware)', mid&&mid.hasFrom&&mid.hasTo?'PASS':'FAIL', JSON.stringify(mid));
  rec('J','lateral portrait end state no distort', (end.selected==='dopa'&&!end.distort&&end.ghost===0)?'PASS':'FAIL', JSON.stringify(end));

  // openProject uses fly (rubber-sheet) — document as risk not necessarily bug
  await page.evaluate(()=>closeProject());
  await sleep(900);
  const openFly=await page.evaluate(()=>new Promise(resolve=>{
    const orig=fly; let seen=null;
    window.fly=function(url,from,to,ms,done){seen={sx:from&&to?from.width/to.width:null,sy:from&&to?from.height/to.height:null,nonUniform:from&&to?Math.abs((from.width/to.width)-(from.height/to.height))>0.05:null}; return orig(url,from,to,ms,done)};
    document.querySelector('.tile[data-id="microsoft"]').click();
    setTimeout(()=>{window.fly=orig; resolve(seen);},200);
  }));
  await sleep(700);
  rec('J','openProject flight notes (fly not flyCrop)', openFly?'PARTIAL':'PARTIAL', JSON.stringify(openFly));
  await page.close();
}

// K history
{
  const page=await fresh();
  await page.evaluate(()=>{setFilter('hospitality');});
  await sleep(700);
  await page.evaluate(()=>setView('index'));
  await sleep(500);
  await page.evaluate(()=>openProject('dopa'));
  await sleep(900);
  await page.evaluate(()=>setDepth('idea'));
  await sleep(400);
  await page.evaluate(()=>openInfo());
  await sleep(300);
  let s=await page.evaluate(()=>({hash:location.hash, ...{selected:world.selected,depth:world.depth,info:world.infoOpen,view:world.view,sector:world.sector}}));
  rec('K','URL Info over Idea', (s.hash.includes('dopa/idea')&&s.hash.includes('info')&&s.info)?'PASS':'FAIL', s.hash);
  await page.goBack(); await sleep(500);
  s=await page.evaluate(()=>({hash:location.hash,selected:world.selected,depth:world.depth,info:world.infoOpen,lock:world.lock}));
  rec('K','Back Info→Idea', (s.selected==='dopa'&&s.depth==='idea'&&!s.info)?'PASS':'FAIL', JSON.stringify(s));
  await page.goBack(); await sleep(700);
  s=await page.evaluate(()=>({selected:world.selected,depth:world.depth,info:world.infoOpen}));
  rec('K','Back Idea→Images', (s.selected==='dopa'&&s.depth==='images')?'PASS':'FAIL', JSON.stringify(s));
  await page.goBack(); await sleep(700);
  s=await page.evaluate(()=>({selected:world.selected,view:world.view,sector:world.sector,hash:location.hash}));
  rec('K','Back project→Index hospitality', (!s.selected&&s.view==='index'&&s.sector==='hospitality')?'PASS':'FAIL', JSON.stringify(s));
  await page.goForward(); await sleep(700);
  s=await page.evaluate(()=>({selected:world.selected,depth:world.depth,lock:world.lock}));
  rec('K','Forward→project Images', (s.selected==='dopa'&&s.depth==='images')?'PASS':'FAIL', JSON.stringify(s));
  rec('K','no stuck lock after history', !s.lock?'PASS':'FAIL');
  await page.close();
}

// L chaos
{
  const page=await fresh();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  for(const sec of ['spatial','hospitality','fmcg','all','spatial']){
    await page.evaluate(s=>setFilter(s),sec); await sleep(200);
  }
  await sleep(500);
  await page.evaluate(()=>openProject('sub3')); await sleep(500);
  await page.evaluate(()=>{setDepth('idea'); setDepth('images');}); await sleep(200);
  await page.evaluate(()=>lateral('dopa')); await sleep(200);
  await page.evaluate(()=>lateral('roy')); await sleep(200);
  await page.goBack(); await sleep(200);
  await page.goForward(); await sleep(500);
  await sleep(1600);
  const final=await page.evaluate(()=>{
    const hidden=[...document.querySelectorAll('#colgrid .tile')].filter(t=>t.style.visibility==='hidden'&&t.dataset.id!==world.selected).map(t=>t.dataset.id);
    return {lock:world.lock,selected:world.selected,ghost:document.querySelector('#ghost').children.length,hidden,hash:location.hash};
  });
  rec('L','chaos no stuck lock/ghost/stale', (!final.lock&&final.ghost===0&&final.hidden.length===0)?'PASS':'FAIL', JSON.stringify(final));
  rec('L','no uncaught JS errors', errors.length===0?'PASS':'FAIL', errors.join(' | '));
  await page.close();
}

// Index hover preview outline natural shape already passed for portrait.
// Document cover-ratio limitation
rec('D','cover set ratio diversity for preview matrix','PARTIAL','all 10 cover assets measure ~0.8 portrait; sq/land/deep covers unavailable in current harvest');

console.log('\nDONE', JSON.stringify(results.reduce((a,r)=>{a[r.st]=(a[r.st]||0)+1;return a},{})));
await browser.close();
