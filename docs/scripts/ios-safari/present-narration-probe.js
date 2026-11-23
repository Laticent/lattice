/**
 * THE PRESENT NARRATION PROBE, the page half. run.mjs drives it in Mobile Safari in an iPhone iOS Simulator and reads the
 * simulator's WebKit footprint on the Mac while Present plays; probe.selftest.mjs runs the same steps in Playwright's
 * WebKit, where no footprint can be read. Each step is a global function that resolves to plain JSON:
 *
 *   latticeNarrationReceive(b64, i, n)  one piece of the `.lattice` fixture (present-narration.mjs)
 *   latticeNarrationImport(title)       hand the bytes to the Studio's own "Import deck…" input and wait for the preview
 *   latticeNarrationVoice(provider)     install the stand-in voice: a cloud voice selected, a key stored, and the
 *                                       provider's speech call answered in the page with a silent WAV as long as the
 *                                       sentence would take to say. 'openrouter-gemini' is the owner's voice, Gemini
 *                                       3.1 Flash TTS through OpenRouter: asked for `pcm`, answered headerless PCM.
 *                                       'openrouter' (Kokoro, answered WAV) and 'gemini' (Gemini's own API, JSON with
 *                                       base64 WAV inside) are the other cloud paths. Run AFTER boot, never before: boot validates a stored key with
 *                                       OpenRouter, and from a simulator that real call would reject a stand-in key.
 *   latticeNarrationReady(voiceOn)      open Present on slide 1, turn Guide on, set the voice, and say where Play is:
 *                                       the runner TAPS it, because on iOS only a real touch unlocks audio
 *   latticeNarrationPlayButton()        Play itself, for a WebDriver element click (a native click Safari counts as a
 *                                       user gesture, which is what lets Present resume its AudioContext)
 *   latticeNarrationStarted(ms)         after the press: Present is playing (the runner tries the next way if not)
 *   latticeNarrationNext()              Present's Next: the runner walks the deck, since the simulator cannot unlock audio
 *   latticeNarrationSample()            where Present is, how much audio the page has decoded and still holds, how many
 *                                       sentences it asked to have spoken, and the mark latticeNarrationReady left (gone
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

/** Bytes to base64, in chunks so a long clip never builds one giant argument list. */
function latticeNarrationBase64(buf) {
	const b = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
	return btoa(bin);
}

/** The stand-in voice. 'openrouter-gemini' (the owner's: Gemini 3.1 Flash TTS through OpenRouter) asks OpenRouter for
 *  `pcm` and gets headerless PCM back; 'openrouter' is Kokoro through OpenRouter, answered with WAV; 'gemini' answers
 *  Gemini's own `generateContent`, JSON with the WAV clip base64 inside (voice-model.js). */
function latticeNarrationVoice(provider = 'openrouter-gemini') {
	const stats = { speech: 0, pcm: 0, decodedMB: 0, clips: 0, liveMB: 0, sampleRate: 0 };
	window.__latticeNarration = stats;
	const realFetch = window.fetch.bind(window);
	const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (url.startsWith('https://generativelanguage.googleapis.com/')) {
			const bare = url.split('?')[0];
			if (bare.endsWith(':generateContent')) {
				stats.speech++;
				let words = 1;
				try {
					words = String(JSON.parse(init?.body || '{}').contents?.[0]?.parts?.[0]?.text || '').split(/\s+/).filter(Boolean).length;
				} catch {}
				return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: latticeNarrationBase64(latticeNarrationWav(words / 2.6)) } }] } }] });
			}
			if (bare.endsWith('/models')) return json({ models: [{ name: 'models/gemini-3.8-flash-tts' }, { name: 'models/gemini-3.8-flash-lite-tts' }] });
			if (bare.endsWith('/voices')) return json({ voices: [{ id: 'Kore', display_name: 'Kore', gender: 'female' }] });
			return json({});
		}
		if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
		if (url.includes('/audio/speech')) {
			stats.speech++;
			let body = {};
			try {
				body = JSON.parse(init?.body || '{}');
			} catch {}
			// About 2.6 words a second, a narrator's pace (2026-07-12-narration-pace-model.md).
			const wav = latticeNarrationWav(String(body.input || '').split(/\s+/).filter(Boolean).length / 2.6);
			// A Gemini model asks for `pcm` (voice-model.js `isPcmOnlyModel`), and OpenRouter answers headerless 16-bit PCM
			// with its geometry in the content type, as it does for google/gemini-3.1-flash-tts-preview.
			if (body.response_format === 'pcm') stats.pcm++;
			if (body.response_format === 'pcm') return new Response(wav.slice(44), { status: 200, headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' } });
			return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
		}
		if (url.includes('/models'))
			return json({
				data: [
					{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', pricing: { prompt: '0.0000006', completion: '0' }, architecture: { output_modalities: ['speech'] }, supported_voices: ['af_heart'] },
					{ id: 'google/gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS', pricing: { prompt: '0.000001', completion: '0' }, architecture: { output_modalities: ['speech'] }, supported_voices: ['Kore'] },
				],
			});
		if (url.includes('/key')) return json({ data: { label: 'probe', limit: null, usage: 0 } });
		if (url.includes('/credits')) return json({ data: { total_credits: 10, total_usage: 0 } });
		return json({ data: {} });
	};
	// Count every decoded clip, and how much of it is still alive (a FinalizationRegistry drops it once collected). Work,
	// not time: the bytes a 24 kHz WAV decodes to at the context's rate are the same on any machine.
	const reg = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((mb) => (stats.liveMB -= mb)) : null;
	// Every AudioContext the page makes, so a sample can say whether audio is RUNNING. On iOS a context stays
	// 'suspended' unless a real user gesture resumed it, and then narration waits forever: the first run's voice arm sat on
	// slide 1 for eight minutes for exactly that reason (a scripted click on Play).
	stats.contexts = [];
	for (const name of ['AudioContext', 'webkitAudioContext']) {
		const Orig = window[name];
		if (!Orig || Orig.__latticeTracked) continue;
		const Tracked = class extends Orig {
			constructor(...a) {
				super(...a);
				stats.contexts.push(this);
			}
		};
		Tracked.__latticeTracked = true;
		window[name] = Tracked;
	}
	// Count on the REAL AudioContext prototype: the loop above has already swapped window.AudioContext for its Tracked
	// subclass, and patching that would miss every context made before this ran.
	for (const W of [window.AudioContext, window.webkitAudioContext]) {
		const C = W?.__latticeTracked ? Object.getPrototypeOf(W) : W;
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
	// Throwaway keys, joined at run time so no literal in the file has a key's shape
	// (engineering/testing.md §Test data). This body runs in the page, so it cannot import fakeKey.
	if (provider === 'openrouter-gemini') {
		localStorage.setItem('lattice-db-or-key', ['sk-or-v1-', 'probe-present-narration-0d0d'].join(''));
		localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, last: {}, source: 'cloud', provider: 'openrouter', model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore' }));
	} else if (provider === 'gemini') {
		localStorage.setItem('lattice-db-gemini-key', ['AIza', 'ProbePresentNarration000d0d'].join(''));
		localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, last: {}, source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-tts', voice: 'Kore' }));
	} else {
		localStorage.setItem('lattice-db-or-key', ['sk-or-v1-', 'probe-present-narration-0d0d'].join(''));
		localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, last: {}, source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_heart' }));
	}
	return { ok: true, provider };
}

/** Open Present on slide 1, Guide on, the voice on or off, and say where Play is: the RUNNER taps it. On iOS only a
 *  real touch unlocks audio, so a scripted `click()` left the voice arm on slide 1 for eight minutes, its audio never
 *  started (run 43993979079). A real presenter taps Play; so does the probe. */
async function latticeNarrationReady(voiceOn) {
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
	// Where to tap, once Play holds still for five frames and is the element under its own centre (a signal, not a sleep).
	const at = await new Promise((resolve) => {
		let last = '';
		let still = 0;
		const t0 = performance.now();
		const look = () => {
			const r = play.getBoundingClientRect();
			const x = Math.round(r.left + r.width / 2);
			const y = Math.round(r.top + r.height / 2);
			const key = `${x},${y}`;
			still = key === last ? still + 1 : 0;
			last = key;
			const under = document.elementFromPoint(x, y);
			const hit = !!under && play.contains(under);
			if ((still >= 5 && hit) || performance.now() - t0 > 10000) resolve({ x, y, hit });
			else requestAnimationFrame(look);
		};
		look();
	});
	if (!at.hit) throw new Error(`the Play button never held still under its own centre (${at.x},${at.y})`);
	return { mark: window.__latticeNarrationMark, total: h.counter()[1], x: at.x, y: at.y };
}

/** Start logging, in the capture phase, every touch, pointer and click event the page sees, and what it hit: so a press that
 *  "did nothing" says whether it never arrived, arrived somewhere else, or arrived at Play and was ignored. */
function latticeNarrationEvents() {
	const prev = window.__latticeNarrationEvents || [];
	window.__latticeNarrationEvents = [];
	if (!window.__latticeNarrationListening) {
		window.__latticeNarrationListening = true;
		for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
			document.addEventListener(
				type,
				(e) => {
					const t = e.target instanceof Element ? e.target.closest('button') || e.target : null;
					const name = t ? t.getAttribute?.('aria-label') || t.tagName : 'none';
					window.__latticeNarrationEvents?.push(`${type}${e.isTrusted ? '' : '(untrusted)'}@${name}`);
				},
				true,
			);
		}
	}
	return prev.slice(0, 16);
}

/** What the dock's play controls read now. */
function latticeNarrationDock() {
	const h = latticeNarrationHelpers();
	return [...(h.dialog() || document).querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /play|pause|rehears/i.test(l));
}

/** The last way of pressing Play: a scripted click. It starts Present (run 43993979079), but iOS does not count it as a
 *  gesture, so audio stays suspended: the probe reports that rather than calling it narration. */
function latticeNarrationScriptClick() {
	const h = latticeNarrationHelpers();
	const b = h.button(/^Play the presentation$/, h.dialog() || document);
	if (!b) return { error: 'no Play button' };
	b.click();
	return { ok: true };
}

/** Move Present to the next slide, as a presenter's Next does. Navigation needs no user gesture, so a script click is the
 *  real action here. On the iOS Simulator narration cannot play (see `latticeNarrationScriptClick`), so the probe walks the
 *  deck itself: each slide's narration is still requested, fetched and cached, which is the memory under test. */
function latticeNarrationNext() {
	const h = latticeNarrationHelpers();
	const next = h.button(/^Next slide$/, h.dialog() || document);
	if (!next || next.disabled) return { moved: false, slide: h.counter()?.[0] ?? null };
	next.click();
	return { moved: true, slide: h.counter()?.[0] ?? null };
}

/** The Play button itself, for a WebDriver element click (execute/sync returns it as an element reference). */
function latticeNarrationPlayButton() {
	const h = latticeNarrationHelpers();
	return h.button(/^Play the presentation$/, h.dialog() || document) || null;
}

/** After the runner's tap: Present is playing. */
async function latticeNarrationStarted(ms = 15000) {
	const h = latticeNarrationHelpers();
	// ANY button labelled Pause, visible or not. On a phone Present hides its controls once it plays ("controls reveal as
	// you go"), so the Pause button exists but is hidden: requiring it visible read every press as "not playing" (runs
	// 44009322098 and 44009557663, element click, touch and mouse alike, voice on and off).
	const d = () => h.dialog() || document;
	const playing = () => [...d().querySelectorAll('button[aria-label]')].some((b) => b.getAttribute('aria-label') === 'Pause');
	try {
		await h.until(playing, ms, 'Present to start playing after the press');
	} catch (e) {
		// Say what the dock shows instead, so a failure names its own cause.
		const labels = [...d().querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /play|pause|rehears/i.test(l));
		throw new Error(`${e.message}; the dock's play buttons read ${JSON.stringify(labels)}`);
	}
	return { ok: true };
}

function latticeNarrationSample() {
	const h = latticeNarrationHelpers();
	const s = window.__latticeNarration || {};
	const round = (n) => Math.round((n || 0) * 10) / 10;
	const audio = (s.contexts || []).map((c) => c.state).join('/') || 'none';
	return { slide: h.counter()?.[0] ?? null, audio, speech: s.speech || 0, pcm: s.pcm || 0, clips: s.clips || 0, decodedMB: round(s.decodedMB), liveMB: round(s.liveMB), sampleRate: s.sampleRate || 0, mark: window.__latticeNarrationMark || null };
}

// Reached by name from source text (run.mjs's execute-script, probe.selftest.mjs's evaluate), so put on the global object.
Object.assign(globalThis, { latticeNarrationReceive, latticeNarrationImport, latticeNarrationVoice, latticeNarrationReady, latticeNarrationEvents, latticeNarrationDock, latticeNarrationScriptClick, latticeNarrationNext, latticeNarrationPlayButton, latticeNarrationStarted, latticeNarrationSample });
