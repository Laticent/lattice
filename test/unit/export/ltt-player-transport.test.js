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
