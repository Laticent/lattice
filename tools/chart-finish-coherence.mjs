/**
 * chart-finish-coherence — does every chart member actually CHANGE when the
 * finish changes, and does the result still clear its contrast floors?
 *
 * Answers the question a still cannot: a finish that leaves a member alone is
 * indistinguishable, in a screenshot, from a finish that touched it. Flip all
 * three finishes across every theme x mode and compare the computed paint.
 *
 * Reports four things per member:
 *   A. does the body take three DISTINCT values across pigment/etching/tone
 *   B. does any body remain a GRADIENT (a gradient is not a finish's to keep)
 *   C. text sitting inside a mark, against the 4.5:1 text floor
 *   D. the edge against its own body, against the 3:1 graphical floor —
 *      the number that decides whether a retreating body handed identity over
 *
 * THREE HARNESS TRAPS, all paid for once:
 *   1. `color-mix(in oklab, ...)` and `light-dark()` parse nowhere but a real
 *      style resolution, so colours are read from getComputedStyle and then
 *      converted by PAINTING them into a 1x1 canvas. A regex cannot read them.
 *   2. `fill` computes on every element, HTML ones included, at rgb(0,0,0).
 *      Gate on `el instanceof SVGElement` or every div scores as a black mark.
 *   3. A translucent mark is never painted at its solid colour. Composite
 *      fill-opacity over the canvas before judging text on it, or a radar
 *      polygon reads 2.12:1 when it actually paints 4.58:1.
 *
 *   4. SET THE CONTROL, DO NOT SET THE ATTRIBUTE. Switching theme in this
 *      prototype injects a stylesheet and re-renders the grid; writing
 *      `stage.dataset.theme` alone changes nothing, and an unknown key changes
 *      nothing silently. An earlier revision of this tool did exactly that and
 *      reported four themes that were all indaco. Click the real button.
 *
 * Usage: node tools/chart-finish-coherence.mjs [path-to-prototype.html]
 */

import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const FILE = 'file://' + resolve(process.argv[2] || '.scratch/chart-finishes.html');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 2000 });
await p.goto(FILE, { waitUntil: 'networkidle0', timeout: 180000 });
await new Promise(r => setTimeout(r, 3000));

// read the real control vocabularies rather than assuming them
const { themes, modes, finishes } = await p.evaluate(() => {
  const vals = id => [...document.querySelectorAll(`#${id} button`)].map(b => b.dataset.v);
  return { themes: vals('theme'), modes: vals('mode'), finishes: vals('finish') };
});
const click = async (id, v) => {
  const ok = await p.evaluate((id, v) => {
    const b = document.querySelector(`#${id} button[data-v="${v}"]`);
    if (!b) return false; b.click(); return true;
  }, id, v);
  if (!ok) throw new Error(`no control ${id}=${v} — the vocabulary changed`);
  await new Promise(r => setTimeout(r, 550));
};
const res = {};
for (const th of themes) for (const mode of modes) {
  for (const fin of finishes) {
    await click('theme', th); await click('mode', mode); await click('finish', fin);
    res[`${th}/${mode}/${fin}`] = await p.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgb = v => { try { cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = v;
        cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]]; }
        catch { return null; } };
      const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x/12.92 : ((x+0.055)/1.055)**2.4; };
        return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
      const ratio = (a, z) => { const [x,y] = [lum(a), lum(z)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
      const out = [];
      for (const card of document.querySelectorAll('.pv-card')) {
        for (const m of card.querySelectorAll('[data-slot]')) {
          const cs = getComputedStyle(m); const svg = m instanceof SVGElement;
          const paint = svg ? cs.fill : cs.backgroundColor;
          const img = svg ? '' : cs.backgroundImage;
          const ref = /url\(["']?#?([^"')]+)/.exec(paint || '');
          const def = ref && document.getElementById(ref[1]);
          const textured = !!def && def.tagName.toLowerCase() === 'pattern';
          const grad = !textured && (/url\(|gradient/.test(paint) || /gradient/.test(img));
          let body = (grad || textured) ? null : rgb(paint);
          const al = parseFloat(svg ? cs.fillOpacity : cs.opacity);
          if (body && al < 1) {
            const under = rgb(getComputedStyle(card.querySelector('section.chart-frame') || card).backgroundColor) ||
                          rgb(getComputedStyle(document.getElementById('stage')).backgroundColor) || [255,255,255];
            body = body.map((c, i) => Math.round(c * al + under[i] * (1 - al)));
          }
          // text sitting inside this mark
          const mr = m.getBoundingClientRect(); let worst = null;
          if (body && mr.width && mr.height) {
            for (const t of card.querySelectorAll('text,tspan,span,div,p')) {
              const tr = t.getBoundingClientRect();
              if (!tr.width || !tr.height) continue;
              if (![...t.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
              const ox = Math.max(0, Math.min(mr.right, tr.right) - Math.max(mr.left, tr.left));
              const oy = Math.max(0, Math.min(mr.bottom, tr.bottom) - Math.max(mr.top, tr.top));
              if ((ox*oy) / (tr.width*tr.height) < 0.6) continue;
              const tc = rgb(getComputedStyle(t).color); if (!tc) continue;
              const r = ratio(tc, body);
              if (worst === null || r < worst) worst = r;
            }
          }
          // the EDGE is what a retreating body hands identity to: it has to
          // clear 3:1 against the body it outlines AND against the canvas.
          let edgeVsBody = null, edgeVsCanvas = null;
          const ec = rgb(svg ? cs.stroke : cs.borderTopColor);
          const canvas = rgb(getComputedStyle(card.querySelector('section.chart-frame') || card).backgroundColor) ||
                         rgb(getComputedStyle(document.getElementById('stage')).backgroundColor);
          if (ec && body) edgeVsBody = ratio(ec, body);
          if (ec && canvas) edgeVsCanvas = ratio(ec, canvas);
          const bodyVsCanvas = (body && canvas) ? ratio(body, canvas) : null;
          out.push({ textured, bodyVsCanvas, edgeVsBody, edgeVsCanvas, member: card.dataset.member, cls: (m.getAttribute('class')||'').split(' ')[0],
            reg: m.dataset.register, enc: m.dataset.fill, grad, body: (body ? body.join(',') : 'GRADIENT') + '@' + (svg ? cs.fillOpacity : cs.opacity),
            textRatio: worst });
        }
      }
      return out;
    });
  }
}
console.log(JSON.stringify(res));
await b.close();
