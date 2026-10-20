#!/usr/bin/env node
/**
 * Live narration, both on the call: a member ON the call with the presenter hears the narration through the call,
 * once, and takes no clips.
 *
 * Two real Chromium browsers (fake microphone), the real Tavola + Trystero transport over the public Nostr relays
 * and real WebRTC. Both join the call; the host MUTES its microphone (a muted sender keeps its track open, so the
 * narration mixed into the send still goes out); the host presents to everyone with Voice on and plays. The cloud
 * voice is answered from a generated tone. The check measures:
 *   - the guest's inbound call audio energy before the host plays (silence) and while it plays (the narration);
 *   - the guest's Voice button says the voice comes through the call (disabled), so it plays no second copy;
 *   - the guest decoded no clip and started no source of its own (nothing arrived as clips);
 *   - the guest never called the voice endpoint.
 * It reaches third-party relays, so it is ON-DEMAND only, never part of the suite or CI.
 *
 * Usage (start the docs dev server first: `cd docs && npm run dev`):
 *   node tools/live-narration-call-check.mjs [--out .scratch/live-narration-call] [--base http://127.0.0.1:4321/studio/]
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const arg = (k, d) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', 'http://127.0.0.1:4321/studio/');
const OUT = `${path.resolve(ROOT, arg('--out', '.scratch/live-narration-call'))}/`;
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = process.env.LIVE_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launch = () =>
	chromium.launch({
		...(executablePath ? { executablePath } : {}),
		args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
	});
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const fail = (m) => {
	console.log(`FAIL: ${m}`);
	process.exitCode = 1;
};
const expectTrue = (ok, m) => (ok ? log(`ok: ${m}`) : fail(m));

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

const seed = ({ isHost }) => {
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
	localStorage.setItem('lattice-docs-mode', 'light');
	if (isHost) localStorage.setItem('lattice-db-or-key', 'sk-or-test-not-a-real-key');
	window.__copied = '';
	try {
		const write = navigator.clipboard.writeText.bind(navigator.clipboard);
		navigator.clipboard.writeText = (t) => {
			window.__copied = t;
			return write(t).catch(() => {});
		};
	} catch {
		/* no clipboard: the link is read from the panel */
	}
	document.addEventListener('DOMContentLoaded', () => {
		const st = document.createElement('style');
		st.textContent = 'astro-dev-toolbar{display:none!important}';
		document.head.append(st);
	});
	// Every peer connection, so the call's inbound audio can be measured.
	const Native = window.RTCPeerConnection;
	window.__livePcs = [];
	// biome-ignore lint/complexity/useArrowFunction: called with `new`.
	window.RTCPeerConnection = function (...a) {
		const pc = new Native(...a);
		window.__livePcs.push(pc);
		return pc;
	};
	window.RTCPeerConnection.prototype = Native.prototype;
	// What the page decodes and starts on its own context (clips would show here; the call does not).
	window.__decoded = 0;
	window.__starts = 0;
	const proto = window.BaseAudioContext?.prototype;
	if (proto?.decodeAudioData) {
		const native = proto.decodeAudioData;
		proto.decodeAudioData = function (...a) {
			window.__decoded++;
			return native.apply(this, a);
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

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write', 'microphone'] });
await hctx.addInitScript(seed, { isHost: true });
let hostTts = 0;
await hctx.route(/openrouter\.ai\//, (route) => {
	if (route.request().url().includes('/audio/speech')) {
		hostTts++;
		return route.fulfill({ status: 200, contentType: 'audio/wav', body: tone(1400, 330 + (hostTts % 5) * 40) });
	}
	return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
});
const host = await hctx.newPage();
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Sharmarke');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
await host.locator('button[aria-label="Session options"]').click();
await host.getByRole('menuitem', { name: 'Copy invite link' }).click();
const link = await host.waitForFunction(() => window.__copied || null, null, { timeout: 15000 }).then((h) => h.jsonValue());

const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write', 'microphone'] });
await gctx.addInitScript(seed, { isHost: false });
let guestTts = 0;
await gctx.route(/openrouter\.ai\//, (route) => {
	if (route.request().url().includes('/audio/speech')) guestTts++;
	return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
});
const guest = await gctx.newPage();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Amina');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Amina"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Amina"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
log('guest admitted');

// Both join the call; the host mutes its microphone (the fake device beeps, which would hide the narration).
const panel = (page) => page.locator('[data-live-panel]');
await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await panel(guest).getByRole('button', { name: 'Join audio' }).click();
await panel(host).getByRole('button', { name: 'Join audio' }).click();
await guest.waitForSelector('audio[data-live-audio]', { state: 'attached', timeout: 30000 });
await panel(host).getByRole('button', { name: 'Mute', exact: true }).click();
await guest.waitForFunction(() => [...document.querySelectorAll('[data-live-panel] li')].some((li) => li.textContent?.includes('Sharmarke') && li.querySelector('[aria-label="Muted"]')), null, { timeout: 20000 });
log('both on the call; the host is muted');

const energy = (page) =>
	page.evaluate(async () => {
		let e = 0;
		for (const pc of window.__livePcs ?? []) for (const st of (await pc.getStats()).values()) if (st.type === 'inbound-rtp' && st.kind === 'audio') e += st.totalAudioEnergy ?? 0;
		return e;
	});
const rate = async (page, ms) => {
	const e0 = await energy(page);
	await page.waitForTimeout(ms);
	return ((await energy(page)) - e0) / (ms / 1000);
};
const quiet = await rate(guest, 4000);
log(`guest inbound call audio energy before the host plays: ${quiet.toFixed(4)}/s`);

// The host presents to everyone with Voice on and plays.
await host.locator('button[aria-label="Session options"]').click();
await host.locator('[data-live-present-all]').click();
const hostVoice = host.getByRole('button', { name: /^Voice off/ });
await hostVoice.waitFor({ timeout: 20000 });
await hostVoice.click();
await host.getByRole('button', { name: 'Play the presentation' }).click();
log('host presenting with Voice on, playing');
await guest.waitForSelector('[data-live-rejoin], button[aria-label^="Voice"]', { timeout: 30000 });
const voiceBtn = guest.getByRole('button', { name: /^Voice (off|on)/ });
await voiceBtn.waitFor({ timeout: 30000 });
expectTrue(await voiceBtn.isDisabled(), "the guest's Voice button is disabled: the voice comes through the call, so no second copy plays");
const playing = await rate(guest, 8000);
log(`guest inbound call audio energy while the host narrates: ${playing.toFixed(4)}/s`);
expectTrue(playing > Math.max(0.05, quiet * 10), 'the guest hears the narration through the call (energy up from silence)');
await guest.screenshot({ path: `${OUT}guest-on-call.png` });
await host.screenshot({ path: `${OUT}host-on-call.png` });
const own = await guest.evaluate(() => ({ decoded: window.__decoded, starts: window.__starts }));
log(`guest's own audio context: ${own.decoded} clip(s) decoded, ${own.starts} source(s) started`);
expectTrue(own.decoded === 0, 'the guest decoded no clips (none were sent to a member on the call)');
log(`voice endpoint calls: host ${hostTts}, guest ${guestTts}`);
expectTrue(hostTts > 0 && guestTts === 0, 'the presenter synthesized and the member never did');

await hb.close();
await gb.close();
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS');
