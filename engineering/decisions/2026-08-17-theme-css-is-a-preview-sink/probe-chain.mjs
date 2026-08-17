/**
 * THE FULL CHAIN, on the shipped bundle, in a real browser.
 *
 *   a Studio theme's description
 *     -> lib/theme/serialize.js  (the `/* … *​/` header)
 *     -> PG.addThemes({name, css}) -> ThemeStore.cssFor -> the composed sheet
 *     -> a same-origin, un-sandboxed preview srcdoc's <style>
 *     -> script execution in the origin that holds the user's OpenRouter key
 *
 * Run against a PRE-FIX build and a POST-FIX build; the only difference accepted as
 * evidence is `window.top` sentinel set vs not set. Everything else (slide renders,
 * composed byte count, theme still applies) is reported so a pass cannot be vacuous.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer';

const require_ = createRequire(import.meta.url);
const LABEL = process.argv[2] || 'unknown';
mkdirSync('.scratch/surface', { recursive: true });

// The description a manipulated model reply carries. Fabricate seeds `themeDesc`
// straight from `out.description`, so this is the normal flow's input.
const DESC = 'Warm editorial palette */ </style><img src=x onerror="window.top.__CHAIN_PWNED=\'yes\'"> /*';

// Serialized by the REPO'S OWN serializer, so the A/B is testing lib/theme/serialize.js
// rather than this probe's idea of what it emits.
const { serializeTheme } = require_('../lib/theme/serialize.js');
const { deriveTheme } = require_('../lib/theme/derive.js');
const { STARTERS } = require_('../lib/theme/starters.js');
const THEME_CSS = serializeTheme(deriveTheme(STARTERS[0].essentials), { name: 'chain', label: 'Chain', description: DESC });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:4399/playground/', { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForFunction(() => !!window.LatticePlayground, { timeout: 60_000 });

const out = await page.evaluate(async (THEME_CSS) => {
  const PG = window.LatticePlayground;
  const v = [...document.querySelectorAll('script,link')].map((n) => n.src || n.href || '')
    .map((u) => (u.match(/\/playground\/v\/[a-f0-9]+\//) || [])[0]).find(Boolean) || '/playground/';
  for (const n of ['lattice', 'indaco']) {
    const css = await (await fetch(`${v}themes/${n}.css`)).text();
    PG.addThemes([{ name: n, css }]);
  }

  PG.addThemes([{ name: 'chain', css: THEME_CSS }]);
  const r = await PG.render('# Board review\n\nA slide that must still render.', 'chain');

  // The preview frame, assembled exactly as docs/src/lib/single-slide-render.ts does.
  const doc = '<!doctype html><html><head><meta charset="utf-8"><style id="lattice-theme">'
    + `:root{color-scheme:light}html,body{background:transparent}${r.css}`
    + '</style></head><body>' + r.html + '</body></html>';

  delete window.__CHAIN_PWNED;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;width:1280px;height:720px';
  document.body.appendChild(host);
  const fr = document.createElement('iframe');
  fr.width = 1280; fr.height = 720;
  fr.srcdoc = doc;
  host.appendChild(fr);
  await new Promise((res) => { fr.onload = res; setTimeout(res, 1500); });
  await new Promise((res) => setTimeout(res, 400));

  const d = fr.contentDocument;
  return {
    composedBytes: r.css.length,
    styleEndInComposedCss: /<\/style/i.test(r.css),
    // Did the tokenizer build nodes after the style element ended early?
    strayImgs: d ? d.querySelectorAll('img[src="x"]').length : -1,
    styleTextLen: d?.querySelector('#lattice-theme')?.textContent.length ?? -1,
    slideRendered: d ? d.querySelectorAll('section').length : -1,
    accentApplied: d ? getComputedStyle(d.documentElement).getPropertyValue('--accent').trim() : '',
    sentinel: window.__CHAIN_PWNED || null,
  };
}, THEME_CSS);

const verdict = { build: LABEL, ...out, EXPLOITED: !!out.sentinel };
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(`.scratch/surface/chain-${LABEL}.json`, JSON.stringify(verdict, null, 2));
await browser.close();
