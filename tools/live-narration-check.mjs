#!/usr/bin/env node
/**
 * Live narration check: a presenter's narration reaches a member who is NOT on the call, from clips.
 *
 * Two real browsers, the real Tavola + Trystero transport over the public Nostr relays and real WebRTC
 * (as `tools/live-session-check.mjs`). The host holds a (fake) OpenRouter key and presents to everyone with
 * Voice on; the cloud voice is answered from a generated tone, so no money is spent and nothing leaves the
 * machine. The guest has no key and does not join the call. The check shows:
 *   - the host asked the voice endpoint, and the guest never did (no member calls TTS);
 *   - the guest's Present asks the host for clips and decodes non-silent audio from them;
 *   - the guest's Present reads "Tap to listen" before the tap, and nothing plays until the tap.
 * It reaches third-party relays, so it is ON-DEMAND only, never part of the suite or CI.
 *
 * Usage (start the docs dev server first: `cd docs && npm run dev`):
 *   node tools/live-narration-check.mjs [--engine chromium|firefox|webkit] [--out .scratch/live-narration]
 *        [--base http://127.0.0.1:4321/studio/] [--phone]
 * `--phone` puts the GUEST (the listener) at 390 px; the host stays at 1440.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const arg = (k, d) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? process.argv[i + 1] : d;
};
const ENGINE = arg('--engine', 'chromium');
const BASE = arg('--base', 'http://127.0.0.1:4321/studio/');
const OUT = `${path.resolve(ROOT, arg('--out', '.scratch/live-narration'))}/`;
const PHONE = process.argv.includes('--phone');
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = ENGINE === 'chromium' ? (process.env.LIVE_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)) : undefined;
const launch = () =>
	pw[ENGINE].launch({
		...(executablePath ? { executablePath } : {}),
		...(ENGINE === 'chromium' ? { args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns'] } : {}),
		...(ENGINE !== 'chromium' && proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
		// Firefox keeps its own certificate store: trust the system's, where a sandbox proxy's CA lives.
		...(ENGINE === 'firefox' ? { firefoxUserPrefs: { 'security.enterprise_roots.enabled': true } } : {}),
	});
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const fail = (m) => {
	console.log(`FAIL: ${m}`);
	process.exitCode = 1;
};
const expectTrue = (ok, m) => (ok ? log(`ok: ${m}`) : fail(m));

/** A 24 kHz mono 16-bit WAV of a tone, as the cloud voice would answer. */
const tone = (ms, hz = 330) => {
	const rate = 24000;
	const n = Math.floor((rate * ms) / 1000);
	const buf = Buffer.alloc(44 + n * 2);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 2, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(1, 22);
	buf.writeUInt32LE(rate, 24);
	buf.writeUInt32LE(rate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 9000), 44 + i * 2);
	return buf;
};

const seed = (isHost) => {
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
	localStorage.setItem('lattice-docs-mode', 'light');
	if (isHost) localStorage.setItem('lattice-db-or-key', 'sk-or-test-not-a-real-key');
	// The dev server's toolbar sits over a phone's bottom bar; it is not part of the product.
	document.addEventListener('DOMContentLoaded', () => {
		const st = document.createElement('style');
		st.textContent = 'astro-dev-toolbar{display:none!important}';
		document.head.append(st);
	});
	// Firefox and WebKit grant no clipboard read, so the invite link is captured as the page writes it.
	window.__copied = '';
	try {
		const write = navigator.clipboard.writeText.bind(navigator.clipboard);
		navigator.clipboard.writeText = (t) => {
			window.__copied = t;
			return write(t).catch(() => {});
		};
	} catch {
		/* no clipboard in this engine: the link is read from the panel instead */
	}
	// What the page's audio actually decodes and starts, so "it played" is measured, not assumed.
	window.__decoded = [];
	window.__starts = 0;
	const proto = window.BaseAudioContext?.prototype;
	if (proto?.decodeAudioData) {
		const native = proto.decodeAudioData;
		proto.decodeAudioData = function (data, ok, bad) {
			const p = native.call(this, data);
			p.then((b) => {
				let peak = 0;
				const ch = b.getChannelData(0);
				for (let i = 0; i < ch.length; i += 16) peak = Math.max(peak, Math.abs(ch[i]));
				window.__decoded.push({ ms: Math.round(b.duration * 1000), peak });
			}).catch(() => {});
			if (ok || bad) p.then(ok, bad);
			return p;
		};
	}
	const Src = window.AudioBufferSourceNode?.prototype;
	if (Src?.start) {
		const start = Src.start;
		Src.start = function (...a) {
			window.__starts++;
			return start.apply(this, a);
		};
	}
};

const size = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const hb = await launch();
const hctx = await hb.newContext({ ignoreHTTPSErrors: ENGINE !== 'chromium', viewport: { width: 1440, height: 900 }, permissions: ENGINE === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
await hctx.addInitScript(seed, true);
let ttsCalls = 0;
await hctx.route(/openrouter\.ai\//, (route) => {
	const url = route.request().url();
	if (url.includes('/audio/speech')) {
		ttsCalls++;
		return route.fulfill({ status: 200, contentType: 'audio/wav', body: tone(1400, 330 + (ttsCalls % 5) * 40) });
	}
	return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
});
const host = await hctx.newPage();
host.on('pageerror', (e) => log(`host pageerror ${e.message}`));
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Sharmarke');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
await host.locator('button[aria-label="Session options"]').click();
await host.getByRole('menuitem', { name: 'Copy invite link' }).click();
const link = await host.waitForFunction(() => window.__copied || null, null, { timeout: 15000 }).then((h) => h.jsonValue());
log('host live');

const gb = await launch();
const gctx = await gb.newContext({ ignoreHTTPSErrors: ENGINE !== 'chromium', viewport: size, permissions: ENGINE === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
await gctx.addInitScript(seed, false);
let guestTts = 0;
await gctx.route(/openrouter\.ai\//, (route) => {
	if (route.request().url().includes('/audio/speech')) guestTts++;
	return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
});
const guest = await gctx.newPage();
guest.on('pageerror', (e) => log(`guest pageerror ${e.message}`));
if (process.env.LIVE_DEBUG) guest.on('console', (m) => ['error', 'warning'].includes(m.type()) && log(`guest console ${m.type()} ${m.text().slice(0, 240)}`));
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Amina');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Amina"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Amina"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
log('guest admitted; neither is on the call');
await guest.waitForTimeout(1500);

// The host presents to everyone, with Voice on.
await host.locator('button[aria-label="Session options"]').click();
await host.locator('[data-live-present-all]').click();
const hostVoice = host.getByRole('button', { name: /^Voice off/ });
await hostVoice.waitFor({ timeout: 20000 });
await hostVoice.click();
log('host presenting to everyone, Voice on');
await host.screenshot({ path: `${OUT}${ENGINE}-host-present.png` });

// The guest's Present opens on its own, muted, and says what a tap does.
const tap = guest.getByRole('button', { name: /^Voice off/ });
await tap.waitFor({ timeout: 30000 });
expectTrue(!(await tap.isDisabled()), "the guest's Voice button is live (not 'comes through the call')");
expectTrue(/Tap to listen/.test((await tap.textContent()) ?? '') || PHONE, "the guest's Voice button reads 'Tap to listen'");
await guest.screenshot({ path: `${OUT}${ENGINE}-guest-before-tap.png` });
expectTrue((await guest.evaluate(() => window.__starts)) === 0, 'nothing plays on the guest before the tap');
await tap.click();
await guest.getByRole('button', { name: /^Voice on/ }).waitFor({ timeout: 10000 });
// A decoded, non-silent clip on the guest, and a source started from it.
const heard = await guest
	.waitForFunction(() => window.__decoded.some((d) => d.peak > 0.02 && d.ms > 200) && window.__starts > 0, null, { timeout: 45000 })
	.then(() => true, () => false);
const decoded = await guest.evaluate(() => window.__decoded);
log(`guest decoded ${decoded.length} clip(s): ${JSON.stringify(decoded.slice(0, 4))}; sources started: ${await guest.evaluate(() => window.__starts)}`);
expectTrue(heard, 'the guest decoded non-silent audio from the presenter and started playing it');
log(`guest voice button: ${JSON.stringify(((await guest.getByRole('button', { name: /^Voice on/ }).textContent()) ?? '').trim())}`);
await guest.screenshot({ path: `${OUT}${ENGINE}-guest-listening.png` });

// The host steps; the guest follows to the next slide and reads it from the presenter's clips, still with no
// call to the voice endpoint of its own.
const decodedBefore = (await guest.evaluate(() => window.__decoded)).length;
await host.locator('body').click({ position: { x: 700, y: 300 } });
await host.keyboard.press('ArrowRight');
const followed = await guest.waitForFunction(() => /\b2 \/ 7\b/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false);
expectTrue(followed, 'the guest followed the host to slide 2');
const more = await guest.waitForFunction((n) => window.__decoded.length > n, decodedBefore, { timeout: 45000 }).then(() => true, () => false);
expectTrue(more, "the guest decoded the next slide's clips from the presenter");
await guest.screenshot({ path: `${OUT}${ENGINE}-guest-slide2.png` });

log(`voice endpoint calls: host ${ttsCalls}, guest ${guestTts}`);
expectTrue(ttsCalls > 0, 'the presenter synthesized');
expectTrue(guestTts === 0, 'the member never called the voice endpoint');

await hb.close();
await gb.close();
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS');
