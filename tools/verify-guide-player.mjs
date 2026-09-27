// Real-surface verification for the Guide in the exported HTML player (#2371 followup, P1).
//
// HARD RULE #23: the claim is "a sent `delivery:` deck focuses what its narration names, as the
// Studio does", so the test is a REAL exported file opened over file:// in a real Chromium and
// PLAYED, with the transport's own clock moving the focus. The export is built the way the
// Studio's share-export builds it (`buildPlayerHtml` with a narration payload: the text Cadenza
// timed, its track, one clip per cue). The clips are tones: there is no TTS here, and the focus
// keys on the transport's cue clock, not on what the audio says.
//
// Run: node tools/verify-guide-player.mjs [deck.md]   (writes .scratch/out/guide-player/)
//   The deck defaults to examples/delivery-spark.md. It must set `delivery:` and have a bar slide
//   and a bullet list.
//
// What it checks, and prints as a table: which element every sentence focused, per slide; that
// the rest recedes to the preset's depth; that pausing lifts the focus and playing restores it;
// that a slide change leaves no focus behind; that with the captions off the spoken word lights
// inside the focus (read-along); and that the same deck without `delivery:` ships no Guide at all.
// It writes dark and light screenshots of a bar moment and a bullet moment for export sign-off.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '../docs/node_modules/@playwright/test/index.mjs'; // the docs workspace owns Playwright

const require = createRequire(import.meta.url);
const { buildPlayerHtml } = require('../lib/export/html-player.js');
const { buildTrack } = require('@laticent/cadenza');
const { narrateChart } = require('../lib/core/chart-narration.js');
const { slideToSpeech } = require('../lib/core/slide-speech.js');

const DECK = process.argv[2] || 'examples/delivery-spark.md';
const OUT = path.resolve('.scratch/out/guide-player');
mkdirSync(OUT, { recursive: true });

/** A real, decodable WAV of `ms` milliseconds — a quiet tone, 8 kHz mono 16-bit. */
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
	for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(1500 * Math.sin((2 * Math.PI * 330 * i) / rate)), 44 + i * 2);
	return `data:audio/wav;base64,${buf.toString('base64')}`;
}
const clipHash = (uri) => `sha256:${createHash('sha256').update(Buffer.from(uri.split(',')[1], 'base64')).digest('hex')}`;

// The deck, rendered by the real CLI, and its narration resolved the way Present resolves it: a
// slide's inline caption first, else a recognized chart's narration, else the slide's own text.
// Folded like every deck read (#1349): a BOM or a CRLF would defeat the `^---` split below.
const source = readFileSync(DECK, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const docOut = path.join(OUT, 'deck');
execFileSync(process.execPath, ['lattice-emulator.js', DECK, docOut, '--quiet'], { stdio: 'pipe' });
const docHtml = readFileSync(`${docOut}.html`, 'utf8');
const slidesMd = source.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n---\n/);
const narration = (captions) => ({
	voice: { model: 'verify/tone', voice: '330hz', speed: 1 },
	captions,
	slides: slidesMd.map((md) => {
		if (/_class:[^>]*\bsilent\b/.test(md)) return null;
		const text = /<!--\s*caption:\s*([\s\S]*?)\s*-->/.exec(md)?.[1] ?? narrateChart(md) ?? slideToSpeech(md);
		if (!text) return null;
		const track = buildTrack(text);
		const clips = track.cues.map((c) => {
			const uri = wavDataUri(Math.max(200, c.endMs - c.startMs));
			return { audio: uri, clip: clipHash(uri) };
		});
		return { text, track, clips };
	}),
});

const check = (label, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) process.exitCode = 1;
};

async function exportPlayer(name, { mode, captions = true, src = source }) {
	const { html } = await buildPlayerHtml({ docHtml, source: src, title: 'Guide', now: 0, narration: narration(captions), theme: { name: 'indaco', mode } });
	const f = path.join(OUT, `${name}.html`);
	writeFileSync(f, html);
	return { file: f, html };
}

// ── 1. Without `delivery:` the export carries no Guide at all ────────────────────────────────
const plain = await exportPlayer('no-delivery', { mode: 'light', src: source.replace(/^delivery:.*\n/m, '') });
const guided = await exportPlayer('restrained-light', { mode: 'light' });
check('a deck with no delivery: ships no Guide', !plain.html.includes('__latticeGuide') && !plain.html.includes('data-lp-guide'));
check('a delivery: deck ships the Guide and its marker', guided.html.includes('__latticeGuide') && guided.html.includes('data-lp-guide'));
check('the focus rules ship in the export', /\[data-guide\][^{]*\.lat-guide-dim/.test(guided.html));
console.log(`      size: the Guide adds ${((guided.html.length - plain.html.length) / 1024).toFixed(1)} KB to this export`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.setOffline(true);

/** Open a player and start a focus log: every change of the focused element, with the slide. */
async function open(file, problems) {
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) problems.push(`console: ${m.text()}`);
	});
	await page.goto(`file://${file}`);
	await page.waitForSelector('#lp-play');
	await page.evaluate(() => {
		window.__focusLog = [];
		let last = null;
		const name = (el) => {
			if (!el) return null;
			const label = el.getAttribute('data-label') || el.getAttribute('aria-label') || el.textContent || '';
			return `${el.tagName.toLowerCase()}${el.hasAttribute('data-mark') ? `[mark ${el.getAttribute('data-mark')}]` : ''}: ${label.replace(/\s+/g, ' ').trim().slice(0, 60)}`;
		};
		const tick = () => {
			const on = document.querySelector('.lp-frame.lp-active .lat-guide-undim:not(text)') || null;
			const dimmed = document.querySelectorAll('.lp-frame.lp-active .lat-guide-dim').length;
			const focus = on && dimmed ? name(on) : null;
			// The sentence being read, from the caption band: logged with the focus, so the table says
			// what each sentence focused, not only when the focus moved.
			const said = document.querySelector('#lp-caption .lp-cap-line.lp-now')?.textContent.replace(/\s+/g, ' ').trim() ?? '';
			const now = `${focus}|${said}`;
			if (now !== last) {
				last = now;
				window.__focusLog.push({ t: Math.round(performance.now()), slide: document.getElementById('lp-count').textContent.trim().split(/\s/)[0], said, focus, dimmed });
			}
			requestAnimationFrame(tick);
		};
		tick();
	});
	return page;
}
async function goTo(page, n) {
	await page.keyboard.press('Home');
	for (let i = 1; i < n; i++) await page.keyboard.press('ArrowRight');
}
const slideOf = (re) => slidesMd.findIndex((md) => re.test(md)) + 1;
const BULLETS = slideOf(/_class:\s*content/);
const BAR = slideOf(/_class:\s*bar\b/);

// ── 2. Play the deck through and record what each sentence focused ───────────────────────────
{
	const problems = [];
	const page = await open(guided.file, problems);
	check('the player script ran under its CSP', await page.evaluate(() => document.documentElement.classList.contains('lp-js')));
	check('the Guide bundle initialized', await page.evaluate(() => typeof window.__lpGuide?.cue === 'function'));
	await goTo(page, BULLETS);
	await page.click('#lp-play');
	const last = slidesMd.length;
	// It plays in real time (a tone per sentence), so the budget grows with the deck.
	await page.waitForFunction((n) => Number(document.getElementById("lp-count").textContent.trim().split(/\s/)[0]) >= n, last, { timeout: Math.max(240000, last * 60000) });
	await page.waitForTimeout(1500);
	const log = await page.evaluate(() => window.__focusLog);
	writeFileSync(path.join(OUT, 'focus-log.json'), JSON.stringify(log, null, 2));
	console.log('\n      slide | sentence being read  →  focus (receded peers)');
	for (const row of log) if (row.said) console.log(`      ${String(row.slide).padStart(5)} | ${row.said.slice(0, 70)}  →  ${row.focus ?? '— none —'}${row.focus ? ` (${row.dimmed})` : ''}`);
	console.log('');
	const focused = log.filter((r) => r.focus);
	check('sentences focused something on most narrated slides', new Set(focused.map((r) => r.slide)).size >= Math.min(4, last - BULLETS));
	// Two focused rows in a row are a direct handoff; across a slide change one must never happen.
	check('a focus never carries across a slide change', log.every((r, i) => i === 0 || !r.focus || !log[i - 1].focus || log[i - 1].slide === r.slide));
	check('no page errors or CSP refusals while playing', problems.length === 0, problems.join('; '));
	await page.close();
}

// ── 3. The bullet and bar moments, pause and resume, and the sign-off screenshots ────────────
const signoff = {};
for (const mode of ['light', 'dark']) {
	const { file } = await exportPlayer(`restrained-${mode}`, { mode });
	const problems = [];
	const page = await open(file, problems);
	signoff[mode] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

	// Bullets: the first sentence that names an item focuses it and recedes its siblings.
	await goTo(page, BULLETS);
	await page.click('#lp-play');
	await page.waitForFunction(() => document.querySelector('.lp-frame.lp-active li.lat-guide-undim') && document.querySelector('.lp-frame.lp-active li.lat-guide-dim'), null, { timeout: 20000 });
	await page.waitForTimeout(450); // let the crossfade settle
	const bullet = await page.evaluate(() => {
		const on = document.querySelector('.lp-frame.lp-active li.lat-guide-undim');
		const peer = document.querySelector('.lp-frame.lp-active li.lat-guide-dim');
		return { on: on.textContent.trim(), onOpacity: getComputedStyle(on).opacity, peerOpacity: getComputedStyle(peer).opacity };
	});
	check(`[${mode}] a bullet focuses and its peers recede to 0.45`, bullet.onOpacity === '1' && Math.abs(Number(bullet.peerOpacity) - 0.45) < 0.01, JSON.stringify(bullet));
	await page.screenshot({ path: path.join(OUT, `bullet-${mode}.png`) });

	// Pause lifts the focus; Play replays the slide, and its sentences bring their focus back.
	await page.click('#lp-play');
	await page.waitForTimeout(400);
	const lifted = await page.evaluate(() => document.querySelectorAll('.lp-frame.lp-active .lat-guide-dim, .lp-frame.lp-active .lat-guide-undim').length);
	check(`[${mode}] pausing lifts the focus`, lifted === 0, `${lifted} elements still marked`);
	await page.click('#lp-play');
	const restored = await page.waitForFunction(() => document.querySelector('.lp-frame.lp-active .lat-guide-dim'), null, { timeout: 8000 }).then(() => true, () => false);
	check(`[${mode}] playing again replays the slide with its focus`, restored);
	await page.click('#lp-play');

	// Bar: a sentence naming a category focuses its bar; the other bars AND their labels recede.
	await goTo(page, BAR);
	await page.waitForTimeout(300);
	check(`[${mode}] moving to a new slide leaves no focus behind`, (await page.evaluate(() => document.querySelectorAll('.lat-guide-undim, .lat-guide-dim').length)) === 0);
	await page.click('#lp-play');
	await page.waitForFunction(() => document.querySelector('.lp-frame.lp-active [data-mark].lat-guide-undim'), null, { timeout: 30000 });
	await page.waitForTimeout(450);
	const bar = await page.evaluate(() => {
		const on = document.querySelector('.lp-frame.lp-active [data-mark].lat-guide-undim');
		const peers = [...document.querySelectorAll('.lp-frame.lp-active [data-mark].lat-guide-dim')];
		const labels = [...document.querySelectorAll('.lp-frame.lp-active [data-mark-for].lat-guide-dim')];
		return { on: on.getAttribute('data-label'), peers: peers.length, peerOpacity: peers[0] ? getComputedStyle(peers[0]).opacity : null, labels: labels.length };
	});
	check(`[${mode}] a bar focuses and the others and their labels recede`, bar.peers > 0 && bar.labels > 0 && Math.abs(Number(bar.peerOpacity) - 0.45) < 0.01, JSON.stringify(bar));
	await page.screenshot({ path: path.join(OUT, `bar-${mode}.png`) });
	await page.click('#lp-play');
	check(`[${mode}] no page errors or CSP refusals`, problems.length === 0, problems.join('; '));
	await page.close();
}
check('the sign-off renders are genuinely two modes', signoff.light !== signoff.dark, `${signoff.light} vs ${signoff.dark}`);

// ── 4. Captions off: the spoken word lights inside a focused text element ────────────────────
{
	const { file } = await exportPlayer('restrained-no-captions', { mode: 'light', captions: false });
	const problems = [];
	const page = await open(file, problems);
	check('a captions-off export has no caption band', !(await page.$('#lp-caption')));
	await goTo(page, BULLETS);
	await page.click('#lp-play');
	const lit = await page
		.waitForFunction(() => {
			const h = window.CSS?.highlights?.get('lat-said');
			if (!h?.size) return null;
			const [r] = [...h];
			return r.toString();
		}, null, { timeout: 20000 })
		.then((h) => h.jsonValue(), () => null);
	check('with the captions off, the spoken word lights on the slide', !!lit, `lit "${lit}"`);
	await page.screenshot({ path: path.join(OUT, 'read-along-light.png') });
	await page.click('#lp-play');
	check('no page errors or CSP refusals (captions off)', problems.length === 0, problems.join('; '));
	await page.close();
}

await browser.close();
console.log(`\nartifacts in ${path.relative(process.cwd(), OUT)}/`);
