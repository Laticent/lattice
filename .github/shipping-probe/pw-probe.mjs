// THROWAWAY: the code-package worker in Playwright's three engines, four configurations each:
// shipped (policy + wall), wall alone, policy alone, neither. Built the way the Studio's runner
// builds the frame (docs/src/lib/code-packages/runner.ts). Never merges.
import crypto from 'node:crypto';
import http from 'node:http';
import { chromium, firefox, webkit } from 'playwright';
import { FRAME_BOOTSTRAP, inlineScript, sandboxCsp } from '../../lib/packages/code-door-core.mjs';
import { checkedWorkerScript } from '../../lib/packages/code-syntax.mjs';

const hits = [];
const log = http.createServer((q, r) => { hits.push(q.url); r.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' }); r.end('export default 1'); });
await new Promise((r) => log.listen(0, '127.0.0.1', r));
const H = `http://127.0.0.1:${log.address().port}`;
const imp = (k) => `import("${H}/${k}").catch(()=>{})`;
const arms = {
  fetch: `fetch("${H}/fetch").catch(()=>{})`,
  xhr: `const x=new XMLHttpRequest();x.open("GET","${H}/xhr");x.send()`,
  websocket: `new WebSocket("${H.replace('http', 'ws')}/websocket")`,
  eventsource: `new EventSource("${H}/eventsource")`,
  importscripts: `importScripts("${H}/importscripts")`,
  fontface: `new FontFace("x","url(${H}/fontface)").load().catch(()=>{})`,
  protofetch: `for(let o=Object.getPrototypeOf(self);o;o=Object.getPrototypeOf(o)){if(Object.prototype.hasOwnProperty.call(o,"fetch")&&typeof o.fetch==="function")o.fetch.call(self,"${H}/protofetch").catch(()=>{})}`,
  dynimport: imp('dynimport'),
  evalimport: `(0,eval)('${imp('evalimport')}')`,
  fnimport: `Function('return ${imp('fnimport')}')()`,
  ctorimport: `(()=>{}).constructor('return ${imp('ctorimport')}')()`,
  asyncimport: `(async()=>{}).constructor('await ${imp('asyncimport')}')()`,
  timerimport: `setTimeout('${imp('timerimport')}',0)`,
};
const wrap = (code) => `try{${code}}catch(e){}`;
const pkgOf = (names) => `${names.map((n) => wrap(arms[n])).join(';')};function t(s){return "ran"}export{t as default};`;
const all = Object.keys(arms);
const walledArms = all.filter((n) => n !== 'dynimport');

// The literal import() is refused before any worker exists; say so, then run the rest.
let gate;
try { checkedWorkerScript(pkgOf(all)); gate = 'ACCEPTED (bad)'; } catch (e) { gate = `refused: ${e.message}`; }
console.log(`a package holding import(): ${gate}`);

const walled = checkedWorkerScript(pkgOf(walledArms));
const unwalled = `${pkgOf(all).replace(/function t\(s\)\{return "ran"\}export\{t as default\};$/, '')};postMessage({ready:true});onmessage=(e)=>postMessage({id:e.data.id,out:"unwalled"});`;
const script = inlineScript(FRAME_BOOTSTRAP);
const hash = crypto.createHash('sha256').update(script).digest('base64');
const frameDoc = (policy) => `<!doctype html><html><head><meta charset="utf-8">${policy ? `<meta http-equiv="Content-Security-Policy" content="${sandboxCsp(hash)}">` : ''}</head><body><script>${script}</script></body></html>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const hostPage = (policy, text) => `<!doctype html><body><iframe sandbox="allow-scripts" srcdoc="${esc(frameDoc(policy))}"></iframe><script>
const f=document.querySelector("iframe");const text=${JSON.stringify(text).replace(/</g, '\\u003c')};
addEventListener("message",(e)=>{if(e.source!==f.contentWindow)return;const r=e.data||{};
if(r.t==="ready")f.contentWindow.postMessage({t:"load",text,ms:5000},"*");
else if(r.t==="loaded"){if(r.error){document.title="load-error:"+r.error;return}f.contentWindow.postMessage({t:"run",id:1,slide:{html:"<section></section>",index:0},ms:2000},"*")}
else if(r.t==="result")document.title="result:"+(r.error?"error "+r.error:r.out)});</script></body>`;
const configs = { shipped: hostPage(true, walled), wallAlone: hostPage(false, walled), policyAlone: hostPage(true, unwalled), neither: hostPage(false, unwalled) };
const host = http.createServer((q, r) => { const k = new URL(q.url, 'http://x').searchParams.get('p'); r.writeHead(200, { 'content-type': 'text/html' }); r.end(configs[k] || ''); });
await new Promise((r) => host.listen(0, '127.0.0.1', r));

let bad = gate.startsWith('ACCEPTED');
for (const [label, type] of Object.entries({ chromium, firefox, webkit }).filter(([k]) => (process.env.ENGINES || 'chromium,firefox,webkit').split(',').includes(k))) {
  const br = await type.launch(process.env.PW_CHROMIUM && label === 'chromium' ? { executablePath: process.env.PW_CHROMIUM } : {});
  console.log(`\n${label} ${br.version()}`);
  for (const p of Object.keys(configs)) {
    hits.length = 0;
    const pg = await br.newPage();
    await pg.goto(`http://127.0.0.1:${host.address().port}/?p=${p}`);
    await pg.waitForFunction(() => /^(result|load-error):/.test(document.title), null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(3000);
    const by = all.map((a) => `${a}=${hits.filter((h) => h.startsWith(`/${a}`)).length}`).join(' ');
    console.log(`  ${p.padEnd(11)} ${String(hits.length).padStart(2)} requests  (${by})  [${await pg.title()}]`);
    if ((p === 'shipped' || p === 'wallAlone') && (hits.length || !/^result:ran$/.test(await pg.title()))) bad = true;
    if (p === 'neither' && hits.length === 0) bad = true;
    await pg.close();
  }
  await br.close();
}
log.close(); host.close();
process.exit(bad ? 1 : 0);
