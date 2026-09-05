const path=require('path');
function repoRoot(d){ while(!require('fs').existsSync(path.join(d,'package.json'))) d=path.dirname(d); return d; }
const ROOT=repoRoot(__dirname);
const WORK=process.env.ASAUDIT_WORK || path.join(ROOT,'.scratch','asaudit');
// How many DISTINCT looks does a component's variant set produce — before the
// split (hd, one page per authored slide) and after it (portrait, the first body
// page of each run)? All-pairs pixel comparison, clustered at 0.30% of pixels.
const {execSync}=require('child_process');
const fs=require('fs');
const oracle=require(path.join(ROOT,'test/oracle/split-oracle.json')).components;
const cat=require(path.join(ROOT,'dist/docs/components.json')).components;
const byName=Object.fromEntries(cat.map(c=>[c.name,c]));
const PDF=path.join(WORK,'pdf'), TMP=path.join(WORK,'vtmp');
fs.mkdirSync(TMP,{recursive:true});
const THRESH=0.30;

function sections(deck){
  const h=fs.readFileSync(path.join(PDF,deck+'.html'),'utf8');
  return [...h.matchAll(/<section\b([^>]*data-lattice-slide="[^"]*"[^>]*)>/g)].map((m,i)=>({
    page:i+1,
    cls:(m[1].match(/data-class="([^"]*)"/)||[])[1]||'',
    role:(m[1].match(/data-split-role="([^"]*)"/)||[])[1]||'',
    run:(m[1].match(/data-split-run="([^"]*)"/)||[])[1]||'',
  }));
}
function png(deck,page){
  const base=path.join(TMP,`${deck}-${page}`);
  if(!fs.existsSync(base+'.png')) execSync(`pdftoppm -png -r 50 -f ${page} -l ${page} -singlefile ${PDF}/${deck}.pdf ${base}`);
  return base+'.png';
}
function pct(a,b){
  const o=execSync(`compare -metric AE ${a} ${b} null: 2>&1 || true`,{encoding:'utf8'}).trim();
  const n=parseInt(o.replace(/[^0-9].*$/,''),10)||0;
  const [w,h]=execSync(`identify -format "%w %h" ${a}`,{encoding:'utf8'}).trim().split(' ').map(Number);
  return (n/(w*h))*100;
}
function looks(files){
  const p=files.map((_x,i)=>i);
  const find=x=>p[x]===x?x:(p[x]=find(p[x]));
  for(let i=0;i<files.length;i++) for(let j=i+1;j<files.length;j++){
    if(find(i)===find(j)) continue;
    if(pct(files[i],files[j])<THRESH) p[find(i)]=find(j);
  }
  const groups={};
  files.forEach((_f,i)=>{ const r=find(i); (groups[r]=groups[r]||[]).push(i); });
  return Object.values(groups);
}
const out=[];
for(const name of Object.keys(oracle)){
  if(!oracle[name].enrolled) continue;
  const vs=byName[name].variants||[]; if(!vs.length) continue;
  const labels=['default',...vs];
  const ctl=sections(name+'.hd');
  const spl=sections(name+'.portrait');
  const runs=[]; const seen=new Set();
  for(const s of spl){ const k=s.run||('x'+s.page); if(!seen.has(k)){seen.add(k); runs.push([]);} runs[runs.length-1].push(s); }
  const firstBody=runs.map(r=>r.find(s=>s.role==='body')||r[0]);
  if(ctl.length!==labels.length||firstBody.length!==labels.length){ out.push({name,skip:`ctl=${ctl.length} spl=${firstBody.length} want=${labels.length}`}); continue; }
  const gCtl=looks(ctl.map(s=>png(name+'.hd',s.page)));
  const gSpl=looks(firstBody.map(s=>png(name+'.portrait',s.page)));
  out.push({name, declared:labels.length, looksUnsplit:gCtl.length, looksSplit:gSpl.length,
    mergedBySplit: gSpl.map(g=>g.map(i=>labels[i])).filter(g=>g.length>1)});
}
fs.writeFileSync(path.join(WORK,'looks.json'),JSON.stringify(out,null,1));
let dec=0,u=0,s=0;
console.log('component            declared  distinct-unsplit  distinct-after-split');
for(const r of out){
  if(r.skip){ console.log(r.name.padEnd(22),'SKIP',r.skip); continue; }
  dec+=r.declared; u+=r.looksUnsplit; s+=r.looksSplit;
  console.log(r.name.padEnd(22), String(r.declared).padStart(8), String(r.looksUnsplit).padStart(17), String(r.looksSplit).padStart(21));
}
console.log('TOTAL'.padEnd(22), String(dec).padStart(8), String(u).padStart(17), String(s).padStart(21));
