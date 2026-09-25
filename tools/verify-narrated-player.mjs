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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '../docs/node_modules/@playwright/test/index.mjs'; // the docs workspace owns Playwright

const require = createRequire(import.meta.url);
const { buildPlayerHtml } = require('../lib/export/html-player.js');
const { buildTrack } = require('@laticent/cadenza');
const { timeline, unpack } = require('@laticent/ltt');

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

// Slide 1: two real clips. Slide 2: one clip. Slide 3: a cue with NO clip.
//
// A shipped file never contains that third case any more — the bake refuses rather than
// exporting a deck that goes quiet partway through (narration-bake.ts). It is still driven
// here because the PLAYER's floor has to hold anyway: a clip that will not decode on the
// recipient's browser lands in exactly this state at runtime, and the deck must keep its
// caption, hold its beat and move on rather than strand the delivery.
//
// The shape is what the Studio's bake hands the assembler (share-export.ts): per slide, the text
// Cadenza timed, the track it built, and one clip per cue. The clips are real, decodable WAVs,
// each as long as its sentence's estimate.
const VOICE = { model: 'verify/tone', voice: '440hz', speed: 1 };
const clipHash = (uri) => `sha256:${createHash('sha256').update(Buffer.from(uri.split(',')[1], 'base64')).digest('hex')}`;
/** A narrated slide. `audio[k]` is true for a real clip on cue k, a string for that exact data
 *  URI, and false/absent for none. */
function said(text, audio = []) {
  const track = buildTrack(text);
  const clips = track.cues.map((c, k) => {
    const a = audio[k];
    if (!a) return null;
    const uri = typeof a === 'string' ? a : wavDataUri(Math.max(200, c.endMs - c.startMs));
    return { audio: uri, clip: clipHash(uri) };
  });
  return { text, track, clips };
}

const narration = {
  voice: VOICE,
  slides: [
    said('The first thing we need to talk about. And the second.', [true, true]),
    said('A section opens here.', [true]),
    said('This sentence was never prepared, so it is captioned and silent.', []),
  ],
};

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
check('a cue whose clip is missing still shows its caption and holds its beat', true);

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

// ── SIGN-OFF ARTIFACTS ───────────────────────────────────────────────────────────────────────
//
// CLAUDE.md's export gate is a HUMAN gate: a change to the bytes of an exported artifact needs
// a representative deck rendered in both modes and looked at. This used to screenshot the
// SYNTHETIC fixture above, whose `<style>` is three hardcoded declarations with no theme — so
// `themeDualMode` emitted no dark block, the file contained no dark rule at all, and the
// "dark" PNG was byte-for-byte the light one. The run still printed ALL CHECKS PASSED, because
// nothing asserted anything about the images. The gate's evidence was false while its label
// said otherwise, which is worse than having no evidence.
//
// So the sign-off is taken from a REAL committed demo deck, rendered by the REAL CLI, and — since
// LTT step 2 — exported NARRATED, the way the Studio exports it: the deck's own captions timed by
// Cadenza, a clip per sentence, the packed LTT in the file. The screenshots are taken mid-caption,
// in both modes, and the two modes are ASSERTED to differ before either is offered as evidence.
// The clips are tones, not a voice: there is no TTS here, and the timing path does not care what
// the audio says. The dark file is then played end to end.
const DEMO = 'examples/ltt-timing-track.md';
const demoOut = path.resolve('.scratch/out/ltt-demo');
execFileSync(process.execPath, ['lattice-emulator.js', DEMO, demoOut, '--quiet'], { stdio: 'pipe' });
// Folded like every deck read (#1349): a BOM or a CRLF would defeat the `^---` anchor below.
const demoSource = (await import('node:fs')).readFileSync(DEMO, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const demoDoc = (await import('node:fs')).readFileSync(`${demoOut}.html`, 'utf8');
// One inline caption per slide is how this deck is authored; the Studio resolves the same text
// through its narration ladder, where an inline caption is the first rung.
const demoSlides = demoSource
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .split(/\n---\n/)
  .map((md) => /<!--\s*caption:\s*([\s\S]*?)\s*-->/.exec(md)?.[1] ?? '');
const demoNarration = { voice: VOICE, slides: demoSlides.map((text) => (text ? said(text, text.split(/(?<=[.!?])\s+/).map(() => true)) : null)) };
const signoffFiles = {};
const ground = {};
const shot = await ctx.newPage();
for (const mode of ['light', 'dark']) {
  const { html: demoHtml } = await buildPlayerHtml({ docHtml: demoDoc, source: demoSource, title: 'One timing track for every player', now: 0, narration: demoNarration, theme: { name: 'indaco', mode } });
  const f = path.resolve(`.scratch/out/ltt-timing-track-${mode}.html`);
  writeFileSync(f, demoHtml);
  signoffFiles[mode] = f;
  await shot.goto(`file://${f}`);
  await shot.waitForSelector('#lp-play');
  ground[mode] = await shot.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Slide 3 (the list-steps slide) mid-caption: the crawl, the band and the slide together.
  await shot.keyboard.press('ArrowRight');
  await shot.keyboard.press('ArrowRight');
  await shot.click('#lp-play');
  await shot.waitForFunction(() => document.querySelectorAll('#lp-caption .lp-cap-line.lp-now .lp-cap-w.lp-said').length >= 2, null, { timeout: 8000 });
  await shot.screenshot({ path: `.scratch/out/ltt-timing-track-${mode}.png` });
  await shot.click('#lp-play');
}
check('the sign-off artifacts are genuinely two different modes', ground.light !== ground.dark, `light ${ground.light} vs dark ${ground.dark}`);
// End to end: Play from slide 1 and let the deck run itself to the closing slide.
{
  const p = await ctx.newPage();
  const seen = [];
  p.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  await p.goto(`file://${signoffFiles.dark}`);
  await p.waitForSelector('#lp-play');
  const t0 = Date.now();
  await p.click('#lp-play');
  const total = demoSlides.length;
  await p.waitForFunction((n) => document.getElementById('lp-count').textContent.trim().startsWith(`${n} `), total, { timeout: 180000 });
  await p.waitForFunction(() => document.getElementById('lp-play').getAttribute('aria-pressed') === 'false', null, { timeout: 30000 });
  check('the narrated demo deck plays itself end to end and stops on its closing slide', seen.length === 0, `${total} slides in ${((Date.now() - t0) / 1000).toFixed(1)} s${seen.length ? ` — ${seen.join(' | ')}` : ''}`);
  await p.close();
}
await shot.close();
console.log(`wrote .scratch/out/ltt-timing-track-{light,dark}.{html,png} from ${DEMO}`);

// ── the other two states the export panel's switches produce ──────────────────────────────
//
// Captions and audio are independent options, so there are four files an author can produce.
// The one driven above is "both". These two are the ones a unit test can only inspect as a
// string: whether the file actually WORKS is a claim about a real browser (HARD RULE #23).

/** Build a variant, open it offline, and hand the page to `drive`. */
async function variant(label, cues, drive) {
  const out = path.resolve(`.scratch/out/narrated-player-${label}.html`);
  writeFileSync(out, (await buildPlayerHtml({ docHtml, source, title: 'Narrated', now: 0, narration: cues })).html);
  const p = await ctx.newPage();
  const seen = [];
  p.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  p.on('requestfailed', (r) => seen.push(`request attempted: ${r.url().slice(0, 80)}`));
  await p.goto(`file://${out}`);
  await p.waitForSelector('#lp-play');
  await drive(p);
  check(`${label}: no CSP refusal, page error, or network attempt`, seen.length === 0, seen.join(' | ') || 'clean');
  await p.close();
}

// AUDIO ONLY — the deck speaks and advances itself with no band on screen at all.
await variant(
  'audio-only',
  { ...narration, captions: false },
  async (p) => {
    check('audio-only: no caption band is in the document', (await p.locator('#lp-caption').count()) === 0);
    await p.click('#lp-play');
    const playing = await p.evaluate(async () => {
      const a = document.querySelector('audio');
      if (!a) return { found: false };
      const t0 = a.currentTime;
      await new Promise((r) => setTimeout(r, 250));
      return { found: true, advanced: a.currentTime > t0 || a.ended, paused: a.paused };
    });
    check('audio-only: the voice still plays', playing.found && (playing.advanced || !playing.paused), JSON.stringify(playing));
    // The point of the variant: it must still DRIVE the deck, with no crawl to drive it.
    await p.waitForFunction(() => document.getElementById('lp-count').textContent.trim().startsWith('2'), null, { timeout: 10000 });
    check('audio-only: the deck still advances itself', true);
  },
);

// CAPTIONS ONLY — a teleprompter read-along on the player's own wall clock, no audio at all.
// With no clip anywhere, every length is known before Play, so this is also where the player's
// own timing is checked against the LTT's: each slide must ARRIVE when `timeline()` says it
// starts (engineering/ltt.md §The transport; the conformance fixtures pin the same arithmetic).
const captionsOnly = { ...narration, voice: null, slides: narration.slides.map((s) => ({ ...s, clips: [] })) };
await variant('captions-only', captionsOnly, async (p) => {
  check('captions-only: the band is there', (await p.locator('#lp-caption').count()) === 1);
  const ltt = await p.evaluate(() => JSON.parse(document.querySelector('script[data-lp-ltt]').textContent));
  const plan = timeline(unpack(ltt));
  // Record when each slide arrives, measured in the page from the click that starts Play.
  await p.evaluate(() => {
    window.__arrivals = [];
    const count = document.querySelector('body > #lp-bar > #lp-count');
    let last = count.textContent;
    new MutationObserver(() => {
      if (count.textContent !== last) {
        last = count.textContent;
        window.__arrivals.push(performance.now() - window.__t0);
      }
    }).observe(count, { childList: true, characterData: true, subtree: true });
    document.getElementById('lp-play').addEventListener('click', () => { window.__t0 = performance.now(); }, { capture: true, once: true });
  });
  await p.click('#lp-play');
  await p.waitForFunction(() => document.querySelector('#lp-caption .lp-cap-line.lp-now'), null, { timeout: 4000 });
  check('captions-only: the first line lights up', (await p.textContent('#lp-caption .lp-cap-line.lp-now')).trim() === 'The first thing we need to talk about.');
  // The wall clock is the whole mechanism here — with no media element to read, the crawl
  // times off `silentFrom`. If that path were broken the highlight would sit on word one.
  const before = await p.locator('#lp-caption .lp-cap-line.lp-now .lp-cap-w.lp-said').count();
  await p.waitForTimeout(400);
  const after = await p.locator('#lp-caption .lp-cap-line.lp-now .lp-cap-w.lp-said').count();
  check('captions-only: the highlight advances on the wall clock', after > before, `${before} -> ${after} words lit`);
  check('captions-only: no audio element is ever created', (await p.locator('audio').count()) === 0);
  await p.waitForFunction(() => window.__arrivals.length >= 2, null, { timeout: 20000 });
  const arrivals = await p.evaluate(() => window.__arrivals);
  // The player advances FIRST and then holds, so slide n+1 arrives the moment slide n's segment
  // ends, which is where timeline() starts slide n+1 (its hold is the head of its own segment).
  const expected = plan.segments.slice(1).map((s) => Math.round(s.startMs));
  const drift = arrivals.slice(0, 2).map((a, i) => Math.round(a - expected[i]));
  // Timers only ever fire LATE, by a few ms each; this deck arms ~8 of them before slide 3.
  check('captions-only: each slide arrives when the LTT timeline says', drift.every((d) => d >= -5 && d < 120), `expected ${expected.slice(0, 2).join(', ')} ms, arrived ${arrivals.slice(0, 2).map(Math.round).join(', ')} ms (drift ${drift.join(', ')} ms)`);
});

// CLIPS THAT ARE NOT THE LENGTH THE ESTIMATE SAID. Every clip above is generated at exactly its
// cue's estimate, which hides the one thing the voice path does that captions never do: re-time the
// crawl to the clip it got (cursor.align) and advance when the clip ENDS (rule 3), not when the
// estimate says. So these clips run 1.3x and 0.7x their estimate and each carries a 46 ms encoder
// lead (rule 7). The expected arrivals are timeline() over the file's own LTT with each clip's real
// length filled in as measuredMs — what a producer that decoded the clips would have written.
{
  const factors = [1.3, 0.7, 1.3];
  const LEAD = 46;
  const lengths = [];
  const odd = {
    voice: VOICE,
    slides: narration.slides.map((sl, i) => {
      if (!sl) return null;
      return {
        ...sl,
        clips: sl.track.cues.map((c, k) => {
          const ms = Math.round(Math.max(200, c.endMs - c.startMs) * factors[(i + k) % factors.length]) + LEAD;
          lengths.push({ i, k, ms });
          const uri = wavDataUri(ms);
          return { audio: uri, clip: clipHash(uri), leadMs: LEAD };
        }),
      };
    }),
  };
  await variant('measured-clips', odd, async (p) => {
    const packed = await p.evaluate(() => JSON.parse(document.querySelector('script[data-lp-ltt]').textContent));
    const ltt = unpack(structuredClone(packed)); // unpack copies shallowly: keep `packed` estimate-only
    for (const { i, k, ms } of lengths) {
      const clip = ltt.segments[i].audio.clips.find((c) => c.cue === k);
      clip.measuredMs = ms;
    }
    const plan = timeline(ltt);
    await p.evaluate(() => {
      window.__arrivals = [];
      const count = document.querySelector('body > #lp-bar > #lp-count');
      let last = count.textContent;
      new MutationObserver(() => {
        if (count.textContent !== last) {
          last = count.textContent;
          window.__arrivals.push(performance.now() - window.__t0);
        }
      }).observe(count, { childList: true, characterData: true, subtree: true });
      document.getElementById('lp-play').addEventListener('click', () => { window.__t0 = performance.now(); }, { capture: true, once: true });
    });
    await p.click('#lp-play');
    await p.waitForFunction(() => window.__arrivals.length >= 2, null, { timeout: 30000 });
    const arrivals = await p.evaluate(() => window.__arrivals);
    const expected = plan.segments.slice(1, 3).map((s) => Math.round(s.startMs));
    const drift = arrivals.slice(0, 2).map((a, n) => Math.round(a - expected[n]));
    // THE DRIFT BUDGET IS PER CLIP, and it is measured, not guessed. Chromium fires a media
    // element's `ended` 90–110 ms after the audio content stops (1,000 ms of speech: \`playing\` at
    // 21 ms, \`ended\` at 1,124 ms — .scratch/latency.mjs in the step-2 PR), and rule 3 advances on
    // `ended`. So the HTML player runs late of any computed timeline by about that much per clip.
    // Slide 2 arrives after two clips and slide 3 after three.
    const clipsBefore = [2, 3];
    const PER_CLIP = 130;
    check('measured-clips: the deck advances on the clips\' REAL ends, where timeline() puts them with measuredMs', drift.every((d, n) => d >= -20 && d < clipsBefore[n] * PER_CLIP), `expected ${expected.join(', ')} ms, arrived ${arrivals.slice(0, 2).map(Math.round).join(', ')} ms (drift ${drift.join(', ')} ms, budget ${clipsBefore.map((c) => c * PER_CLIP).join(', ')} ms: ~100 ms of \`ended\` latency per clip)`);
    // The estimate-only timeline would be off by the clips' length error — show that it is.
    const estimated = timeline(unpack(structuredClone(packed))).segments.slice(1, 3).map((s) => Math.round(s.startMs));
    check('measured-clips: and NOT where the estimate-only timeline puts them', Math.abs(arrivals[0] - estimated[0]) > 300, `estimate says ${estimated.join(', ')} ms`);
  });
}

// A CLIP THAT WILL NOT DECODE (followups.d/2347-p2-…, engineering/ltt.md transport rule 4). The
// PR #2347 checker's repro: the first cue carries a truncated WAV header. The player used to stop
// on it — aria-pressed false from the first sample, caption empty, never leaving slide 1 — because
// the rejected play() ran the autoplay-refusal branch and cleared the fallback. It must instead
// show the caption, crawl on the estimate, hold its beat and carry on.
await variant(
  'decode-failure',
  { ...narration, slides: [said('This clip is corrupt. The next one plays.', ['data:audio/wav;base64,UklGRg==', true]), ...narration.slides.slice(1)] },
  async (p) => {
    await p.click('#lp-play');
    await p.waitForTimeout(250);
    check('decode-failure: narration keeps playing', (await p.getAttribute('#lp-play', 'aria-pressed')) === 'true');
    check('decode-failure: the failed cue still shows its caption', ((await p.textContent('#lp-caption .lp-cap-line.lp-now')) || '').trim() === 'This clip is corrupt.');
    await p.waitForFunction(() => { const e = document.querySelector('#lp-caption .lp-cap-line.lp-now'); return e?.textContent.trim() === 'The next one plays.'; }, null, { timeout: 6000 });
    check('decode-failure: it moves on to the next cue, which plays its real clip', await p.evaluate(() => !!document.querySelector('audio') && document.querySelector('audio').currentSrc.startsWith('data:audio/wav')));
    await p.waitForFunction(() => document.getElementById('lp-count').textContent.trim().startsWith('2'), null, { timeout: 10000 });
    check('decode-failure: and the deck still advances itself', true);
  },
);

// ── a deck that FORGES the player's own ids (#1462 item 3) ────────────────────────────────
//
// The document body IS deck content, `id` survives sanitization, and every chrome node is
// emitted AFTER the slides — so a slide carrying `id="lp-next"` used to win tree order and the
// shipped Next button ended up with NO HANDLER AT ALL. Keyboard nav still worked, which is
// exactly why it went unnoticed: the deck looked healthy until someone clicked the control.
//
// This is the check that has to run on a real surface. A string assertion proves the selector
// changed; only a real click proves the transport is bound to the player's own button.
{
  // NESTED, not flat. A flat <div id="lp-next"> is the easy case and the one the first version
  // of this check forged — which is exactly why it passed against a fix that did not work. A
  // slide can rebuild the whole PARENT CHAIN, and a descendant selector like
  // '#lp-app > #lp-nav > #lp-next' matches it; since this chrome is emitted after the slides,
  // the forged copy wins document order. Twelve lookups fell to this, including #lp-caption,
  // which had been "scoped" since #1393. Forge both shapes.
  const flat = ['lp-count', 'lp-stage', 'lp-mode', 'lp-full', 'lp-notes-btn'].map((id) => `<div id="${id}"></div>`).join('');
  const chained =
    '<div id="lp-app">' +
    '<div id="lp-nav"><button id="lp-prev">F</button><button id="lp-next">F</button></div>' +
    '<div id="lp-read-nav"><button id="lp-top">F</button><button id="lp-bottom">F</button></div>' +
    '<div id="lp-notes"><div id="lp-notes-body">FORGED NOTES</div></div>' +
    '<div id="lp-doc"><div id="lp-toc">F</div><div id="lp-article">F</div></div>' +
    '<div id="lp-caption">FORGED BAND</div>' +
    '<div id="lp-stage"></div>' +
    '</div>' +
    '<div id="lp-bar"><div class="lp-seg"><button data-lp-btn="read-article">F</button></div>' +
    '<button id="lp-play">F</button><span id="lp-count">99 / 99</span></div>';
  const hostileDoc = docHtml.replace('<h1>Slide one</h1>', `<h1>Slide one</h1>${flat}${chained}`);
  const out = path.resolve('.scratch/out/narrated-player-forged-ids.html');
  writeFileSync(out, (await buildPlayerHtml({ docHtml: hostileDoc, source, title: 'Forged', now: 0, narration })).html);
  const p = await ctx.newPage();
  const seen = [];
  p.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  await p.goto(`file://${out}`);
  await p.waitForSelector('#lp-play');
  check("forged ids: the author's elements really are in the shipped file", (await p.locator('section[data-lattice-slide] #lp-next').count()) === 1);
  check('forged ids: the caption band resolves to the PLAYER\'s node, not the deck\'s', await p.evaluate(() => {
    const app = document.querySelector('body > #lp-app');
    const band = app?.querySelector(':scope > #lp-caption');
    return !!band && !band.closest('section[data-lattice-slide]');
  }));

  // THE ACTUAL REGRESSION: click the on-screen Next button.
  const startedAt = await p.evaluate(() => document.querySelector('body > #lp-bar > #lp-count').textContent.trim());
  await p.click('body > #lp-app > #lp-nav > #lp-next');
  await p.waitForTimeout(150);
  const afterClick = await p.evaluate(() => document.querySelector('body > #lp-bar > #lp-count').textContent.trim());
  check('forged ids: the on-screen Next button still advances the deck', afterClick !== startedAt, `${startedAt} -> ${afterClick}`);

  await p.click('body > #lp-app > #lp-nav > #lp-prev');
  await p.waitForTimeout(150);
  check('forged ids: and Previous comes back', (await p.evaluate(() => document.querySelector('body > #lp-bar > #lp-count').textContent.trim())) === startedAt);

  // The counter must be the player's own, not the deck's empty div.
  check('forged ids: the slide counter reads the player\'s own element', /\d/.test(afterClick), afterClick);

  // And narration still binds — the path that failed loudest when a forged #lp-caption won.
  await p.click('body > #lp-bar > #lp-play');
  await p.waitForTimeout(300);
  check('forged ids: narration still starts', (await p.getAttribute('body > #lp-bar > #lp-play', 'aria-pressed')) === 'true');
  check('forged ids: no page error from a hijacked lookup', seen.length === 0, seen.join(' | ') || 'clean');
  await p.close();
}

await browser.close();
console.log(process.exitCode ? '\nFAILED' : '\nALL CHECKS PASSED');
