const path=require('path');
function repoRoot(d){ while(!require('fs').existsSync(path.join(d,'package.json'))) d=path.dirname(d); return d; }
const ROOT=repoRoot(__dirname);
const WORK=process.env.ASAUDIT_WORK || path.join(ROOT,'.scratch','asaudit');
// Is the variant channel alive BEFORE the split, and does it survive it?
//   control  = hd (never splits): page per authored slide
//   split    = portrait: first BODY page of each run (or page 1 when a run has no cover)
// For each component, every variant page is pixel-compared with the default's
// equivalent page. A variant that differs at hd and stops differing at portrait
// was erased BY the split; one that differs at neither was inert to begin with.
const {execSync}=require('child_process');
const fs=require('fs');
const oracle=require(path.join(ROOT,'test/oracle/split-oracle.json')).components;
const cat=require(path.join(ROOT,'dist/docs/components.json')).components;
const byName=Object.fromEntries(cat.map(c=>[c.name,c]));
const PDF=path.join(WORK,'pdf');
const TMP=path.join(WORK,'vtmp');
fs.rmSync(TMP,{recursive:true,force:true}); fs.mkdirSync(TMP,{recursive:true});

function pages(deck){
  const h=fs.readFileSync(path.join(PDF,deck+'.html'),'utf8');
  return [...h.matchAll(/<section\b([^>]*data-lattice-slide="[^"]*"[^>]*)>/g)].map((m,i)=>{
    const a=m[1];
    const g=(k)=>((a.match(new RegExp(k+'="([^"]*)"'))||[])[1]||'');
    return {page:i+1, cls:g('data-class'), role:g('data-split-role'), run:g('data-split-run')};
  });
}
function png(deck,page){
  const out=path.join(TMP,`${deck}-${page}.png`);
  if(!fs.existsSync(out)) execSync(`pdftoppm -png -r 50 -f ${page} -l ${page} -singlefile ${PDF}/${deck}.pdf ${out.replace(/\.png$/,'')}`);
  return out;
}
function diffPct(a,b){
  try{
    const o=execSync(`compare -metric AE ${a} ${b} null: 2>&1 || true`,{encoding:'utf8'}).trim();
    const n=parseInt(o.replace(/[^0-9].*$/,''),10);
    const [w,h]=execSync(`identify -format "%w %h" ${a}`,{encoding:'utf8'}).trim().split(' ').map(Number);
    return +(n/(w*h)*100).toFixed(2);
  }catch{ return null; }
}
const rows=[];
for(const name of Object.keys(oracle)){
  if(!oracle[name].enrolled) continue;
  const vs=byName[name].variants||[];
  if(!vs.length) continue;
  const ctl=pages(name+'.hd'), spl=pages(name+'.portrait');
  // control: one page per authored slide, in order
  const ctlByIdx=ctl;
  // split: first body page of each run, in run order; fall back to the run's first page
  const runs=[]; const seen=new Set();
  for(const p of spl){ const key=p.run||('x'+p.page); if(!seen.has(key)){ seen.add(key); runs.push([]); } runs[runs.length-1].push(p); }
  const firstBody = runs.map(r=> r.find(p=>p.role==='body') || r[0]);
  if(ctlByIdx.length !== 1+vs.length || firstBody.length !== 1+vs.length){
    rows.push({name, note:`shape mismatch ctl=${ctlByIdx.length} split=${firstBody.length} expected=${1+vs.length}`});
    continue;
  }
  const ctlBase=png(name+'.hd', ctlByIdx[0].page);
  const splBase=png(name+'.portrait', firstBody[0].page);
  for(let i=0;i<vs.length;i++){
    const c=diffPct(ctlBase, png(name+'.hd', ctlByIdx[i+1].page));
    const s=diffPct(splBase, png(name+'.portrait', firstBody[i+1].page));
    rows.push({name, variant:vs[i], ctlDiff:c, splitDiff:s});
  }
}
fs.writeFileSync(path.join(WORK,'variant-diffs.json'),JSON.stringify(rows,null,1));
const LIVE=0.30; // % of pixels
let erased=0, inert=0, kept=0, odd=0;
for(const r of rows){
  if(r.note){ odd++; continue; }
  if(r.ctlDiff>=LIVE && r.splitDiff<LIVE) erased++;
  else if(r.ctlDiff<LIVE) inert++;
  else kept++;
}
console.log('variant slots measured:', rows.filter(r=>!r.note).length);
console.log('  alive unsplit AND after split :', kept);
console.log('  alive unsplit, DEAD after split:', erased);
console.log('  already indistinct unsplit     :', inert);
console.log('  unmeasured (shape mismatch)    :', odd);
for(const r of rows) if(r.note) console.log('   !', r.name, r.note);
