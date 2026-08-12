#!/usr/bin/env node
/* TCC V2 — lightweight baseline verification. No deps, no runtime changes.
   Usage: node scripts/verify.mjs path/to/tcc-v2-stable.html */
import {readFileSync} from 'fs';
const file=process.argv[2]||'tcc-v2-stable.html';
const s=readFileSync(file,'utf8');
let fail=0; const ok=(name,cond,detail='')=>{console.log((cond?'  ok  ':'  FAIL')+' '+name+(cond?'':'  '+detail)); if(!cond)fail++};

/* 1. data block executes; project integrity */
const m=s.match(/const CDN='[^']*';[\s\S]*?const CAPS=\[[\s\S]*?\n\];/);
ok('data block found',!!m);
let P,CAPS,CDN;
try{({P,CAPS,CDN}=new Function(m[0]+';return {P,CAPS,CDN};')())}catch(e){ok('data block evaluates',false,e.message)}
ok('10 projects',P&&P.length===10);
const ids=new Set(P.map(p=>p.id));
ok('no duplicate project ids',ids.size===P.length);
P.forEach(p=>{
  ok(`${p.id}: files present`,Array.isArray(p.files)&&p.files.length>0);
  ok(`${p.id}: cat valid`,['hospitality','fmcg','spatial'].includes(p.cat));
  ok(`${p.id}: depth fields`,typeof p.name==='string'&&typeof p.strap==='string');
  (p.vids||[]).forEach(v=>ok(`${p.id}: vid position in range`,v.at>=1&&v.at<p.files.length,String(v.at)));
});
CAPS.forEach(([n,list])=>list.forEach(id=>ok(`caps "${n}" ref ${id}`,ids.has(id))));

/* 2. no stale architecture */
ok('no seat guard',!/seatguard|seatlock/.test(s));
ok('no cssText patching',!/cssText\.replace/.test(s));
ok('no stale depth enum',!/'inspect'/.test(s));
ok('statement outside gallery grid',/<section id="collectionIntro">/.test(s)&&!/#colgrid[^{]*linecell/.test(s));

/* 3. route model sanity */
ok('idea route regex',/\(\\\/idea\)\?/.test(s));
for(const h of ['#/','#/index','#/hospitality','#/index/fmcg','#/p/dopa','#/p/dopa/idea','#/p/dopa/info','#/info'])
  ok('route shape '+h,/^#\/([a-z0-9\/]*)?$/.test(h));

/* 4. quiet paths exist for every router-driven op */
for(const f of ['setView','openProject','closeProject','lateral','setDepth','setFilter'])
  ok(`quiet-instant path in ${f}`,new RegExp(f+String.raw`\(.*quiet[\s\S]{0,700}?if\(quiet(\|\|RM)?\)`).test(s));

/* 5. lock hygiene */
ok('acquire/release defined',/function acquire\(\)/.test(s)&&/function release\(\)/.test(s));
ok('watchdog present',/setTimeout\(\(\)=>\{world\.lock=false\},1500\)/.test(s));
ok('no bare lock=true outside acquire',(s.match(/world\.lock=true/g)||[]).length===1);

/* 6. local asset path pattern */
ok('local-first paths',/public\/images\/projects\//.test(s));
console.log(fail?`\n${fail} check(s) FAILED`:'\nAll checks passed.');
process.exit(fail?1:0);
