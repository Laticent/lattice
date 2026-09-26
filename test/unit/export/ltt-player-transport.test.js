const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// THE EXPORTED PLAYER'S TRANSPORT, ON A FAKE CLOCK, AGAINST timeline().
//
// The conformance fixtures pin `positionAt`. This pins the PLAYER to it: the transport in
// `narrationJs` (lib/export/player-core.mjs) arms every hold, silent-cue length and breath from
// positionAt, and this test proves it by running the real exported file — the one hashed script,
// unmodified — in jsdom with its timers replaced by a clock the test advances. Every slide must
// arrive exactly when `timeline()` says its segment starts, and narration must stop exactly when
// the last segment ends. A transport that restated a rule by hand (a floor of 250 instead of 300,
// a gap read from the wrong cue) drifts off the timeline here, in CI, instead of in a recipient's
// browser. Audio is out of reach in jsdom, so this is the captions-only fixture: every length is
// known before Play. The real-browser run with clips is tools/verify-narrated-player.mjs.

const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { JSDOM } = require('jsdom');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../docs/src/lib/ltt/conformance/deck-captions-only.json'), 'utf8'));

/** A clock the test owns: setTimeout, rAF, Date.now and performance.now all read it. */
function installClock(window) {
	const clock = { now: 0, seq: 0, queue: new Map() };
	const schedule = (fn, ms) => {
		const id = ++clock.seq;
		clock.queue.set(id, { at: clock.now + Math.max(0, Number(ms) || 0), fn, id });
		return id;
	};
	window.setTimeout = (fn, ms) => schedule(fn, ms);
	window.clearTimeout = (id) => clock.queue.delete(id);
	window.requestAnimationFrame = (fn) => schedule(() => fn(clock.now), 16);
	window.cancelAnimationFrame = (id) => clock.queue.delete(id);
	window.Date.now = () => clock.now;
	window.performance.now = () => clock.now;
	/** Run every timer due up to `until`, in time order (ties in the order they were armed). */
	clock.runUntil = (until, onTick) => {
		for (;;) {
			let next = null;
			for (const t of clock.queue.values()) if (t.at <= until && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
			if (!next) break;
			clock.queue.delete(next.id);
			clock.now = next.at;
			next.fn();
			onTick?.();
		}
		clock.now = until;
	};
	return clock;
}

test('the exported player arrives on every slide when timeline() says, and stops when it ends', async () => {
	const { timeline, unpack } = await import('@laticent/ltt');
	// A three-slide deck narrated with the fixture's own tracks: slide 2 is silent (a hold segment).
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Two</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Three</h2></section>
</body></html>`;
	const slides = FIXTURE.ltt.segments.map((s) => (s.track ? { text: s.track.cues.map((c) => c.display).join(' '), track: s.track, clips: [] } : null));
	const { html } = await buildPlayerHtml({ docHtml, source: '---\npace: natural\n---\n\n# One\n', title: 'T', now: 0, narration: { slides } });

	let clock;
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			clock = installClock(window);
		},
	});
	const { document } = dom.window;
	assert.ok(document.documentElement.classList.contains('lp-js'), 'the player script ran and initialized');

	// The file's own LTT, as the player reads it: the holds are the export's (natural pace, slide 2
	// a divider), and the tracks are the fixture's.
	const ltt = unpack(JSON.parse(document.querySelector('script[data-lp-ltt]').textContent));
	const plan = timeline(ltt);

	const count = () => document.querySelector('body > #lp-bar > #lp-count').textContent.trim();
	const pressed = () => document.getElementById('lp-play').getAttribute('aria-pressed');
	const arrivals = [];
	let last = count();
	let stoppedAt = null;
	const watch = () => {
		if (count() !== last) {
			last = count();
			arrivals.push(clock.now);
		}
		if (stoppedAt === null && pressed() === 'false') stoppedAt = clock.now;
	};

	document.getElementById('lp-play').click();
	assert.equal(pressed(), 'true');
	clock.runUntil(plan.durationMs + 5000, watch);

	assert.deepEqual(arrivals, plan.segments.slice(1).map((s) => s.startMs), 'each slide arrives where its segment starts');
	assert.equal(stoppedAt, plan.durationMs, 'narration stops the moment the last segment ends');
	// The fixture's short cues are what make this bite: a 120 ms cue held to the 300 ms floor and a
	// zero-length one held 900 ms. Restating either rule differently in the transport moves slide 3's
	// end, and so `stoppedAt`.
	assert.ok(ltt.segments[2].track.cues.some((c) => c.endMs - c.startMs < 300), 'the fixture exercises the floor');
	dom.window.close();
});

// WebKit fires loadedmetadata before it knows an MP3's length (duration NaN). The player used to seek
// past the encoder lead right there, and WebKitGTK then treated the clip as 1 ms long, fired `ended`
// at once and skipped the sentence in silence (measured on WebKitGTK 2.52 with espeak-ng speech).
// The seek — and the crawl's re-anchor — now wait for a duration longer than the lead.
test('the lead-trim seek waits for a known duration, so a late-length clip is not skipped', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section></body></html>`;
	const track = buildTrack('A sentence with a clip. A second one.');
	const clip = { audio: 'data:audio/mpeg;base64,AAAA', clip: `sha256:${'ab'.repeat(32)}`, leadMs: 46 };
	const { html } = await buildPlayerHtml({ docHtml, source: '# x', title: 'T', now: 0, narration: { voice: { model: 'm', voice: 'v', speed: 1 }, slides: [{ text: 'x', track, clips: [clip, clip] }] } });
	const media = { seeks: [] };
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			installClock(window);
			// A media element with just enough behavior: play() resolves, duration is what the test
			// says it is, and every currentTime write is recorded.
			const P = window.HTMLMediaElement.prototype;
			Object.defineProperty(P, 'duration', { configurable: true, get() { return this.__dur ?? Number.NaN; } });
			Object.defineProperty(P, 'currentTime', { configurable: true, get() { return this.__t ?? 0; }, set(v) { this.__t = v; media.seeks.push(v); } });
			Object.defineProperty(P, 'paused', { configurable: true, get() { return false; } });
			P.play = function () { media.el = this; return Promise.resolve(); };
			P.pause = () => {};
			P.load = () => {};
		},
	});
	const { document, Event } = dom.window;
	document.getElementById('lp-play').click();
	await Promise.resolve();
	const a = media.el;
	assert.ok(a, 'the first clip was played');
	a.dispatchEvent(new Event('loadedmetadata')); // duration still NaN, as WebKit reports it
	assert.deepEqual(media.seeks, [], 'no seek while the duration is unknown');
	a.__dur = 2.5;
	a.dispatchEvent(new Event('durationchange'));
	assert.deepEqual(media.seeks, [0.046], 'the lead is skipped once the length is known');
	a.dispatchEvent(new Event('durationchange'));
	assert.deepEqual(media.seeks, [0.046], 'and only once');
	dom.window.close();
});

// Rule 6 for a SILENT slide (owner ruling 2026-09-25): a viewer who navigates onto a slide with no
// narration while narration plays wants to look at it, so the player STAYS, still armed, and speaks
// again when they move to a narrated slide. It used to speak the slide, reach endSlide at once and
// leave ~20 ms after the viewer arrived — Previous from slide 3 bounced straight back to 3.
test('manual navigation onto a silent slide stays there, and the next narrated slide speaks', async () => {
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Two</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Three</h2></section>
</body></html>`;
	const slides = FIXTURE.ltt.segments.map((s) => (s.track ? { text: s.track.cues.map((c) => c.display).join(' '), track: s.track, clips: [] } : null));
	const { html } = await buildPlayerHtml({ docHtml, source: '---\npace: natural\n---\n\n# One\n', title: 'T', now: 0, narration: { slides } });
	let clock;
	const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) { clock = installClock(window); } });
	const { document } = dom.window;
	const count = () => document.querySelector('body > #lp-bar > #lp-count').textContent.trim();
	const pressed = () => document.getElementById('lp-play').getAttribute('aria-pressed');
	const caption = () => (document.getElementById('lp-caption')?.textContent ?? '').trim();
	const key = (k) => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

	document.getElementById('lp-play').click();
	clock.runUntil(clock.now + 50);
	assert.ok(caption(), 'slide 1 is speaking');
	key('ArrowRight'); // onto slide 2, which is silent
	clock.runUntil(clock.now + 20_000);
	assert.match(count(), /^2/, 'the player stays on the silent slide the viewer chose');
	assert.equal(pressed(), 'true', 'narration stays armed');
	assert.equal(caption(), '', 'and says nothing there');

	key('ArrowRight'); // onto slide 3, which is narrated
	clock.runUntil(clock.now + 50);
	assert.match(count(), /^3/);
	assert.ok(caption(), 'the next narrated slide speaks');

	key('ArrowLeft'); // Previous, back onto the silent slide: the red team's repro
	clock.runUntil(clock.now + 20_000);
	assert.match(count(), /^2/, 'Previous onto a silent slide no longer bounces back to 3');
	dom.window.close();
});

test('a silent LAST slide the viewer moves to ends narration, as reaching the end does', async () => {
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Two</h2></section>
</body></html>`;
	const s0 = FIXTURE.ltt.segments[0];
	const slides = [{ text: s0.track.cues.map((c) => c.display).join(' '), track: s0.track, clips: [] }, null];
	const { html } = await buildPlayerHtml({ docHtml, source: '---\npace: natural\n---\n\n# One\n', title: 'T', now: 0, narration: { slides } });
	let clock;
	const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) { clock = installClock(window); } });
	const { document } = dom.window;
	document.getElementById('lp-play').click();
	clock.runUntil(clock.now + 50);
	document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	clock.runUntil(clock.now + 5_000);
	assert.match(document.querySelector('body > #lp-bar > #lp-count').textContent.trim(), /^2/);
	assert.equal(document.getElementById('lp-play').getAttribute('aria-pressed'), 'false', 'nothing after the last slide can speak, so narration ends');
	dom.window.close();
});

// RENDER MODE (video export, engineering/decisions/2026-09-25-video-export.md §3). The capture plays
// the export on a virtual clock where media does not play, so a voiced cue must last its clip's
// measured length minus its lead, and the player must never touch the audio element. The proof is
// the same as the first test's: every slide arrives when timeline() — over the LTT with measuredMs
// filled, which is what the capture writes — says it does, and each cue logs its start at its onset.
test('render mode times every voiced cue by its measured clip, on timeline(), without playing audio', async () => {
	const { timeline, unpack, pack, positionAt } = await import('@laticent/ltt');
	const { buildTrack } = await import('@laticent/cadenza');
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Two</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Three</h2></section>
</body></html>`;
	const clip = (n) => ({ audio: 'data:audio/mpeg;base64,AAAA', clip: `sha256:${String(n).repeat(64)}`, leadMs: 370 });
	const t1 = buildTrack('The first slide has two sentences. This is the second one.');
	const t3 = buildTrack('The last slide speaks once.');
	const { html } = await buildPlayerHtml({
		docHtml, source: '# One', title: 'T', now: 0,
		narration: { voice: { model: 'm', voice: 'v', speed: 1 }, slides: [{ text: 'x', track: t1, clips: [clip(1), clip(2)] }, null, { text: 'y', track: t3, clips: [clip(3)] }] },
	});
	// What the capture does before Play: decode every clip and write its length into the file's LTT.
	// Lengths deliberately far from the estimates, so a player that ignored them would drift.
	const measured = [[2900, 1700], null, [1500]];
	let clock;
	const plays = [];
	const render = { log: [] };
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			clock = installClock(window);
			window.__lpRender = render;
			window.HTMLMediaElement.prototype.play = function () { plays.push(this.src); return Promise.resolve(); };
		},
	});
	const { document } = dom.window;
	const block = document.querySelector('script[data-lp-ltt]');
	const ltt = unpack(JSON.parse(block.textContent));
	ltt.segments.forEach((s, i) => { for (const c of s.audio?.clips || []) c.measuredMs = measured[i][c.cue]; });
	block.textContent = JSON.stringify(pack(ltt));
	const plan = timeline(ltt);
	assert.notEqual(plan.durationMs, timeline(unpack(JSON.parse(JSON.stringify(pack({ ...ltt, segments: ltt.segments.map((s) => (s.audio ? { ...s, audio: { ...s.audio, clips: s.audio.clips.map(({ measuredMs, ...c }) => c) } } : s)) }))))).durationMs, 'the measured lengths move the timeline');

	const count = () => document.querySelector('body > #lp-bar > #lp-count').textContent.trim();
	const arrivals = [];
	let last = count();
	let stoppedAt = null;
	document.getElementById('lp-play').click();
	clock.runUntil(plan.durationMs + 5000, () => {
		if (count() !== last) { last = count(); arrivals.push(clock.now); }
		if (stoppedAt === null && document.getElementById('lp-play').getAttribute('aria-pressed') === 'false') stoppedAt = clock.now;
	});
	assert.deepEqual(arrivals, plan.segments.slice(1).map((s) => s.startMs), 'each slide arrives where its segment starts');
	assert.equal(stoppedAt, plan.durationMs, 'narration stops the moment the last segment ends');
	assert.deepEqual(plays, [], 'no clip is played: media does not run on a virtual clock');
	const expected = [];
	ltt.segments.forEach((s, i) => {
		if (!s.track) return;
		positionAt(s, 0).onsets.forEach((o, k) => {
			expected.push({ slide: i, cue: k, at: plan.segments[i].startMs + o });
		});
	});
	assert.deepEqual(render.log.map((e) => ({ ...e })), expected, 'each cue logs its start at its onset on the timeline');
	dom.window.close();
});

// A DECK CANNOT TURN RENDER MODE ON. An element with id="__lpRender" is a named property of the window,
// and a second one with name="log" makes `window.__lpRender.log` an element: truthy. The flag used to
// test truthiness, so such a deck put a viewer's player in render mode and every voiced cue went silent.
test('elements named __lpRender in a deck do not switch a viewer into render mode', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1><a id="__lpRender"></a><a id="__lpRender" name="log"></a></section></body></html>`;
	const track = buildTrack('A sentence with a clip.');
	const clip = { audio: 'data:audio/mpeg;base64,AAAA', clip: `sha256:${'ab'.repeat(32)}`, leadMs: 46 };
	const { html } = await buildPlayerHtml({ docHtml, source: '# x', title: 'T', now: 0, narration: { voice: { model: 'm', voice: 'v', speed: 1 }, slides: [{ text: 'x', track, clips: [clip] }] } });
	assert.match(html, /id="__lpRender"[^>]*>[\s\S]*name="log"/, 'the export keeps the anchors, so the test exercises the clobber');
	const plays = [];
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			installClock(window);
			window.HTMLMediaElement.prototype.play = function () { plays.push(this.src); return Promise.resolve(); };
		},
	});
	dom.window.document.getElementById('lp-play').click();
	assert.equal(plays.length, 1, 'the clip plays: the player is not in render mode');
	dom.window.close();
});
