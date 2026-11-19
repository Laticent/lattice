// Adds a readout banner to an exported page: Safari's version, the engine guard's CSS.supports answer, and each
// risk-matrix number's computed fill. Scratch probe for PR #3312; never lands on main.
import fs from 'node:fs';

const GUARD = 'color(from light-dark(red, red) xyz-d65 calc(0.95047 * clamp(0, (0.1791 - y) * 1000000, 1)) clamp(0, (0.1791 - y) * 1000000, 1) calc(1.08883 * clamp(0, (0.1791 - y) * 1000000, 1)))';
const PLAIN = GUARD.replace('light-dark(red, red)', 'red');
const js = `setTimeout(function(){var r=[navigator.userAgent,'scheme-dark='+matchMedia('(prefers-color-scheme: dark)').matches,'guard(light-dark origin)='+CSS.supports('color',${JSON.stringify(GUARD)}),'relative color, plain origin='+CSS.supports('color',${JSON.stringify(PLAIN)}),'light-dark()='+CSS.supports('color','light-dark(red, red)')];var seen={};document.querySelectorAll('.risk-key-number').forEach(function(e){var k=e.textContent+' '+getComputedStyle(e).fill;if(!seen[k]){seen[k]=1;r.push('key '+k)}});document.getElementById('s17probe').textContent=r.join('\\n')},2000)`;
const banner = `<div id="s17probe" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#fff;color:#000;font:11px/1.25 monospace;padding:4px;white-space:pre-wrap;opacity:.92">probe script did not run</div><script>${js}</script>`;
for (const f of process.argv.slice(2)) {
  const h = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, h.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${banner}</body>`)); // regex-ok: scratch probe
}
