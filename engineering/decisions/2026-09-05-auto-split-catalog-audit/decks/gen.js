const path=require('path');
function repoRoot(d){ while(!require('fs').existsSync(path.join(d,'package.json'))) d=path.dirname(d); return d; }
const ROOT=repoRoot(__dirname);
const WORK=process.env.ASAUDIT_WORK || path.join(ROOT,'.scratch','asaudit');
const fs=require('fs');
const A=require('./corpus-a.js'), B=require('./corpus-b.js'), C=require('./corpus-c.js');
const CORPUS={...A,...B,...C};
const oracle=require(path.join(ROOT,'test/oracle/split-oracle.json')).components;
const cat=require(path.join(ROOT,'dist/docs/components.json')).components;
const byName=Object.fromEntries(cat.map(c=>[c.name,c]));

const OUT=path.join(WORK,'decks');
fs.mkdirSync(OUT,{recursive:true});

const SIZES={portrait:'portrait', square:'square'};

function deckFor(name, size){
  const e=CORPUS[name];
  const declared=byName[name]?.variants||[];
  const vs=e.variants||[];
  const missing=declared.filter(v=>!vs.includes(v));
  if(missing.length) throw new Error(name+': variants not covered: '+missing.join(','));
  const slides=[];
  slides.push(`<!-- _class: ${name} -->\n<!-- _footer: "${name} · default" -->\n\n${e.body}`);
  for(const v of vs){
    const body=e.variantBodies?.[v]||e.body;
    slides.push(`<!-- _class: ${name} ${v} -->\n<!-- _footer: "${name} · ${v}" -->\n\n${body}`);
  }
  return `---\nsize: ${size}\ntheme: indaco\npaginate: true\nfooter: "${name}"\n---\n\n`+slides.join('\n\n---\n\n')+'\n';
}

let n=0;
for(const name of Object.keys(CORPUS)){
  if(!oracle[name]) throw new Error(name+' unknown');
  for(const s of Object.keys(SIZES)){
    fs.writeFileSync(path.join(OUT,`${name}.${s}.md`), deckFor(name, SIZES[s]));
    n++;
  }
}
const enrolled=Object.keys(oracle).filter(k=>oracle[k].enrolled);
const uncovered=Object.keys(oracle).filter(k=>!CORPUS[k]);
if(uncovered.length) throw new Error('no content: '+uncovered.join(','));
console.log('wrote',n,'decks ·',Object.keys(oracle).length,'components ·',enrolled.length,'enrolled');
