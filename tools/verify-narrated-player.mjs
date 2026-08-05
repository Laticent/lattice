// Real-surface verification for the baked-narration player (#1393).
//
// HARD RULE #23: "verified" names a surface and carries an artifact from it. The claim here
// is "a shared deck plays itself with no key and no network", so the only honest test is a
// REAL exported file, opened from disk over file://, in a real browser, with the audio
// actually reaching a media element — not a jsdom stand-in, and not the assembler's output
// inspected as a string.
//
// This script is COMMITTED rather than thrown away. The narration path has three ways to
// fail silently that no unit test can see — a CSP that refuses inline media, a data URI the
// media element will not decode, and a pace beat that resolves to the wrong number. #1389
// made the same point about a sweep script that had been written three times and gotten
// wrong twice.
//
// Run: node tools/verify-narrated-player.mjs   (writes .scratch/out/)

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '../docs/node_modules/@playwright/test/index.mjs'; // the docs workspace owns Playwright

const require = createRequire(import.meta.url);
const { buildPlayerHtml } = require('../lib/export/html-player.js');

/** A real, decodable WAV of `ms` milliseconds — a quiet 440 Hz tone, 8 kHz mono 16-bit. */
function wavDataUri(ms) {
  const rate = 8000;
  const n = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return `data:audio/wav;base64,${buf.toString('base64')}`;
}

const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Narrated</title>
<style>section[data-lattice-slide]{color:#111;background:#fff;font-family:sans-serif}</style>
</head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Slide one</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Slide two</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Slide three</h2></section>
</body></html>`;

// Slide 1: two real clips. Slide 2: one clip. Slide 3: a SILENT cue (no clip on the
// author's device) — the partial-coverage floor the design promises.
/** A cue with per-word estimate timings, exactly as `buildTrack` produces them. */
function cue(text, ms, audio) {
  const parts = text.split(' ');
  const per = ms / parts.length;
  return {
    text,
    estimateMs: ms,
    gapMs: 100,
    audio,
    words: parts.map((display, i) => ({ display, startMs: Math.round(i * per), endMs: Math.round((i + 1) * per) })),
  };
}

const narration = [
  [cue('The first thing we need to talk about.', 900, wavDataUri(900)), cue('And the second.', 500, wavDataUri(500))],
  [cue('A section opens here.', 600, wavDataUri(600))],
  [cue('This sentence was never prepared, so it is captioned and silent.', 700, null)],
];

// `pace: brisk` so the run is quick; the beats are asserted against brisk's real numbers.
const source = '---\ntheme: indaco\npace: brisk\n---\n\n# Slide one\n';

const { html } = await buildPlayerHtml({ docHtml, source, title: 'Narrated', now: 0, narration });
mkdirSync('.scratch/out', { recursive: true });
const file = path.resolve('.scratch/out/narrated-player.html');
writeFileSync(file, html);
console.log(`wrote ${file} (${(html.length / 1024).toFixed(0)} KB)`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
// OFFLINE is the entire claim. Any request the page tries to make will fail hard.
await ctx.setOffline(true);
const page = await ctx.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(t)) problems.push(`console: ${t}`);
});
page.on('requestfailed', (r) => problems.push(`request attempted: ${r.url().slice(0, 80)}`));

await page.goto(`file://${file}`);
await page.waitForSelector('#lp-play');

/** The line the crawl currently has centered and lit — the export's answer to "what is being
 *  read right now". */
const nowLine = () => page.evaluate(() => {
  const el = document.querySelector('#lp-caption .lp-cap-line.lp-now');
  return el ? el.textContent.trim() : '';
});
/** How many words of the active line are painted as already spoken. */
const saidWords = () => page.evaluate(() => document.querySelectorAll('#lp-caption .lp-cap-line.lp-now .lp-cap-w.lp-said').length);

const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
};

check('the player script ran (CSP hash accepted)', await page.evaluate(() => document.documentElement.classList.contains('lp-js')));
check('the caption band starts empty', (await page.textContent('#lp-caption')) === '');
check('play is not pressed at rest', (await page.getAttribute('#lp-play', 'aria-pressed')) === 'false');

await page.click('#lp-play');
await page.waitForFunction(() => document.querySelector('#lp-caption .lp-cap-line.lp-now'), null, { timeout: 4000 });
check('the first line is the one lit on play', (await nowLine()) === 'The first thing we need to talk about.');
check('play flips to pressed', (await page.getAttribute('#lp-play', 'aria-pressed')) === 'true');

// The audio element must actually be PLAYING inline data — currentTime advancing is the
// only proof that the bytes decoded and the CSP allowed the media.
const advanced = await page.evaluate(async () => {
  const a = document.querySelector('audio');
  if (!a) return { found: false };
  const t0 = a.currentTime;
  await new Promise((r) => setTimeout(r, 250));
  return { found: true, src: a.currentSrc.slice(0, 24), advanced: a.currentTime > t0 || a.ended, paused: a.paused };
});
check('an audio element is playing the inline data URI', advanced.found && (advanced.advanced || !advanced.paused), JSON.stringify(advanced));

// The word highlight must ADVANCE within the sentence — that is the shared cursor doing its
// job, re-anchored to the clip's real decoded duration rather than an estimate.
const w0 = await saidWords();
await page.waitForTimeout(220);
const w1 = await saidWords();
check('the word highlight advances through the line', w1 > w0, `${w0} -> ${w1} words lit`);

// It must reach the SECOND sentence of slide one without the viewer touching anything.
await page.waitForFunction(() => { const e = document.querySelector('#lp-caption .lp-cap-line.lp-now'); return e?.textContent.trim() === 'And the second.'; }, null, { timeout: 6000 });
check('it chains to the next sentence on its own', true);

// Then it must ADVANCE the deck by itself and speak the new slide — the whole feature.
await page.waitForFunction(() => document.getElementById('lp-count').textContent.trim().startsWith('2'), null, { timeout: 8000 });
check('the deck advances itself to slide 2', true);
// The beat is spent ON THE SLIDE THAT ARRIVED: advance, hold, THEN speak. So the interval
// that must contain the beat is count-flip → caption, not last-sentence → count-flip.
const t0 = Date.now();
await page.waitForFunction(() => { const e = document.querySelector('#lp-caption .lp-cap-line.lp-now'); return e?.textContent.trim() === 'A section opens here.'; }, null, { timeout: 6000 });
const held = Date.now() - t0;
check('and speaks the slide that arrived', true);
// Slide 2 is a `divider`, so its boundary earns the deeper SECTION beat — brisk's 1600 ms,
// not its 800 ms slide beat. This is the assertion that the deck's declared `pace:` actually
// reached the shared file.
check('the deeper SECTION beat was held before it spoke', held >= 1400 && held < 2600, `${held} ms (brisk section = 1600, brisk slide = 800)`);

// A silent cue still takes its time rather than flashing past.
await page.waitForFunction(() => { const e = document.querySelector('#lp-caption .lp-cap-line.lp-now'); return e?.textContent.trim().startsWith('This sentence was never prepared'); }, null, { timeout: 10000 });
check('a sentence with no clip still shows its caption', true);

// Leaving Present stops the voice — no disembodied narrator over the article view.
await page.click('[data-lp-btn="read-article"]');
await page.waitForTimeout(300);
check('switching views stops narration', (await page.getAttribute('#lp-play', 'aria-pressed')) === 'false');
check('and clears the caption', (await page.textContent('#lp-caption')) === '');

// ── the three transport defects the adversarial red team reproduced ──────────────────
// Each of these was a real, observed break in an earlier build of this file. They are
// checked HERE rather than in a unit test because every one of them is a property of real
// media playback and real event ordering — a jsdom stand-in cannot produce any of them.

await page.click('[data-lp-btn="present"]');
check('the play control is withheld outside Present', await page.evaluate(() => {
  document.querySelector('[data-lp-btn="read-article"]').click();
  const hidden = getComputedStyle(document.getElementById('lp-play')).display === 'none';
  document.querySelector('[data-lp-btn="present"]').click();
  return hidden;
}), 'the bar is a SIBLING of the view container, so no CSS rule can reach it — it takes JS');

// Starting narration from Read-Article used to read the deck aloud with the caption band
// hidden while the invisible transport advanced the slides underneath.
await page.click('[data-lp-btn="read-article"]');
await page.evaluate(() => document.getElementById('lp-play').click());
await page.waitForTimeout(200);
check('narration cannot be STARTED outside Present', (await page.getAttribute('#lp-play', 'aria-pressed')) === 'false');
await page.click('[data-lp-btn="present"]');

// A clamped edge no-op fires onShow (deliberately, so chrome stays in sync). Pressing Left on
// the first slide — or Right on the last, the natural "is it over?" gesture — restarted that
// slide's narration from the top.
await page.keyboard.press('Home');
await page.waitForFunction(() => document.getElementById('lp-count').textContent.trim().startsWith('1'), null, { timeout: 4000 });
await page.click('#lp-play');
await page.waitForFunction(() => { const e = document.querySelector('#lp-caption .lp-cap-line.lp-now'); return e?.textContent.trim() === 'And the second.'; }, null, { timeout: 8000 });
const beforeNoop = await nowLine();
await page.keyboard.press('ArrowLeft'); // already on the first slide → a clamped no-op
await page.waitForTimeout(250);
const afterNoop = await nowLine();
check('a clamped no-op navigation does not restart the slide', afterNoop === beforeNoop, `was "${beforeNoop}", now "${afterNoop}"`);

// A play() that rejects after its cue was replaced used to tear down the state of the cue
// that replaced it: button reading "Play", caption blank, audio still audible.
await page.evaluate(() => {
  const b = document.getElementById('lp-play');
  b.click();
  b.click();
  b.click();
});
await page.waitForTimeout(600);
const stranded = await page.evaluate(() => {
  const a = document.querySelector('audio');
  return { pressed: document.getElementById('lp-play').getAttribute('aria-pressed'), paused: a ? a.paused : true };
});
check('a rapid play/pause burst never leaves audio running under a stopped transport', !(stranded.pressed === 'false' && !stranded.paused), JSON.stringify(stranded));
await page.evaluate(() => {
  if (document.getElementById('lp-play').getAttribute('aria-pressed') === 'true') document.getElementById('lp-play').click();
});

check('no CSP refusal, page error, or network attempt', problems.length === 0, problems.join(' | ') || 'clean');

// Sign-off artifacts: Present, mid-sentence, with the caption band showing — in BOTH modes.
// CLAUDE.md's export gate wants the bytes of an exported artifact looked at, not described.
for (const mode of ['light', 'dark']) {
  await page.click('[data-lp-btn="present"]');
  await page.evaluate((m) => {
    document.documentElement.setAttribute('data-lp-scheme', m);
    document.documentElement.style.setProperty('color-scheme', m);
  }, mode);
  await page.click('#lp-play');
  await page.waitForFunction(() => document.querySelector('#lp-caption .lp-cap-w.lp-said'), null, { timeout: 4000 });
  await page.screenshot({ path: `.scratch/out/narrated-player-${mode}.png` });
  await page.click('#lp-play'); // pause before the next pass
  await page.waitForTimeout(150);
}
console.log('wrote .scratch/out/narrated-player-{light,dark}.png');

await browser.close();
console.log(process.exitCode ? '\nFAILED' : '\nALL CHECKS PASSED');
