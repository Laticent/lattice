/**
 * MECHANISM PROBE — which channel actually carries a theme description out of the
 * preview frame's <style> element?
 *
 * Reproduces the concatenation shape of docs/src/lib/single-slide-render.ts:663
 *   '…<style id="lattice-theme">' + themeStyleContent(css, …) + '</style></head><body>' + html
 * with the REAL lib/theme/serialize.js output, and loads it as a same-origin,
 * un-sandboxed srcdoc iframe in a real Chromium. A sentinel on window.top is the
 * only evidence accepted.
 *
 * Two candidate channels, and the answer decides the fix's shape:
 *   A. `*​/` closes the CSS comment  -> the remainder is LIVE CSS
 *   B. `<​/style` closes the ELEMENT -> the remainder is LIVE HTML (script)
 * B is tokenizer-level and does not care about CSS comments at all.
 */

import { createRequire } from 'node:module';
import puppeteer from 'puppeteer';

const require_ = createRequire(import.meta.url);

const { serializeTheme } = require_('../lib/theme/serialize.js');
const { deriveTheme } = require_('../lib/theme/derive.js');
const { STARTERS } = require_('../lib/theme/starters.js');

const map = deriveTheme(STARTERS[0].essentials);

/** The srcdoc assembly, byte-for-byte the shape single-slide-render.ts uses. */
function frame(css) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style id="lattice-theme">' +
    ':root{color-scheme:light}html,body{background:transparent}' + css +
    '</style></head><body><section class="lattice"><h1>slide</h1></section></body></html>'
  );
}

const SENTINEL = '__LATTICE_PROBE_PWNED';
const cases = {
  // B alone: no comment breakout at all, just the element terminator.
  'B: </style> only': `A perfectly nice palette</style><img src=x onerror="window.top.${SENTINEL}='B'">`,
  // A alone: comment breakout into live CSS. CSS cannot run script by itself.
  'A: */ only': `nice */ :root{--probe:1} /*`,
  // A+B: the shape a red team would actually write.
  'A+B: */ then </style>': `nice */ </style><img src=x onerror="window.top.${SENTINEL}='AB'"><style>/*`,
  'control: benign': 'A warm, restrained palette for board decks.',
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent('<div id="host"></div>');

console.log('| case | comment closed? | element closed? | script ran? |');
console.log('|---|---|---|---|');
for (const [label, description] of Object.entries(cases)) {
  const css = serializeTheme(map, { name: 'probe', label: 'Probe', description });
  const doc = frame(css);
  const out = await page.evaluate(async ({ doc, SENTINEL }) => {
    delete window[SENTINEL];
    document.getElementById('host').innerHTML = '';
    const fr = document.createElement('iframe');
    fr.srcdoc = doc;
    document.getElementById('host').appendChild(fr);
    await new Promise((r) => { fr.onload = r; setTimeout(r, 900); });
    await new Promise((r) => setTimeout(r, 250));
    const d = fr.contentDocument;
    return {
      // The <style> element's text stops where the tokenizer stopped it.
      styleLen: d?.querySelector('#lattice-theme')?.textContent?.length ?? -1,
      // Nodes the tokenizer built AFTER the style element closed early.
      strayImgs: d ? d.querySelectorAll('img').length : -1,
      sentinel: window[SENTINEL] || null,
      // Did the comment close? A rule that only exists after `*​/` proves it.
      liveCss: d ? getComputedStyle(d.documentElement).getPropertyValue('--probe').trim() : '',
    };
  }, { doc, SENTINEL });
  console.log(
    `| ${label} | ${out.liveCss === '1' ? 'YES' : 'no'} | ${out.strayImgs > 0 ? `YES (${out.strayImgs} stray node)` : 'no'} | ` +
    `${out.sentinel ? `**YES (${out.sentinel})**` : 'no'} |`,
  );
}
await browser.close();
