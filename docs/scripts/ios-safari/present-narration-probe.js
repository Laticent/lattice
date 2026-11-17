/**
 * THE PRESENT NARRATION PROBE, the page half. run.mjs drives it in Mobile Safari in an iPhone iOS Simulator and reads the
 * simulator's WebKit footprint on the Mac while Present plays; probe.selftest.mjs runs the same steps in Playwright's
 * WebKit, where no footprint can be read. Each step is a global function that resolves to plain JSON:
 *
 *   latticeNarrationReceive(b64, i, n)  one piece of the `.lattice` fixture (present-narration.mjs)
 *   latticeNarrationImport(title)       hand the bytes to the Studio's own "Import deck…" input and wait for the preview
 *   latticeNarrationVoice()             install the stand-in voice: a cloud voice selected, a key stored, and OpenRouter's
 *                                       speech endpoint answered in the page with a silent WAV as long as the sentence
 *                                       would take to say. Run AFTER boot, never before: boot validates a stored key with
 *                                       OpenRouter, and from a simulator that real call would reject a stand-in key.
 *   latticeNarrationPlay(voiceOn)       open Present on slide 1, turn Guide on, set the voice, press Play
 *   latticeNarrationSample()            where Present is, how much audio the page has decoded and still holds, how many
 *                                       sentences it asked to have spoken, and the mark latticeNarrationPlay left (gone
 *                                       means the page reloaded under the probe)
 *
 * The owner's report (2026-11-17): Present with narration and Guide reloads the tab on an iPhone, with narration off it
 * does not. The probe plays the same thing twice, voice on and voice off, so the footprint difference is the narration's.
 * It spends no key (HARD RULE #24): nothing leaves the page for the speech endpoint. Plain browser JS on purpose: WebDriver's
 * execute-script sends source text, not a module.
 */

function latticeNarrationHelpers() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(25);
		}
	};
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const docOf = (sel) => {
		try {
			return document.querySelector(sel)?.contentDocument || null;
		} catch {
			return null;
		}
	};
	const heading = (doc) => doc?.querySelector('section h1, section h2')?.textContent?.trim() ?? '';
	const dialog = () => document.querySelector('[role="dialog"][aria-label="Present"]');
	const counter = () => {
		const m = /(\d+) \/ (\d+)/.exec(dialog()?.textContent || '');
		return m ? [Number(m[1]), Number(m[2])] : null;
	};
	const presented = () => docOf('[aria-label="Presented slide"] iframe.live');
	const preview = () => docOf('[aria-label="Live deck preview"] iframe.live');
	const button = (re, within = document) => [...within.querySelectorAll('button')].find((b) => visible(b) && re.test(b.getAttribute('aria-label') || ''));
	return { sleep, until, heading, dialog, counter, presented, preview, button };
}

function latticeNarrationReceive(b64, i, n) {
	const bin = atob(b64);
	const part = new Uint8Array(bin.length);
	for (let k = 0; k < bin.length; k++) part[k] = bin.charCodeAt(k);
	if (i === 0) window.__latticeNarrationParts = [];
	window.__latticeNarrationParts[i] = part;
	return { got: window.__latticeNarrationParts.filter(Boolean).length, of: n };
}

async function latticeNarrationImport(title) {
	const h = latticeNarrationHelpers();
	const file = new File(window.__latticeNarrationParts || [], 'present-narration.lattice', { type: 'application/zip' });
	window.__latticeNarrationParts = null;
	// "Import deck…"'s input (StudioShell.tsx), found as present-memory-probe.js finds it.
	const input = await h.until(() => document.querySelector('input[type="file"][aria-hidden="true"][tabindex="-1"]'), 150000, "the Studio's import input");
	const dt = new DataTransfer();
	dt.items.add(file);
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	const t0 = Date.now();
	await h.until(() => h.heading(h.preview()) === `${title}.`, 150000, `the preview to show "${title}"`);
	return { importMs: Date.now() - t0, bytes: file.size, ua: navigator.userAgent, width: innerWidth };
}

/** A silent 16-bit mono WAV at 24 kHz, `seconds` long: what a cloud voice returns for a sentence, in bytes and length. */
function latticeNarrationWav(seconds) {
	const samples = Math.max(2400, Math.round(seconds * 24000));
	const buf = new ArrayBuffer(44 + samples * 2);
	const v = new DataView(buf);
	const text = (o, s) => {
		for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
	};
	text(0, 'RIFF');
	v.setUint32(4, 36 + samples * 2, true);
	text(8, 'WAVEfmt ');
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, 1, true);
	v.setUint32(24, 24000, true);
	v.setUint32(28, 48000, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	text(36, 'data');
	v.setUint32(40, samples * 2, true);
	return buf;
}

function latticeNarrationVoice() {
	const stats = { speech: 0, decodedMB: 0, clips: 0, liveMB: 0, sampleRate: 0 };
	window.__latticeNarration = stats;
	const realFetch = window.fetch.bind(window);
	const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
		if (url.includes('/audio/speech')) {
			stats.speech++;
			let words = 1;
			try {
				words = String(JSON.parse(init?.body || '{}').input || '').split(/\s+/).filter(Boolean).length;
			} catch {}
			// About 2.6 words a second, a narrator's pace (2026-07-12-narration-pace-model.md).
			return new Response(latticeNarrationWav(words / 2.6), { status: 200, headers: { 'content-type': 'audio/wav' } });
		}
		if (url.includes('/models')) return json({ data: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', pricing: { prompt: '0.0000006', completion: '0' }, architecture: { output_modalities: ['speech'] }, supported_voices: ['af_heart'] }] });
		if (url.includes('/key')) return json({ data: { label: 'probe', limit: null, usage: 0 } });
		if (url.includes('/credits')) return json({ data: { total_credits: 10, total_usage: 0 } });
		return json({ data: {} });
	};
	// Count every decoded clip, and how much of it is still alive (a FinalizationRegistry drops it once collected). Work,
	// not time: the bytes a 24 kHz WAV decodes to at the context's rate are the same on any machine.
	const reg = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((mb) => (stats.liveMB -= mb)) : null;
	for (const C of [window.AudioContext, window.webkitAudioContext]) {
		if (!C || C.prototype.__latticeCounted) continue;
		C.prototype.__latticeCounted = true;
		const orig = C.prototype.decodeAudioData;
		C.prototype.decodeAudioData = function (...a) {
			return orig.apply(this, a).then((buf) => {
				const mb = (buf.length * buf.numberOfChannels * 4) / 1048576;
				stats.decodedMB += mb;
				stats.liveMB += mb;
				stats.clips++;
				stats.sampleRate = buf.sampleRate;
				reg?.register(buf, mb);
				return buf;
			});
		};
	}
	localStorage.setItem('lattice-db-or-key', 'sk-or-v1-probe-present-narration-0d0d');
	localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, last: {}, source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_heart' }));
	return { ok: true };
}

async function latticeNarrationPlay(voiceOn) {
	const h = latticeNarrationHelpers();
	window.__latticeNarrationMark = `m${Date.now()}`;
	const present = await h.until(() => h.button(/^Present$/), 30000, 'the Present button');
	present.click();
	await h.until(() => h.dialog() && h.counter() && h.heading(h.presented()), 60000, 'the Present dialog and its first slide');
	if (h.counter()[0] !== 1) throw new Error(`Present opened on slide ${h.counter()[0]}, not the first`);
	const d = h.dialog();
	const guide = await h.until(() => h.button(/^Guide (on|off)/, d), 15000, 'the Guide button');
	if (/^Guide off/.test(guide.getAttribute('aria-label'))) guide.click();
	await h.until(() => h.button(/^Guide on/, d), 15000, 'Guide to turn on');
	const voice = await h.until(() => h.button(/^Voice (on|off)/, d), 15000, 'the Voice button');
	if (/^Voice off/.test(voice.getAttribute('aria-label')) === voiceOn) voice.click();
	await h.until(() => h.button(voiceOn ? /^Voice on/ : /^Voice off/, d), 15000, `the voice to turn ${voiceOn ? 'on' : 'off'}`);
	const play = await h.until(() => h.button(/^Play the presentation$/, d), 15000, 'the Play button');
	play.click();
	await h.until(() => h.button(/^Pause$/, d), 15000, 'Present to start playing');
	return { mark: window.__latticeNarrationMark, total: h.counter()[1] };
}

function latticeNarrationSample() {
	const h = latticeNarrationHelpers();
	const s = window.__latticeNarration || {};
	const round = (n) => Math.round((n || 0) * 10) / 10;
	return { slide: h.counter()?.[0] ?? null, speech: s.speech || 0, clips: s.clips || 0, decodedMB: round(s.decodedMB), liveMB: round(s.liveMB), sampleRate: s.sampleRate || 0, mark: window.__latticeNarrationMark || null };
}

// Reached by name from source text (run.mjs's execute-script, probe.selftest.mjs's evaluate), so put on the global object.
Object.assign(globalThis, { latticeNarrationReceive, latticeNarrationImport, latticeNarrationVoice, latticeNarrationPlay, latticeNarrationSample });
