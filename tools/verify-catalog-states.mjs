// The real-surface check the checker said was still owed on findings 1, 2 and 4.
//
// Everything it demonstrated was jsdom + a stubbed fetch — code-path-exact, but by HARD
// RULE #23 a harness is not the surface. This drives the REAL production bundle in a REAL
// Chromium and controls only the ONE request under test, via route interception. The network
// is the variable; the code, the bundle and the browser are the actual ones.
//
// Three states, because the bug was that two of them were indistinguishable:
//
//   OFFLINE   the catalog request is aborted, as it is with no network / a blocked CORS
//             preflight / DNS failure. `fetch` REJECTS. This is finding 1 — it used to render
//             "this model hasn't published a voice list" and "this model publishes no price".
//   SLOW      the catalog answers, but after 7s — past the 6s bound. Finding 2: the Workspace
//             TTS panel must still end up with a real roster, because feeding IT the bounded
//             answer turned a working catalog into a permanently empty one.
//   EMPTY     the catalog answers 200 with zero speech models. Must NOT be explained as a
//             network problem — that is the conflation the reachability flag exists to end.

import { chromium } from '../docs/node_modules/@playwright/test/index.mjs'; // the docs workspace owns Playwright

// Point at a SERVED PRODUCTION BUILD of the docs site:
//   cd docs && npm run build && npx serve dist -l 4336
// The dev server is the wrong surface — Vite serves hundreds of unbundled modules, so a
// controlled-network test against it measures the module graph, not the app.
const BASE = process.env.STUDIO_BASE || 'http://localhost:4336';
const CATALOG = /openrouter\.ai\/api\/v1\/models/;
// A key is needed only to get PAST the audio switch, which correctly refuses to enable
// without a cloud voice. Nothing here synthesizes and nothing is billed — every catalog
// request is intercepted, and Download is never pressed.
const KEY = process.env.OPEN_ROUTER_KEY;
if (!KEY) { console.error('OPEN_ROUTER_KEY unset — needed to enable the audio switch; no spend occurs.'); process.exit(1); }

const LIVE_BODY = JSON.stringify({
  data: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', pricing: { prompt: '0.00000062' }, supported_voices: ['af_heart', 'am_michael'] }],
});

const browser = await chromium.launch();
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Open the export panel with narration audio on, under a controlled catalog. */
async function exportPanel(routeHandler) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((k) => { try { localStorage.setItem('lattice-db-or-key', k); } catch {} }, KEY);
  await ctx.route(CATALOG, routeHandler);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share' }).first().click({ timeout: 60000 });
  await page.getByText('Webpage', { exact: false }).first().click();
  await page.getByLabel('Include narration audio').click();
  await page.waitForTimeout(11000); // past the 6s bound, past the 7s slow answer, past the measure
  const text = await page.evaluate(() => document.body.innerText);
  await ctx.close();
  return text;
}

// ── finding 1: offline ───────────────────────────────────────────────────────────────────────
const offline = await exportPanel((r) => r.abort('failed'));
check('offline: says the CATALOG could not be reached', /Couldn't reach the voice catalog/i.test(offline));
check("offline: does NOT claim the model published no voice list", !/hasn't published a voice list/i.test(offline));
check('offline: does NOT claim the model publishes no price', !/this model publishes no price/i.test(offline));
check('offline: says the cost is unknown instead', /cost unknown until the catalog is reachable/i.test(offline));
check('offline: never renders NaN in the bill', !/NaN/.test(offline));
// finding 4 — the promise has to match the state: nothing is cached here, so recording is needed.
check('offline: does not promise the export still works when it needs a connection', /may not complete until it is back/i.test(offline));

// ── finding 1b: a live catalog that lists nothing ────────────────────────────────────────────
const empty = await exportPanel((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
check('live-but-empty: does NOT blame the network for a real answer', !/Couldn't reach the voice catalog/i.test(empty));

// ── finding 2: the Workspace TTS panel on a slow-but-working catalog ─────────────────────────
// The regression was that the 6s bound handed this panel `[]` and its `if (models) return`
// guard made that final, so a catalog arriving at 7s never reached the voice roster.
// At 393px, where the Workspace settings trigger is a first-class header button. The desktop
// header reaches it another way in this build; the component and the code path are the same.
const ctx = await browser.newContext({ viewport: { width: 393, height: 851 } });
await ctx.addInitScript((k) => { try { localStorage.setItem('lattice-db-or-key', k); } catch {} }, KEY);
await ctx.route(CATALOG, async (route) => {
  await new Promise((r) => setTimeout(r, 7000)); // answers, but past the export panel's bound
  await route.fulfill({ status: 200, contentType: 'application/json', body: LIVE_BODY });
});
const page = await ctx.newPage();
await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Workspace settings' }).first().click({ timeout: 60000 });
await page.waitForTimeout(12000);
const ws = await page.evaluate(() => document.body.innerText);
check('slow catalog: the Workspace voice roster still populates', /Kokoro/.test(ws) && !/hasn't published a voice list/i.test(ws), /Kokoro/.test(ws) ? 'model named' : 'model NOT named');
await page.screenshot({ path: '.scratch/out/1419-workspace-slow-catalog.png' });
await ctx.close();

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
process.exitCode = failures ? 1 : 0;
