
import puppeteer from 'puppeteer-core';
import {readFileSync, mkdirSync, writeFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root=fileURLToPath(new URL('..', import.meta.url));
const html=readFileSync(join(root,'tcc-v2-dev.html'),'utf8');
const m=html.match(/const CDN='[^']*';[\s\S]*?const CAPS=\[[\s\S]*?\n\];/);
const {P,CDN}=new Function(m[0]+';return {P,CDN};')();

const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
let ok=0, fail=0;
const failures=[];

for(const p of P){
  for(let i=0;i<p.files.length;i++){
    const ext=p.files[i].slice(p.files[i].lastIndexOf('.'));
    const rel=`public/images/projects/${p.id}/${p.id}-${String(i+1).padStart(2,'0')}${ext}`;
    const abs=join(root,rel);
    if(existsSync(abs) && readFileSync(abs).length>100){ ok++; continue; }
    mkdirSync(dirname(abs),{recursive:true});
    const url=CDN+p.files[i];
    try{
      const res=await page.goto(url,{waitUntil:'networkidle0',timeout:30000});
      if(!res || !res.ok()){ throw new Error('HTTP '+(res&&res.status())); }
      const buf=await res.buffer();
      if(buf.length<100) throw new Error('tiny '+buf.length);
      writeFileSync(abs,buf);
      ok++;
      process.stdout.write('.');
    }catch(e){
      fail++; failures.push(rel+': '+e.message);
      process.stdout.write('x');
    }
  }
}
const mp4Rel='public/media/projects/gella/gella-food-animation.mp4';
const mp4Abs=join(root,mp4Rel);
mkdirSync(dirname(mp4Abs),{recursive:true});
if(!existsSync(mp4Abs)){
  const drop='https://www.dropbox.com/scl/fi/m6l601vzcj5ehrzz2m12z/GellaFrenda-Food-Animation.mp4?rlkey=2tpjwkzo7480jtl79f91syhv3&st=jb9o4q5l&raw=1';
  try{
    const res=await page.goto(drop,{waitUntil:'networkidle0',timeout:120000});
    if(!res||!res.ok()) throw new Error('HTTP '+(res&&res.status()));
    writeFileSync(mp4Abs, await res.buffer());
    console.log('\nmp4 ok', readFileSync(mp4Abs).length);
  }catch(e){ fail++; failures.push(mp4Rel+': '+e.message); console.log('\nmp4 FAIL', e.message); }
} else console.log('\nmp4 exists');

await browser.close();
console.log(`\nDone. ok=${ok} fail=${fail}`);
if(failures.length) console.log(failures.slice(0,40).join('\n'));
writeFileSync(join(root,'.qa-tools/asset-fetch-log.json'), JSON.stringify({ok,fail,failures},null,2));
