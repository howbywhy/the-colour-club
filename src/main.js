import { loadProjects } from './data/projects.js';
import { world, RM, D, $, acquire, release, withLock } from './state/worldState.js';
import { createRouter } from './state/routing.js';
import {
  TIMING,
  fly as flyRaw,
  flyCrop as flyCropRaw,
  flipTiles as flipTilesRaw,
  createFlightTable,
  cancelElementAnims,
  endIntro,
} from './motion/transitions.js';
import { createProjectMedia } from './components/ProjectMedia.js';
import { createIndex } from './components/Index.js';
import { freezeForInfo, restoreAfterInfo, saveViewScroll, resetModeY } from './state/scrollLedger.js';

/* Mutable flight hooks — window patches (QA) and lexical calls share one table. */
const { flights, fly, flyCrop } = createFlightTable(flyRaw, flyCropRaw);

let P, CAPS, CDN, byId;

/* ============================================================
   DATA — real TCC content, crawled 11 Aug 2026
   ============================================================ */
/* ============================================================
   WORLD — single source of truth
   ============================================================ */

export async function boot() {
  const data = await loadProjects();
  CDN = data.cdn;
  CAPS = data.caps;
  P = data.projects;
byId={};P.forEach(p=>byId[p.id]=p);
const media = createProjectMedia({ cdn: CDN });
const {
  dimOf, alocal, aremote, setImg, imgTag, src0, aclass, classFromDim,
  applyHeroGeometry, bindClassify, sweep, galleryHtml,
} = media;
bindClassify();
/* The Colour Club interaction deck — colour points at work, advancing per encounter */
const HUES=['#4E5FFD','#E23A2E','#0F8A46','#F0740A','#C4258F','#7E30D8','#0F7E93'];
let hueI=0;
const nextHue=()=>HUES[hueI++%HUES.length];

/* ============================================================
   BUILD COLLECTION
   ============================================================ */
const grid=$('#colgrid');
function flipTiles(mutate,opts){ return flipTilesRaw(grid, mutate, opts); }
const index = createIndex({
  grid,
  getById: () => byId,
  media,
  nextHue,
  flipTiles,
  onDbg: () => dbg(),
});
const { attachPreview, sortIndex, bindSortHeaders } = index;

P.forEach(p=>{
  const t=document.createElement('article');
  const coverClass=classFromDim(p,0);
  t.className='tile '+p.emp+(coverClass?' '+coverClass:''); t.dataset.id=p.id; t.tabIndex=0;
  t.setAttribute('role','button'); t.setAttribute('aria-label','Open '+p.name);
  t.innerHTML=`<div class="ph">${imgTag(p,0,'loading="lazy" alt="'+p.name+'"')}</div>
    <div class="lbl"><span class="nm">${p.name}</span><span class="st">${p.strap}</span>
    <span class="ix sec">${p.sector}</span><span class="ix sco">${p.deliv.slice(0,3).join(' · ')}${p.deliv.length>3?' +'+(p.deliv.length-3):''}</span></div>`;
  t.addEventListener('click',()=>openProject(p.id));
  t.addEventListener('keydown',e=>{if(e.key==='Enter')openProject(p.id)});
  attachPreview(t, p);
  grid.appendChild(t);
});
sweep(grid);
/* index column order inside label when .x is active is handled by display:contents */

/* stack (archive during inspect) — 4:5 nav thumbs via CSS */
const stack=$('#stack');
function buildStack(exceptId){
  stack.innerHTML='';
  const cap=document.createElement('div');cap.className='cap';cap.textContent='TCC';stack.appendChild(cap);
  P.filter(p=>p.id!==exceptId).forEach(p=>{
    const s=document.createElement('div');s.className='sth';s.dataset.id=p.id;
    s.innerHTML=`${imgTag(p,0,'alt=""')}<span class="tip">${p.name}</span>`;
    s.addEventListener('mouseenter',()=>s.style.setProperty('--hue',nextHue()));
    s.addEventListener('click',()=>lateral(p.id));
    stack.appendChild(s);
  });
}

/* info capabilities */
const caps=$('#caps');
CAPS.forEach(([n,ids])=>{
  const d=document.createElement('div');d.className='capgrp';
  d.innerHTML=`<div class="cn">${n}</div><div class="proof">${ids.filter(i=>byId[i]).map(i=>`<button data-open="${i}">${byId[i].name}</button>`).join('')}</div>`;
  caps.appendChild(d);
  d.querySelectorAll('button').forEach(b=>b.addEventListener('mouseenter',()=>b.style.setProperty('--hue',nextHue())));
});
caps.addEventListener('click',e=>{
  const b=e.target.closest('[data-open]');if(!b)return;
  closeInfo(()=>{ world.selected? lateral(b.dataset.open) : openProject(b.dataset.open); });
});

/* ============================================================
   FLIP HELPERS — flipTiles bound above with Index
   ============================================================ */

/* ============================================================
   STATE TRANSITIONS
   ============================================================ */
function setView(v,quiet){
  if(world.view===v||world.selected)return;
  if(quiet){
    saveViewScroll();
    document.body.classList.toggle('x',v==='index');document.body.classList.toggle('g',v==='field');
    world.view=v;$('#viewBtn').textContent=v==='index'?'Visual':'Index';dbg();return;
  }
  endIntro();
  if(!withLock('view:'+world.view+'→'+v,()=>{
    saveViewScroll();
    flipTiles(()=>{document.body.classList.toggle('x',v==='index');document.body.classList.toggle('g',v==='field')});
    world.view=v;
    $('#viewBtn').textContent = v==='index'?'Visual':'Index';
    setTimeout(release,D(TIMING.view));
    syncHash(); dbg();
  })) return;
}

const SECTORS=['hospitality','fmcg','spatial'];
/* Filter transition coordinator — latest intent wins; completion via animation promises. */
const filterCtrl={
  phase:'idle', /* idle | leaving | flipping | entering */
  target:null,
  gen:0,
  leavers:0,
  survivors:0,
  enterers:0,
  animCount:0,
  ownedLock:false,
};
function filterWillShow(sec,t){ return sec==='all' || byId[t.dataset.id].cat===sec; }
function applyFilterLayout(sec){
  document.body.classList.toggle('filtered',sec!=='all');
  [...grid.querySelectorAll('.tile')].forEach(t=>{
    t.classList.toggle('fhide',!filterWillShow(sec,t));
    t.style.opacity='';
    t.style.transform='';
  });
}
function cancelFilterMotion(){
  cancelElementAnims(grid.querySelectorAll('.tile'));
  filterCtrl.animCount=0;
}
function beginFilterLock(){
  if(!world.lock) acquire();
  else{
    clearTimeout(world._wd);
    world._wd=setTimeout(()=>{ world.lock=false; filterCtrl.ownedLock=false; }, TIMING.watchdog);
  }
  filterCtrl.ownedLock=true;
}
function endFilterLock(){
  if(!filterCtrl.ownedLock)return;
  filterCtrl.ownedLock=false;
  release();
}
async function transitionFilter(sec,gen){
  beginFilterLock();
  filterCtrl.target=sec;
  const tiles=[...grid.querySelectorAll('.tile')];
  const leaving=tiles.filter(t=>!t.classList.contains('fhide')&&!filterWillShow(sec,t));
  const survivors=tiles.filter(t=>!t.classList.contains('fhide')&&filterWillShow(sec,t));
  const entering=tiles.filter(t=>t.classList.contains('fhide')&&filterWillShow(sec,t));
  filterCtrl.leavers=leaving.length;
  filterCtrl.survivors=survivors.length;
  filterCtrl.enterers=entering.length;
  const sy0=scrollY;
  dbg();
  try{
    /* BEFORE — survivors only */
    const before=new Map();
    survivors.forEach(t=>before.set(t,t.getBoundingClientRect()));

    /* LEAVE — primary beat: non-matching work resolves out */
    filterCtrl.phase='leaving'; dbg();
    if(!RM && leaving.length){
      const leaveWait=leaving.map(t=>{
        const an=t.animate(
          [{opacity:1},{opacity:0}],
          {duration:TIMING.filterLeave,easing:TIMING.filterEase,fill:'forwards'}
        );
        return an.finished.then(()=>{
          t.style.opacity='0';
          try{ an.cancel(); }catch(_){}
        },()=>{ /* cancelled by newer filter */ });
      });
      filterCtrl.animCount=leaving.length; dbg();
      await Promise.allSettled(leaveWait);
      if(gen!==filterCtrl.gen)return;
      leaving.forEach(t=>{ t.style.opacity='0'; });
    }else{
      leaving.forEach(t=>{ t.style.opacity='0'; });
    }

    if(gen!==filterCtrl.gen)return;

    /* MUTATE — leavers out of flow; enterers in at opacity 0 */
    filterCtrl.phase='flipping'; dbg();
    document.body.classList.toggle('filtered',sec!=='all');
    tiles.forEach(t=>{
      const show=filterWillShow(sec,t);
      t.classList.toggle('fhide',!show);
      if(!show){ t.style.opacity=''; t.style.transform=''; }
    });
    entering.forEach(t=>{ t.style.opacity='0'; });
    survivors.forEach(t=>{ t.style.opacity=''; });
    void grid.offsetHeight;

    /* PLAY — survivors settle only meaningful gaps; enterers fade at destination */
    filterCtrl.phase='entering';
    const flipWait=[];
    const enterWait=[];
    const moveMin=TIMING.filterMoveMin||16;
    /* Mobile: leave + enter fade only — vertical collapse snaps (no layout choreography) */
    const narrow=matchMedia('(max-width:767px)').matches;
    const moveMax=narrow?0:(TIMING.filterMoveMax||240);
    if(!RM){
      survivors.forEach(t=>{
        const b=before.get(t), a=t.getBoundingClientRect();
        if(!b||a.width===0||b.width===0)return;
        const dx=b.left-a.left, dy=b.top-a.top;
        const dist=Math.hypot(dx,dy);
        /* Tiny corrections snap; large row-collapses snap — both cheaper than choreography */
        if(dist<moveMin||dist>moveMax)return;
        const an=t.animate(
          [{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],
          {duration:TIMING.filterFlip,easing:TIMING.filterEase}
        );
        flipWait.push(an.finished.then(()=>{
          try{ an.cancel(); }catch(_){}
          t.style.transform='';
        },()=>{ /* cancelled */ }));
      });
      entering.forEach(t=>{
        const an=t.animate(
          [{opacity:0},{opacity:1}],
          {duration:TIMING.filterEnter,easing:TIMING.filterEase,fill:'forwards'}
        );
        enterWait.push(an.finished.then(()=>{
          t.style.opacity='1';
          try{ an.cancel(); }catch(_){}
          t.style.opacity='';
        },()=>{ /* cancelled by newer filter */ }));
      });
    }
    const allWait=[...flipWait,...enterWait];
    filterCtrl.animCount=allWait.length; dbg();
    if(allWait.length) await Promise.allSettled(allWait);
    if(gen!==filterCtrl.gen)return;

    /* COMMIT — DOM/CSS alone represent the result */
    survivors.forEach(t=>{
      t.getAnimations().forEach(a=>{ try{ a.cancel(); }catch(_){} });
      t.style.transform='';
      t.style.opacity='';
    });
    entering.forEach(t=>{
      t.getAnimations().forEach(a=>{ try{ a.cancel(); }catch(_){} });
      t.style.opacity='';
    });
    leaving.forEach(t=>{ t.style.opacity=''; });

    if(Math.abs(scrollY-sy0)>0) scrollTo(0,sy0);

    filterCtrl.phase='idle';
    filterCtrl.target=null;
    filterCtrl.animCount=0;
    filterCtrl.leavers=0;
    filterCtrl.survivors=0;
    filterCtrl.enterers=0;
    endFilterLock();
    dbg();
  }catch(err){
    console.error('[tcc] filter',err);
    if(gen!==filterCtrl.gen)return;
    cancelFilterMotion();
    applyFilterLayout(sec);
    filterCtrl.phase='idle';
    filterCtrl.target=null;
    filterCtrl.animCount=0;
    endFilterLock();
    dbg();
  }
}
function setFilter(sec,quiet){
  /* Router path — instant reconcile; cancel any in-flight filter motion */
  if(quiet){
    filterCtrl.gen++;
    cancelFilterMotion();
    world.sector=sec; world.last='filter:'+sec;
    document.querySelectorAll('#filters .fbtn').forEach(b=>b.classList.toggle('on',b.dataset.f===sec));
    applyFilterLayout(sec);
    filterCtrl.phase='idle';
    filterCtrl.target=null;
    filterCtrl.animCount=0;
    endFilterLock();
    dbg();
    return;
  }
  endIntro();
  /* Active label responds immediately; gallery follows */
  const alreadyThere=world.sector===sec && (filterCtrl.phase==='idle' || filterCtrl.target===sec);
  if(alreadyThere)return;
  /* Another non-filter transition owns the lock */
  if(world.lock && filterCtrl.phase==='idle')return;

  world.sector=sec; world.last='filter:'+sec;
  document.querySelectorAll('#filters .fbtn').forEach(b=>b.classList.toggle('on',b.dataset.f===sec));
  syncHash(); dbg();

  if(RM){
    applyFilterLayout(sec);
    return;
  }

  /* Latest intent wins — cancel in-flight filter, restart from current visual state */
  if(filterCtrl.phase!=='idle') cancelFilterMotion();
  const gen=++filterCtrl.gen;
  transitionFilter(sec,gen);
}
document.querySelectorAll('#filters .fbtn').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.f)));
function populateInspect(p){
  setImg($('#heroImg'),p,0);
  $('#mClient').textContent=p.name;
  $('#mStrap').textContent=p.strap;
  $('#mDeliv').innerHTML=p.deliv.join('<br>');
  $('#mCred').textContent=p.cred||'';$('#mCred').style.display=p.cred?'block':'none';
  $('#beats').innerHTML=`<div id="ideaLede">${p.lede||''}</div>`+
    p.beats.map(([k,tx],i)=>`<div class="beat s-${'abcde'[i]||'e'}"><div class="bk">${k}</div><p>${tx}</p></div>`).join('');
  $('#gal').innerHTML=galleryHtml(p);
  $('#mImages').classList.add('on');$('#mIdea').classList.remove('on');
  $('#mIdea').style.display=p.beats.length?'block':'none';
  buildStack(p.id);
  applyHeroGeometry(p);
  const hero=$('#heroImg'); const hd=dimOf(p,0);
  if(hd){ hero.width=hd.width; hero.height=hd.height; }
  sweep($('#inspect'));
}

function openProject(id,quiet){
  if(world.selected)return;
  const p=byId[id];
  if(!p){ console.warn('[tcc] unknown project', id); return; }
  if(quiet){
    world.ledger[world.view+'Y']=scrollY;world.ledger.slot=id;resetModeY();
    document.body.classList.add('locked');document.body.classList.add('proj');
    populateInspect(p);
    const ins=$('#inspect');ins.classList.remove('idea');ins.scrollTop=0;
    const tile=grid.querySelector(`.tile[data-id="${id}"]`);
    applyHeroGeometry(p);
    if(tile)tile.style.visibility='hidden';
    $('#heroImg').style.opacity=1;ins.classList.add('open','ready');
    stack.classList.add('show');$('#insClose').classList.add('show');
    world.selected=id;world.depth='images';dbg();return;
  }
  endIntro();
  if(world.lock)return;
  if(!withLock('open:'+id,()=>{
    const tile=grid.querySelector(`.tile[data-id="${id}"]`);
    const from=tile?tile.querySelector('.ph').getBoundingClientRect():null;
    const flysrc=tile?src0(tile):aremote(p,0);
    world.ledger[world.view+'Y']=scrollY; world.ledger.slot=id;
    document.body.classList.add('locked');document.body.classList.add('proj');
    resetModeY();
    const ins=$('#inspect');
    populateInspect(p);
    ins.classList.remove('idea');
    ins.scrollTop=0; ins.classList.add('open');
    applyHeroGeometry(p);
    const to=$('#insHero').getBoundingClientRect();
    $('#heroImg').style.opacity=0;
    if(tile)tile.style.visibility='hidden';
    fly(flysrc,from,to,D(TIMING.open),()=>{
      $('#heroImg').style.opacity=1;
      ins.classList.add('ready');
      stack.classList.add('show'); $('#insClose').classList.add('show');
      world.selected=id;world.depth='images';release();
      syncHash(); dbg();
    });
  })) return;
}
function closeProject(quiet){
  if(!world.selected)return;
  if(quiet){
    const tile=grid.querySelector(`.tile[data-id="${world.selected}"]`);
    if(tile)tile.style.visibility='';
    document.body.classList.remove('locked','proj');
    const ins=$('#inspect');ins.classList.remove('open','ready','idea');
    stack.classList.remove('show');$('#insClose').classList.remove('show');
    world.selected=null;world.depth='images';dbg();return;
  }
  if(world.lock)return;
  acquire();world.last='close:'+world.selected;
  const id=world.selected,p=byId[id];
  const ins=$('#inspect');
  const tile=grid.querySelector(`.tile[data-id="${id}"]`);
  ins.classList.remove('ready');            // fade subordinate content
  document.body.classList.remove('proj');
  stack.classList.remove('show');$('#insClose').classList.remove('show');
  const fromImages=world.depth!=='idea';
  const from=fromImages?$('#insHero').getBoundingClientRect():null;
  const flysrc=src0($('#insHero'));
  setTimeout(()=>{
    document.body.classList.remove('locked');       // scroll position was never destroyed
    const to=tile?tile.querySelector('.ph').getBoundingClientRect():null;
    ins.classList.remove('open');
    fly(flysrc,from,fromImages?to:null,D(TIMING.close),()=>{
      if(tile)tile.style.visibility='';
      world.selected=null;world.depth='images';release();
      syncHash(); dbg();
    });
  },D(TIMING.closeFade));
}
function lateral(id,quiet){
  if(!world.selected||world.selected===id)return;
  const p=byId[id];
  if(!p){ console.warn('[tcc] unknown project', id); return; }
  if(quiet){
    const keep=world.depth;
    const old=grid.querySelector(`.tile[data-id="${world.selected}"]`);if(old)old.style.visibility='';
    world.ledger.slot=id;resetModeY();
    populateInspect(p);
    const ins=$('#inspect');ins.classList.toggle('idea',keep==='idea');
    $('#mIdea').classList.toggle('on',keep==='idea');$('#mImages').classList.toggle('on',keep!=='idea');
    ins.scrollTop=0;$('#heroImg').style.opacity=1;ins.classList.add('ready');
    const nt=grid.querySelector(`.tile[data-id="${id}"]`);if(nt)nt.style.visibility='hidden';
    world.selected=id;world.depth=keep;dbg();return;
  }
  if(world.lock)return;
  if(!withLock('lateral:'+world.selected+'→'+id,()=>{
    const oldTile=grid.querySelector(`.tile[data-id="${world.selected}"]`);
    if(oldTile)oldTile.style.visibility='';
    const sth=stack.querySelector(`.sth[data-id="${id}"]`);
    const from=sth?sth.getBoundingClientRect():null;
    const flysrc=sth?src0(sth):aremote(p,0);
    const keep=world.depth;
    const ins=$('#inspect');
    ins.classList.remove('ready');
    setTimeout(()=>{
      resetModeY();
      populateInspect(p);
      if(keep==='idea'){ins.classList.add('idea');$('#mIdea').classList.add('on');$('#mImages').classList.remove('on')}
      else ins.classList.remove('idea');
      ins.scrollTop=0;
      applyHeroGeometry(p);
      const to=$('#insHero').getBoundingClientRect();
      $('#heroImg').style.opacity=0;
      const nt=grid.querySelector(`.tile[data-id="${id}"]`); if(nt)nt.style.visibility='hidden';
      world.ledger.slot=id;
      flyCrop(flysrc,keep==='idea'?null:from,keep==='idea'?null:to,D(TIMING.lateral),()=>{
        $('#heroImg').style.opacity=1; ins.classList.add('ready');
        world.selected=id;world.depth=keep;release();
        syncHash(); dbg();
      });
    },D(TIMING.lateralFade));
  })) return;
}
function setDepth(d,quiet){
  if(!world.selected||world.depth===d)return;
  const ins=$('#inspect');
  if(world.ledger.modeY)world.ledger.modeY[world.depth]=ins.scrollTop;
  world.depth=d;world.last='depth:'+d;
  /* Idea/#story expands after class toggle — restore scroll once layout can accept it */
  const restoreY=()=>{
    const y=(world.ledger.modeY&&world.ledger.modeY[d])||0;
    ins.scrollTop=y;
    if(d==='idea'&&y>0&&Math.abs(ins.scrollTop-y)>1){
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ins.scrollTop=y;
        if(Math.abs(ins.scrollTop-y)>1) setTimeout(()=>{ins.scrollTop=y},D(TIMING.ideaRestore));
      }));
    }
  };
  if(quiet){
    ins.classList.toggle('idea',d==='idea');
    $('#mImages').classList.toggle('on',d==='images');
    $('#mIdea').classList.toggle('on',d==='idea');
    restoreY(); dbg();return;
  }
  ins.classList.remove('ready');
  setTimeout(()=>{
    ins.classList.toggle('idea',d==='idea');
    $('#mImages').classList.toggle('on',d==='images');
    $('#mIdea').classList.toggle('on',d==='idea');
    ins.classList.add('ready');
    restoreY();
  },D(TIMING.depth));
  if(!quiet)syncHash(); dbg();
}
function openInfo(quiet){
  if(world.infoOpen)return;
  if(!quiet) endIntro();
  world.infoOpen=true;world.last='info:open';
  freezeForInfo();
  document.body.classList.add('info');
  $('#infoBtn').textContent='Close';
  if(!quiet)syncHash(); dbg();
}
function closeInfo(then,quiet){
  if(!world.infoOpen){then&&then();return}
  world.infoOpen=false;world.last='info:close';
  document.body.classList.remove('info');
  $('#infoBtn').textContent='Info';
  /* the world beneath must resume exactly where it froze */
  restoreAfterInfo();
  if(!quiet)syncHash(); dbg();
  then&&setTimeout(then,D(TIMING.infoThen));
}

/* ============================================================
   URL — hash routing (URL ↔ world; no animation ownership)
   ============================================================ */
const { syncHash, applyHash } = createRouter({
  getById: () => byId,
  sectors: SECTORS,
  getActions: () => ({
    openProject, closeProject, setView, setFilter, setDepth, lateral, openInfo, closeInfo, dbg,
  }),
});
addEventListener('hashchange', applyHash);

/* ============================================================
   CHROME + KEYS + CLOCK + DEBUG
   ============================================================ */
$('#brandBtn').addEventListener('click',()=>{ // return to club arrangement
  closeInfo(()=>{ if(world.selected)closeProject(); 
    setTimeout(()=>{setView('field');scrollTo({top:0,behavior:RM?'auto':'smooth'})},D(TIMING.brandDelay)); });
});
$('#viewBtn').addEventListener('click',()=>{
  const act=()=>{ if(world.selected){closeProject();setTimeout(()=>setView(world.view==='field'?'index':'field'),D(TIMING.viewAfterClose))}
    else setView(world.view==='field'?'index':'field'); };
  if(world.infoOpen)closeInfo(act); else act();
});
$('#infoBtn').addEventListener('click',()=>world.infoOpen?closeInfo():openInfo());
$('#infoClose').addEventListener('click',()=>closeInfo());
$('#infoScrim').addEventListener('click',()=>closeInfo());
$('#insClose').addEventListener('click',()=>closeProject());
$('#mImages').addEventListener('click',()=>setDepth('images'));
$('#mIdea').addEventListener('click',()=>setDepth('idea'));
bindSortHeaders();
addEventListener('keydown',e=>{
  if(e.key==='Escape'){ if(world.infoOpen)closeInfo(); else if(world.selected&&world.depth==='idea')setDepth('images'); else if(world.selected)closeProject(); }
  if(e.key.toLowerCase()==='d'&&!e.metaKey&&!e.ctrlKey)toggleDbg();
});
setInterval(()=>{const n=new Date();
  $('#clock').textContent=n.toLocaleDateString('en-AU',{day:'2-digit',month:'short'})+' '+n.toTimeString().slice(0,8);},1000);

/* debug */
let dbgOn=false;
function toggleDbg(){dbgOn=!dbgOn;$('#debug').classList.toggle('on',dbgOn);dbg()}
function dbg(){
  if(!dbgOn)return;
  const modeY=world.ledger.modeY||{};
  const animLive=[...grid.querySelectorAll('.tile')].reduce((n,t)=>n+(t.getAnimations?t.getAnimations().length:0),0);
  $('#debug').innerHTML=
`<span class="h">WORLD STATE</span>
view        ${world.view}${world.sort?' (sort:'+world.sort+')':''}
sector      ${world.sector}
selected    ${world.selected||'null'}
depth       ${world.selected?world.depth:'—'}
infoOpen    ${world.infoOpen}
lock        ${world.lock}
last        ${world.last}
<span class="h">FILTER</span>
phase       ${filterCtrl.phase}
target      ${filterCtrl.target||'—'}
pending     — (latest-wins)
leavers     ${filterCtrl.leavers}
survivors   ${filterCtrl.survivors}
enterers    ${filterCtrl.enterers}
anims       ${filterCtrl.animCount} (live ${animLive})
<span class="h">LEDGER</span>
fieldY      ${Math.round(world.ledger.fieldY||0)}
indexY      ${Math.round(world.ledger.indexY||0)}
imagesY     ${Math.round(modeY.images||0)}
ideaY       ${Math.round(modeY.idea||0)}
slot        ${world.ledger.slot||'null'}
route       ${location.hash||'#/'}</span>`;
}

/* boot — intro plays only on a genuine first entry to the front of the site */
(function(){
  const deep=location.hash&&location.hash!=='#/';
  const seen=sessionStorage.getItem('tccIntro');
  if(!deep&&!seen&&!RM){
    document.body.classList.add('intro');
    setTimeout(()=>document.body.classList.remove('intro'),TIMING.intro);
  }
  try{sessionStorage.setItem('tccIntro','1')}catch(e){}
})();
if(location.hash&&location.hash!=='#/')applyHash(); dbg();
  /* debug / QA surface — same object as the module world, not a second state */
  window.world = world;
  window.openProject = openProject;
  window.closeProject = closeProject;
  window.setDepth = setDepth;
  window.setFilter = setFilter;
  window.filterCtrl = filterCtrl;
  window.setView = setView;
  window.openInfo = openInfo;
  window.closeInfo = closeInfo;
  window.lateral = lateral;
  Object.defineProperty(window, 'fly', {
    get() { return flights.fly; },
    set(fn) { flights.fly = fn; },
    configurable: true,
  });
  Object.defineProperty(window, 'flyCrop', {
    get() { return flights.flyCrop; },
    set(fn) { flights.flyCrop = fn; },
    configurable: true,
  });
}
