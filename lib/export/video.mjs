// Video export: a narrated HTML export -> MP4 (H.264 + AAC, a WebVTT caption track) + a .vtt.
//
// THE RULE (owner, 2026-09-25; engineering/decisions/2026-09-25-video-export.md §0): video is an
// export of the Studio's spine, never a second renderer. So this module renders nothing. It opens
// the narrated HTML export itself, in headless Chromium, turns on the player's one render-mode hook
// (`window.__lpRender`, lib/export/player-core.mjs), presses Play, and steps a clock the capture owns
// one frame at a time, capturing the stage after each step. Whatever the export shows, the video
// shows: the same narration, the same transport, the same holds. The three things this module adds
// are the clock, the frame grabber, and the encoder and muxer.
//
// THE AUDIO is muxed from the export's own clips at the times the player logged for each cue, less
// each clip's `leadMs`, so the sound lands where the player showed its words. The caption track and
// the .vtt come from the same LTT, laid out by `timeline()` over the measured clip lengths; the
// capture checks that every logged cue start agrees with that layout to the millisecond, and throws
// if not, because a disagreement means the video and its captions would drift apart.
//
// Encoders: headless Chromium's WebCodecs for H.264, and FFmpeg's AAC encoder compiled to WebAssembly
// (`@mediabunny/aac-encoder`) because Chrome for Testing on Linux cannot encode AAC (the note's fork
// 1d). `mediabunny` muxes. Both load only when a video is exported, and a probe runs before any
// capture so a Chromium with no H.264 encoder stops with an error rather than a broken file.
import { closeSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** The stage the player lays out at fit 1, plus its 40 px inset on each side. */
const INSET = 40;

/** Format ms as a WebVTT timestamp. */
export function vttTime(ms) {
	const t = Math.max(0, Math.round(ms));
	const h = Math.floor(t / 3600000);
	const m = Math.floor(t / 60000) % 60;
	const s = Math.floor(t / 1000) % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t % 1000).padStart(3, '0')}`;
}

/** A cue's text is deck content; WebVTT reads `-->` as a timing line, `<`/`&` as markup, and a blank
 *  line as the end of the cue, so a newline would let a caption write cues of its own. */
const vttText = (s) => String(s).replace(/\s*\n\s*/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Read the narration an export carries: its LTT (packed, in `script[data-lp-ltt]`) and each
 * slide's clip block. Returns null when the file carries no narration.
 */
export async function readExportNarration(html) {
	const { unpack } = await import('@laticent/ltt');
	// Parsed as HTML, not matched with a pattern: the export is someone else's file, and a tag
	// pattern misreads what a browser would not (`</script >`, attributes in another order).
	const { parse } = await import('parse5');
	const blocks = {};
	let packed = null;
	const walk = (node) => {
		if (node.tagName === 'script') {
			const attr = (name) => node.attrs?.find((a) => a.name === name)?.value;
			const text = () => (node.childNodes || []).map((c) => c.value ?? '').join('');
			if (attr('data-lp-ltt') !== undefined && packed === null) packed = text();
			const at = attr('data-lp-audio');
			if (at !== undefined && /^\d+$/.test(at)) blocks[at] = JSON.parse(text());
		}
		for (const c of node.childNodes || []) walk(c);
		if (node.content) walk(node.content);
	};
	walk(parse(html));
	if (packed === null) return null;
	const ltt = unpack(JSON.parse(packed));
	const clipUri = (src, slide) => {
		const r = /^#lp-audio\/(\d+)\/(\d+)$/.exec(src || '');
		// The player plays a block only for its own slide (clipUri in player-core.mjs); so does this.
		if (r) return +r[1] === slide ? (blocks[r[1]]?.[+r[2]] ?? null) : null;
		return /^data:/.test(src || '') ? src : null;
	};
	const clips = [];
	ltt.segments.forEach((s, slide) => {
		for (const c of s.audio?.clips || []) clips.push({ slide, cue: c.cue, uri: clipUri(c.src, slide), leadMs: c.leadMs || 0 });
	});
	return { ltt, clips };
}

/**
 * Every cue's absolute start and played length on the timeline, from the LTT with its measured
 * lengths. The caption track, the .vtt and the capture's own agreement check all read this.
 */
export async function cueTimes(ltt, offsetMs = 0) {
	const { timeline, positionAt } = await import('@laticent/ltt');
	const tl = timeline(ltt);
	const cues = [];
	ltt.segments.forEach((seg, i) => {
		if (seg.kind !== 'slide' || !seg.track?.cues?.length) return;
		const p = positionAt(seg, 0);
		seg.track.cues.forEach((c, k) => {
			cues.push({ slide: i, cue: k, text: c.display, startMs: offsetMs + tl.segments[i].startMs + p.onsets[k], playedMs: p.played[k] });
		});
	});
	return { tl, cues };
}

/** The WebVTT for a list of `cueTimes` cues. */
export function toVtt(cues) {
	return `WEBVTT\n\n${cues.map((c, n) => `${n + 1}\n${vttTime(c.startMs)} --> ${vttTime(c.startMs + c.playedMs)}\n${vttText(c.text)}\n`).join('\n')}`;
}

/**
 * THE FRAME CLOCK, installed in the capture page before the export's own script runs.
 *
 * The page keeps running on real time until `freeze()`, so the export loads, lays out and fits as it
 * does for a viewer. From then on the page reads time only from this clock: `setTimeout`,
 * `setInterval`, `requestAnimationFrame`, `Date.now` and `performance.now` all follow it, and every
 * CSS or Web Animations animation is paused and seeked to it. `advance(ms)` runs every timer due in
 * order, as the transport test's clock does (test/unit/export/ltt-player-transport.test.js), and
 * reports whether anything the frame shows may have changed, so an unchanged frame is not captured
 * again.
 *
 * Why not Chromium's virtual time (`Emulation.setVirtualTimePolicy`), which the note's §0 measured:
 * with the caption crawl running, Chromium stopped producing compositor frames on the virtual clock
 * and every screenshot hung (Chrome for Testing 131, new headless and chrome-headless-shell alike).
 * Here the compositor keeps real time, so a screenshot always has a frame to read.
 */
export function installFrameClock() {
	const real = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window), raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window), now: performance.now.bind(performance), date: Date.now };
	// Fake timer ids start far above any real one, so clearTimeout can tell the two apart.
	const c = { frozen: false, now: 0, seq: 1e9, q: new Map(), dirty: true, anims: new WeakMap() };
	// A timer armed from inside a timer nests one level deeper, and past five levels a browser holds
	// it to at least 4 ms (the HTML timer rule). Without that, a page that re-armed setTimeout(f, 0)
	// forever stopped the clock from ever reaching the next frame (found by the red team).
	let depth = 0;
	const arm = (fn, ms, args, every) => {
		const id = ++c.seq;
		const wait = Math.max(depth >= 5 ? 4 : 0, Number(ms) || 0);
		c.q.set(id, { at: c.now + wait, fn, args, every, id, depth: depth + 1 });
		return id;
	};
	window.setTimeout = (fn, ms, ...args) => (c.frozen ? arm(fn, ms, args, 0) : real.setTimeout(fn, ms, ...args));
	window.setInterval = (fn, ms, ...args) => (c.frozen ? arm(fn, ms, args, Math.max(1, Number(ms) || 0)) : real.setInterval(fn, ms, ...args));
	window.clearTimeout = (id) => { if (!c.q.delete(id)) real.clearTimeout(id); };
	window.clearInterval = (id) => { if (!c.q.delete(id)) real.clearInterval(id); };
	window.requestAnimationFrame = (fn) => (c.frozen ? arm(() => fn(c.now), 1000 / 60, [], 0) : real.raf(fn));
	window.cancelAnimationFrame = (id) => { if (!c.q.delete(id)) real.caf(id); };
	performance.now = () => (c.frozen ? c.now : real.now());
	const epoch = real.date() - real.now();
	Date.now = () => Math.round(epoch + (c.frozen ? c.now : real.now()));
	c.freeze = () => {
		c.now = real.now();
		c.frozen = true;
		// Only what the frame shows counts: the slides' container, not the hidden chrome and caption band.
		c.stage = document.querySelector('.lp-frame')?.parentElement || document.body;
		c.observer = new MutationObserver(() => { c.dirty = true; });
		c.observer.observe(c.stage, { subtree: true, childList: true, attributes: true, characterData: true });
	};
	c.advance = (ms) => {
		const until = c.now + ms;
		let runs = 0;
		for (;;) {
			let next = null;
			for (const t of c.q.values()) if (t.at <= until && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
			if (!next) break;
			if (++runs > 100000) throw new Error('the page ran more than 100,000 timers in one frame');
			c.now = next.at;
			if (next.every) next.at += Math.max(next.every, depth >= 5 ? 4 : 0);
			else c.q.delete(next.id);
			depth = next.depth;
			try { typeof next.fn === 'function' ? next.fn(...next.args) : void 0; } catch (e) { real.setTimeout(() => { throw e; }, 0); }
			depth = 0;
		}
		c.now = until;
		// The player re-fits its stage on every navigation (to about 96%, to make room for its hidden
		// navigation row), so the fit is pinned back to 1 after every step. Written only when it moved.
		const root = document.documentElement.style;
		if (root.getPropertyValue('--lp-fit-present') !== '1') root.setProperty('--lp-fit-present', '1');
		// Every animation, CSS or scripted, is held paused and seeked to the clock.
		let moving = false;
		for (const a of document.getAnimations()) {
			let start = c.anims.get(a);
			if (start === undefined) {
				start = c.now - (Number(a.currentTime) || 0);
				c.anims.set(a, start);
			}
			if (a.playState !== 'paused') a.pause();
			const end = a.effect?.getComputedTiming().endTime;
			const t = c.now - start;
			a.currentTime = Number.isFinite(end) ? Math.min(t, end) : t;
			const el = a.effect?.target;
			if (!(Number.isFinite(end) && t > end + 1000 / 60) && (!el || c.stage.contains(el))) moving = true;
		}
		// takeRecords, because the observer's callback is a microtask that would run only after this
		// step returned: every change was seen one frame late (a slide landing 33 ms late, measured).
		if (c.observer.takeRecords().length) c.dirty = true;
		const dirty = c.dirty || moving || !!document.querySelector('.lp-frame.lp-active canvas');
		c.dirty = false;
		const active = document.querySelector('.lp-frame.lp-active');
		const r = active?.getBoundingClientRect();
		return { dirty, slide: [...document.querySelectorAll('.lp-frame')].indexOf(active), at: r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : '' };
	};
	window.__lpClock = c;
	window.__lpRender = { log: [] };
}

const mediabunnyBundle = () => path.join(path.dirname(require.resolve('mediabunny')), 'mediabunny.min.cjs');
// The package exports only its ES module; the classic-script bundle sits beside it.
const aacBundle = () => path.join(path.dirname(require.resolve('@mediabunny/aac-encoder')), 'mediabunny-aac-encoder.min.js');

/**
 * Render a narrated HTML export to an MP4 and a .vtt.
 *
 * @param {object} o
 * @param {string} o.html              the narrated export, as the Studio or the CLI wrote it
 * @param {string} o.outFile           where the MP4 streams to
 * @param {string} [o.executablePath]  the Chromium to run (it needs WebCodecs H.264)
 * @param {number} [o.fps=30]
 * @param {number} [o.maxSide=1920]   the frame's long side, in pixels: the 1280x720 canvas renders at
 *   device scale 1.5 (1920x1080), a 1080x1920 portrait canvas at 1, a 4K canvas at 0.5
 * @param {number} [o.leadInMs=1000]   hold on slide 1 before Play when slide 1 is silent (fork 7)
 * @param {number} [o.outroMs=1000]    hold on the last slide after narration ends (fork 7)
 * @param {(p: {phase: string, frame?: number, frames?: number}) => void} [o.onProgress]
 * @returns {Promise<{vtt: string, cues: object[], slideStarts: number[], report: object}>}
 *   `cues` and `slideStarts` are the layout the video follows, in ms from its first frame
 */
export async function exportVideo({ html, outFile, executablePath, fps = 30, maxSide = 1920, leadInMs = 1000, outroMs = 1000, onProgress }) {
	const narration = await readExportNarration(html);
	if (!narration) throw new Error('video export needs a narrated HTML export: this file carries no timing track (data-lp-ltt).');
	const { ltt, clips } = narration;
	const { pack } = await import('@laticent/ltt');
	const puppeteer = require('puppeteer');
	const T = {};
	const tic = (k) => { T[k] = -performance.now(); };
	const toc = (k) => { T[k] = Math.round(T[k] + performance.now()); };
	const tmp = mkdtempSync(path.join(os.tmpdir(), 'lattice-video-'));
	// The MP4 is written beside its destination as `.partial` and renamed only when whole, so a run that
	// fails or is interrupted never leaves a truncated file, and never touches a file at `outFile`.
	const partial = `${outFile}.partial`;
	let fd = null;
	const cleanup = () => {
		if (fd !== null) {
			try { closeSync(fd); } catch {}
			fd = null;
		}
		rmSync(partial, { force: true });
		rmSync(tmp, { recursive: true, force: true });
	};
	const onSignal = (sig) => {
		cleanup();
		process.exit(sig === 'SIGINT' ? 130 : 143);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);
	const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--mute-audio'] });
	try {
		// ---- the encoder page: a file:// page is a secure context, which WebCodecs requires ----
		const encFile = path.join(tmp, 'encoder.html');
		writeFileSync(encFile, '<!doctype html><meta charset="utf-8"><title>encoder</title>');
		const enc = await browser.newPage();
		await enc.goto(`file://${encFile}`);
		await enc.addScriptTag({ content: `var module={exports:{}},exports=module.exports;${readFileSync(mediabunnyBundle(), 'utf8')};window.Mediabunny=module.exports;` });
		await enc.addScriptTag({ content: readFileSync(aacBundle(), 'utf8') });

		// ---- the capture page: the export itself, render mode on ----
		const page = await browser.newPage();
		await page.evaluateOnNewDocument(installFrameClock);
		// The stage at fit 1: the player's chrome hidden, its fit pinned, and the viewport sized to the
		// canvas plus the player's 40 px inset.
		const exportFile = path.join(tmp, 'export.html');
		writeFileSync(exportFile, html);
		// The capture page may load its own file and data: URLs, and nothing else. The export is someone
		// else's HTML: without this, one that dropped its own CSP could draw a local file into the video
		// or reach the network (found by the red team).
		await page.setRequestInterception(true);
		page.on('request', (r) => (r.url() === `file://${exportFile}` || r.url().startsWith('data:') ? r.continue() : r.abort('blockedbyclient')));
		await page.setViewport({ width: 1280 + 2 * INSET, height: 720 + 2 * INSET, deviceScaleFactor: 1 });
		await page.goto(`file://${exportFile}`, { waitUntil: 'load' });
		await page.waitForSelector('.lp-frame');
		// The caption band is hidden too: it sits below the stage, outside every frame, and the MP4
		// carries the captions as a track instead. Burned-in captions are a separate mode (note §7).
		await page.addStyleTag({ content: 'body>#lp-bar,#lp-nav,body>#lp-app>#lp-caption{display:none!important}' });
		const settle = () => page.evaluate(() => {
			document.documentElement.style.setProperty('--lp-fit-present', '1');
			return document.fonts.ready.then(() => {
				const f = document.querySelector('.lp-frame.lp-active').getBoundingClientRect();
				return { w: Math.round(f.width), h: Math.round(f.height) };
			});
		});
		const canvas = await settle();
		// The deck's own canvas sets the scale: 16:9 at 1280x720 becomes 1920x1080, and a portrait,
		// square or 4K canvas keeps its shape with its long side at `maxSide`.
		const scale = maxSide / Math.max(canvas.w, canvas.h);
		await page.setViewport({ width: canvas.w + 2 * INSET, height: canvas.h + 2 * INSET, deviceScaleFactor: scale });
		await settle();
		const vw = Math.round(canvas.w * scale) & ~1;
		const vh = Math.round(canvas.h * scale) & ~1;
		// H.264 level 4.0 holds 8,192 macroblocks (1920x1088); 5.1 holds 36,864, past 4K.
		const avc = Math.ceil(vw / 16) * Math.ceil(vh / 16) <= 8192 ? 'avc1.640028' : 'avc1.640033';

		// ---- probe the encoders before anything else is spent ----
		const probe = await enc.evaluate(async ({ vw, vh, avc }) => {
			const MB = window.Mediabunny;
			const h264 = typeof VideoEncoder !== 'undefined' && (await VideoEncoder.isConfigSupported({ codec: avc, width: vw, height: vh })).supported === true;
			let aac = 'native';
			if (!(await MB.canEncodeAudio('aac'))) {
				window.MediabunnyAacEncoder.registerAacEncoder();
				aac = (await MB.canEncodeAudio('aac')) ? 'wasm' : null;
			}
			// THE AUDIO ENCODER'S DELAY, measured rather than assumed. An AAC encoder puts priming
			// samples ahead of the audio (FFmpeg's 1024, Apple's 2112), and without an edit list a decoder
			// plays them, so every sentence would land that late. So a click at 100 ms goes through the
			// same encoder, muxer and decoder, and the capture shifts its mix by however late it comes back.
			let delayMs = 0;
			if (aac) {
				const RATE = 48000;
				const ctx = new OfflineAudioContext(1, RATE / 2, RATE);
				const click = ctx.createBuffer(1, RATE / 2, RATE);
				click.getChannelData(0).fill(0.5, RATE / 10, RATE / 10 + 480);
				const out = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
				const src = new MB.AudioBufferSource({ codec: 'aac', bitrate: 128e3 });
				out.addAudioTrack(src);
				await out.start();
				await src.add(click);
				src.close();
				await out.finalize();
				const input = new MB.Input({ source: new MB.BufferSource(out.target.buffer), formats: MB.ALL_FORMATS });
				let found = -1;
				for await (const { buffer, timestamp } of new MB.AudioBufferSink(await input.getPrimaryAudioTrack()).buffers()) {
					const d = buffer.getChannelData(0);
					const from = Math.round(timestamp * buffer.sampleRate);
					for (let i = 0; i < d.length && found < 0; i++) if (Math.abs(d[i]) > 0.1) found = (from + i) / buffer.sampleRate;
				}
				if (found >= 0) delayMs = found * 1000 - 100;
			}
			return { h264, aac, delayMs, ua: navigator.userAgent };
		}, { vw, vh, avc });
		if (!probe.h264) throw new Error(`this Chromium cannot encode ${vw}x${vh} H.264 (${avc}) through WebCodecs (${probe.ua}). Chrome or Chrome for Testing can; point CHROME_PATH at one.`);
		if (!probe.aac) throw new Error('no AAC encoder is available: neither WebCodecs nor @mediabunny/aac-encoder could encode AAC.');

		// ---- fill measuredMs: decode every clip (the export records none) ----
		tic('decode');
		const lengths = await enc.evaluate(async (uris) => {
			const ctx = new OfflineAudioContext(1, 1, 48000);
			window.__clips = [];
			const out = [];
			for (const u of uris) {
				try {
					if (!u) throw new Error('no clip');
					const b = await ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());
					window.__clips.push(b);
					out.push(b.duration * 1000);
				} catch {
					window.__clips.push(null);
					out.push(null); // rule 4: a clip that will not decode plays as a cue with no clip
				}
			}
			return out;
		}, clips.map((c) => c.uri));
		clips.forEach((c, n) => { c.measuredMs = lengths[n]; c.index = n; });
		// A failed decode drops the clip from its segment, as the live player does after its fallback,
		// so the player and timeline() both lay the cue out as silent.
		for (const seg of ltt.segments) {
			if (!seg.audio) continue;
			seg.audio.clips = seg.audio.clips.filter((x) => {
				const c = clips.find((y) => y.slide === ltt.segments.indexOf(seg) && y.cue === x.cue);
				if (!c || c.measuredMs == null || !(c.measuredMs > (x.leadMs || 0))) return false;
				x.measuredMs = Math.round(c.measuredMs);
				return true;
			});
		}
		const failed = clips.filter((c) => c.measuredMs == null).length;
		if (clips.length && failed === clips.length) throw new Error(`none of the export's ${clips.length} clips would decode, so the video would be silent; no file was written.`);
		await page.evaluate((packed) => { document.querySelector('script[data-lp-ltt]').textContent = packed; }, JSON.stringify(pack(ltt)));
		toc('decode');

		// Fork 7: a silent title slide would last 0 ms (Play advances past it at once), so the video
		// holds it for the lead-in first, and holds the last slide for the outro at the end.
		const silentFirst = ltt.segments[0]?.kind !== 'slide';
		// Snapped to the frame grid, so Play lands exactly on the frame the layout starts from.
		// A voiced first slide speaks at 0 ms, and its first word cannot be placed before zero once the
		// audio is moved earlier by the encoder's delay (below), so it gets the fewest frames that clear it.
		const playFrame = silentFirst ? Math.ceil((leadInMs * fps) / 1000) : Math.ceil((probe.delayMs * fps) / 1000);
		const leadIn = Math.round((playFrame * 1000) / fps);
		const { tl, cues } = await cueTimes(ltt, leadIn);
		const durationMs = leadIn + tl.durationMs + outroMs;
		const frames = Math.ceil((durationMs * fps) / 1000);
		const vtt = toVtt(cues);

		// ---- the encoder: frames and the caption track now, the audio after the capture ----
		// The MP4 streams to disk as the muxer writes it; its few back-patches land by position.
		fd = openSync(partial, 'w');
		let bytes = 0;
		await enc.exposeFunction('__lpWrite', (b64, pos) => {
			const buf = Buffer.from(b64, 'base64');
			writeSync(fd, buf, 0, buf.length, pos);
			bytes = Math.max(bytes, pos + buf.length);
		});
		await enc.evaluate(async ({ vw, vh, fps, vtt }) => {
			const MB = window.Mediabunny;
			const target = new MB.StreamTarget(new WritableStream({ write: (c) => { let bin = ''; for (let i = 0; i < c.data.length; i += 0x8000) bin += String.fromCharCode.apply(null, c.data.subarray(i, i + 0x8000)); return window.__lpWrite(btoa(bin), c.position); } }), { chunked: true });
			const out = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: false }), target });
			const video = new MB.VideoSampleSource({ codec: 'avc', bitrate: 4e6, keyFrameInterval: 2, latencyMode: 'quality' });
			const audio = new MB.AudioBufferSource({ codec: 'aac', bitrate: 128e3 });
			out.addVideoTrack(video, { frameRate: fps });
			out.addAudioTrack(audio, { languageCode: 'eng' });
			const sub = new MB.TextSubtitleSource('webvtt');
			out.addSubtitleTrack(sub, { languageCode: 'eng' });
			await out.start();
			const cv = new OffscreenCanvas(vw, vh);
			window.__enc = { out, video, audio, sub, vtt, cv, g: cv.getContext('2d') };
		}, { vw, vh, fps, vtt });
		const addFrame = (f, png, key) =>
			enc.evaluate(async ({ f, png, fps, key }) => {
				const E = window.__enc;
				if (png) {
					const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
					E.g.drawImage(bmp, 0, 0, E.cv.width, E.cv.height);
					bmp.close();
				}
				const vf = new VideoFrame(E.cv, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
				const s = new window.Mediabunny.VideoSample(vf);
				await E.video.add(s, key ? { keyFrame: true } : undefined);
				s.close();
				vf.close();
			}, { f, png, fps, key });

		// ---- the capture: freeze the page's clock, press Play, then one clock step per frame ----
		tic('capture');
		const cdp = await page.createCDPSession();
		const rect = await page.evaluate(() => {
			// Pinned first: the viewport resize above makes the player re-fit, and the clip is taken at fit 1.
			document.documentElement.style.setProperty('--lp-fit-present', '1');
			const r = document.querySelector('.lp-frame.lp-active').getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
		});
		if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > rect.vw || rect.y + rect.h > rect.vh) throw new Error(`the stage does not fit the capture viewport (${JSON.stringify(rect)})`);
		await page.evaluate(() => window.__lpClock.freeze());
		const frameAt = [rect.x, rect.y, rect.w, rect.h].map(Math.round).join(',');
		let playedAt = null;
		let shown = null;
		const arrivals = [];
		let unique = 0;
		let have = false;
		let at = 0;
		for (let f = 0; f < frames; f++) {
			const t = Math.round((f * 1000) / fps);
			// Step the clock to this frame's time first, then press Play on its frame, so Play and the
			// frame after it share one instant (pressing first put every slide a frame early).
			let { dirty, slide, at: where } = await page.evaluate((ms) => window.__lpClock.advance(ms), t - at);
			if (f === playFrame) {
				playedAt = await page.evaluate(() => { document.querySelector('body > #lp-bar > #lp-play').click(); return performance.now(); });
				// Play changed the page, so this frame is captured whatever the step reports.
				({ slide, at: where } = await page.evaluate(() => window.__lpClock.advance(0)));
				dirty = true;
			}
			if (slide !== shown) {
				if (shown !== null) arrivals.push({ slide, frameMs: t });
				shown = slide;
			}
			at = t;
			// The clip is fixed, so the stage must not move under it: a re-fit or a scroll would crop or
			// shrink every frame after it, and nothing downstream could tell.
			if (where !== frameAt) throw new Error(`the stage moved during the capture at ${t} ms (${where}, expected ${frameAt}); no file was written.`);
			let png = null;
			if (dirty || !have) {
				png = (await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } })).data;
				have = true;
				unique++;
			}
			await addFrame(f, png, f === 0);
			onProgress?.({ phase: 'capture', frame: f + 1, frames });
		}
		const log = await page.evaluate(() => window.__lpRender.log.map((e) => ({ ...e })));
		const endedPlaying = await page.evaluate(() => document.querySelector('body > #lp-bar > #lp-play')?.getAttribute('aria-pressed') === 'false');
		toc('capture');

		// The player must have finished, and voiced every clip that decoded: fewer means a cue fell back
		// to silence inside the capture, and the video would drop a sentence the export speaks.
		if (!endedPlaying) throw new Error('narration was still playing when the capture ended; no file was written.');
		const voiced = ltt.segments.reduce((n, g) => n + (g.audio?.clips?.length ?? 0), 0);
		if (log.length !== voiced) throw new Error(`the player voiced ${log.length} of ${voiced} clips during the capture; no file was written.`);
		// Every voiced cue the player started must start where the caption track says it does. The audio
		// follows the player's log, so a mismatch means the captions would drift from the voice. On the
		// frame clock the player lands on timeline() exactly (0 ms on the 17-slide fixture deck); half a
		// frame is the bound, and past it no file is written.
		const t0 = playedAt ?? 0;
		const byCue = new Map(cues.map((c) => [`${c.slide}:${c.cue}`, c]));
		const drift = log.map((e) => (e.at - t0 + leadIn) - (byCue.get(`${e.slide}:${e.cue}`)?.startMs ?? Number.NaN));
		if (drift.some((d) => !(Math.abs(d) <= 500 / fps))) throw new Error(`the player's cue starts disagree with timeline() (worst ${Math.max(...drift.map(Math.abs))} ms); refusing to write a video whose captions would drift.`);

		// Every slide must be on screen from the first frame at or after the time the layout gives it.
		// The frames are what the viewer sees, so this is the check that the picture is on time too.
		const starts = tl.segments.map((g) => leadIn + g.startMs);
		const lag = arrivals.map((a) => a.frameMs - starts[a.slide]);
		if (arrivals.length !== starts.length - 1 || lag.some((d) => !(d >= -0.5 && d < 1000 / fps + 0.5)))
			throw new Error(`the slides did not arrive on the frames the layout gives them (${arrivals.length} of ${starts.length - 1} arrivals; lags ${lag.map(Math.round).join(', ')} ms); no file was written.`);

		// ---- the audio: each clip at the time the player started its cue, less its lead ----
		tic('encode');
		const place = log.map((e) => {
			const c = clips.find((x) => x.slide === e.slide && x.cue === e.cue);
			// Whole samples, so a clip that spans two mix windows continues without a half-sample step.
			return { index: c.index, head: c.leadMs, at: Math.round(((e.at - t0 + leadIn - c.leadMs - probe.delayMs) / 1000) * 48000) / 48000 };
		});
		// A clip placed before zero loses its head. That is only its declared silence, never speech.
		const cut = place.filter((p) => -p.at * 1000 > p.head + 0.5);
		if (cut.length) throw new Error(`${cut.length} clip(s) would start before the video does and lose speech; no file was written.`);
		await enc.evaluate(async ({ place, durationMs }) => {
			const E = window.__enc;
			// Mixed in 10 s windows, so a long deck never holds its whole mix in memory at once.
			const RATE = 48000;
			const WIN = 10;
			const total = durationMs / 1000;
			for (let w0 = 0; w0 < total; w0 += WIN) {
				const len = Math.min(WIN, total - w0);
				const mix = new OfflineAudioContext(1, Math.max(1, Math.round(len * RATE)), RATE);
				for (const p of place) {
					const b = window.__clips[p.index];
					if (!b || p.at >= w0 + len || p.at + b.duration <= w0) continue;
					const s = mix.createBufferSource();
					s.buffer = b;
					s.connect(mix.destination);
					const into = p.at - w0;
					s.start(Math.max(0, into), Math.max(0, -into));
				}
				await E.audio.add(await mix.startRendering());
				// A clip that ended inside this window is never needed again: free its decoded audio.
				for (const p of place) {
					const b = window.__clips[p.index];
					if (b && p.at + b.duration <= w0 + len) window.__clips[p.index] = null;
				}
			}
			await E.sub.add(E.vtt);
			E.video.close();
			E.audio.close();
			E.sub.close();
			await E.out.finalize();
		}, { place, durationMs });
		toc('encode');
		closeSync(fd);
		fd = null;
		renameSync(partial, outFile);
		return {
			vtt,
			cues,
			slideStarts: tl.segments.map((g) => leadIn + g.startMs),
			report: {
				fps, size: `${vw}x${vh}`, frames, uniqueFrames: unique, durationMs, leadInMs: leadIn, outroMs,
				cues: cues.length, clips: clips.length, clipsThatFailedToDecode: failed, voicedCuesLogged: log.length,
				narrationEnded: endedPlaying, maxCueDriftMs: drift.length ? Math.round(Math.max(...drift.map(Math.abs)) * 10) / 10 : 0,
				maxSlideLagMs: lag.length ? Math.max(...lag) : 0,
				encoders: { video: 'WebCodecs H.264', audio: probe.aac === 'native' ? 'WebCodecs AAC' : 'FFmpeg AAC (WebAssembly)', audioDelayMs: Math.round(probe.delayMs * 10) / 10 }, chromium: probe.ua,
				bytes, wallMs: T,
			},
		};
	} finally {
		process.off('SIGINT', onSignal);
		process.off('SIGTERM', onSignal);
		await browser.close();
		cleanup();
	}
}
