#!/usr/bin/env node
/**
 * chart-style-catalog — what style each chart ACTUALLY paints, measured.
 *
 * The family has no chart-finish register (grep chart-finish -> 0), so every
 * member paints whatever its own file says and nothing reconciles them. This
 * reads the rendered gallery and reports body shape, body depth and edge depth
 * per member, which is the baseline any finish work starts from: a finish
 * varies a style, and today there are twenty-one.
 *
 * Usage: node tools/chart-style-catalog.js <rendered.html>
 *
 * TWO HARNESS TRAPS this exists to not fall into, both of which produced
 * confident wrong tables before they were fixed:
 *
 *   1. COLOUR RESOLUTION IS TWO STAGES. A DOM probe resolves var() and
 *      light-dark(), which a canvas cannot; a canvas converts the resolved
 *      oklab() to sRGB, which a regex cannot. Reading `oklab(0.57 -0.04 -0.08)`
 *      as three channels scores a mid blue as near-black and reported the whole
 *      family at 20.98:1.
 *   2. `fill` COMPUTES ON EVERY ELEMENT, initial rgb(0,0,0). Reading it on an
 *      HTML mark reports a black body; five members scored 21:1 on a white
 *      canvas that way. Ask `el instanceof SVGElement` first.
 *
 * The self-check is not decoration: it resolves --bg on a CHART section (never
 * the first section — a `title` slide is an inverse bookend and its --bg is
 * legitimately dark) and refuses to print numbers if it does not come back as
 * the canvas. engineering/decisions/2026-09-07-chart-design-language/style-catalog.md
 */
const puppeteer = require('/home/user/lattice/node_modules/puppeteer');
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};
const MARKS = {
  bar:'.bar-mark', 'stacked-bar':'.sbar-seg', line:'.line-dot', scatter:'.scatter-dot',
  bullet:'.bullet-measure', slope:'.slope-dot', waterfall:'.waterfall-bar', funnel:'.funnel-band',
  piechart:'.wedge', quadrant:'.quadrant-tint', radar:'.radar-poly', gantt:'.gantt-bar',
  progress:'.progress-fill', 'state-chart':'.state-node', kanban:'.kanban-card',
  'matrix-grid':'.cell-filled', roadmap:'.cell-state', map:'.map-region--on',
  journey:'.journey-stage', 'word-cloud':'.wc-word', 'timeline-list':'.timeline-dot',
};
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args:['--no-sandbox'] });
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name:'prefers-color-scheme', value:'light' }]);
  await p.goto('file://' + process.argv[2], { waitUntil:'networkidle0' });
  const res = await p.evaluate((MARKS) => {
    const cv=document.createElement('canvas'); cv.width=cv.height=1;
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    const px=(sec,e)=>{ if(!e||e==='none') return null;
      const el=document.createElement('span'); el.style.cssText='position:absolute;width:0;height:0';
      el.style.backgroundColor=e; sec.appendChild(el);
      const v=getComputedStyle(el).backgroundColor; el.remove();
      if(!v||v==='rgba(0, 0, 0, 0)') return null;
      try{ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=v;ctx.fillRect(0,0,1,1);
        const d=ctx.getImageData(0,0,1,1).data;return [d[0],d[1],d[2]];}catch{return null;} };
    const stops=(sec,ref)=>{ const m=(ref||'').match(/url\(["']?#([^)"']+)/); if(!m) return null;
      const g=document.getElementById(m[1]); if(!g) return null;
      const st=[...g.querySelectorAll('stop')].map(s=>px(sec,(s.getAttribute('style')||'').replace(/^stop-color:\s*/,'').replace(/;$/,''))).filter(Boolean);
      return st.length?st:null; };
    const rows=[]; let check=null;
    for (const sec of document.querySelectorAll('section')) {
      for (const [m, sel] of Object.entries(MARKS)) {
        if (!sec.classList.contains(m)) continue;
        const el = sec.querySelector(sel); if (!el) continue;
        const cs = getComputedStyle(el);
        if (!check) check = px(sec, 'var(--bg)');
        const bg = px(sec, 'var(--bg)');
        // `fill` is an SVG PROPERTY but it computes on EVERY element, initial
        // rgb(0,0,0) — so reading it on an HTML mark reports a black body and
        // scored five members at 21:1 against a white canvas. Ask the element
        // what it is first.
        const isSvg = el instanceof SVGElement;
        const st = stops(sec, isSvg ? cs.fill : cs.backgroundImage);
        let body = null, shape = 'flat';
        if (st) { shape='gradient'; body=[0,1,2].map(i=>st.reduce((a,c)=>a+c[i],0)/st.length); }
        else if (!isSvg && /gradient\(/.test(cs.backgroundImage)) {
          // a CSS gradient: average the colour stops it actually names
          shape='gradient';
          const cols=(cs.backgroundImage.match(/(?:rgba?|oklab|oklch|color)\([^)]*\)|#[0-9a-f]{3,8}/gi)||[])
            .map(c=>px(sec,c)).filter(Boolean);
          if (cols.length) body=[0,1,2].map(i=>cols.reduce((a,c)=>a+c[i],0)/cols.length);
        }
        else body = px(sec, isSvg ? cs.fill : cs.backgroundColor);
        const sw = parseFloat(cs.strokeWidth)||0;
        const edge = (isSvg && cs.stroke && cs.stroke!=='none' && sw>0) ? px(sec,cs.stroke)
                   : (parseFloat(cs.borderTopWidth)>0 ? px(sec,cs.borderTopColor) : null);
        rows.push({ m, shape, body, edge, bg, enc: el.getAttribute('data-encodes') });
      }
    }
    return { rows, check };
  }, MARKS);
  await b.close();
  const ok = Array.isArray(res.check) && res.check.every(v=>v>250);
  console.log(`self-check  --bg = ${JSON.stringify(res.check)} — ${ok?'OK':'FAILED'}\n`);
  if (!ok) { process.exitCode = 1; return; }
  const seen=new Set();
  // NO "bears text" COLUMN. textContent measures containment, and an SVG <rect>
  // can have its label drawn ON it as a sibling <text> without containing it —
  // measured that way gantt reports "no" while its bars carry task names. The
  // register needs geometric overlap, which is its own tool.
  console.log('chart           body shape   body depth   edge depth');
  console.log('-'.repeat(56));
  for (const x of res.rows) {
    if (seen.has(x.m)) continue; seen.add(x.m);
    const bd = x.body && x.bg ? ratio(x.body,x.bg).toFixed(2)+':1' : '—';
    const ed = x.edge && x.bg ? ratio(x.edge,x.bg).toFixed(2)+':1' : 'none';
    console.log(`${x.m.padEnd(15)} ${x.shape.padEnd(12)} ${bd.padStart(10)}   ${ed.padStart(10)}`);
  }
  console.log(`\n${seen.size} of 21 members measured on this deck.`);
})();
