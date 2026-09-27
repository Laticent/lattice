const test = require('node:test');
const assert = require('node:assert/strict');

// THE EXPORTED PLAYER'S BOOKENDS, ON A FAKE CLOCK, AGAINST timeline().
//
// A deck's `greeting:` plays before slide 1 and its `closing:` after the last slide, each at most
// once per page load (engineering/decisions/2026-09-27-narration-bookends.md). This runs the real
// exported file in jsdom, as ltt-player-transport.test.js does, and pins four things: the greeting
// the viewer hears is the one their clock picks; the whole delivery — greeting, slides, closing —
// lands on `timeline()` to the millisecond; neither bookend repeats; and a video render says the
// neutral "Hello". Captions only, so every length is known before Play.

const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { JSDOM } = require('jsdom');

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

const SLIDE = (n, cls = 'content') => `<section data-lattice-slide="${n}" id="${n}" class="${cls}"><h2>S${n}</h2></section>`;

/** A narrated export: `texts[i]` is slide i's narration ('' for a silent slide). */
async function exportDeck(texts, { greeting = '{greeting}, and welcome.', closing = 'Thank you for listening.' } = {}) {
	const { buildTrack } = await import('@laticent/cadenza');
	const { greetingVariants } = await import('../../../lib/core/resolve-bookends.mjs');
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>${texts.map((_, i) => SLIDE(i + 1)).join('\n')}</body></html>`;
	const slides = texts.map((t) => (t ? { text: t, track: buildTrack(t), clips: [] } : null));
	const bookends = {};
	if (greeting) bookends.greeting = Object.fromEntries(Object.entries(greetingVariants(greeting)).map(([v, text]) => [v, { text, track: buildTrack(text), clips: [] }]));
	if (closing) bookends.closing = { text: closing, track: buildTrack(closing), clips: [] };
	const { html } = await buildPlayerHtml({ docHtml, source: '---\npace: natural\n---\n\n# One\n', title: 'T', now: 0, narration: { slides, bookends } });
	return html;
}

/** Load an export on the fake clock, with the viewer's local hour pinned. */
function open(html, { hour = 15, render = false } = {}) {
	let clock;
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			clock = installClock(window);
			window.Date.prototype.getHours = () => hour;
			if (render) window.__lpRender = { log: [] };
		},
	});
	const { document } = dom.window;
	const band = () => document.querySelector('body > #lp-app > #lp-caption')?.textContent.replace(/\s+/g, ' ').trim() ?? '';
	const count = () => document.querySelector('body > #lp-bar > #lp-count').textContent.trim();
	const pressed = () => document.getElementById('lp-play').getAttribute('aria-pressed');
	const play = () => document.getElementById('lp-play').click();
	const key = (k) => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
	return { dom, document, clock, band, count, pressed, play, key };
}

test('the greeting, every slide and the closing land on timeline(), and the viewer hears their own hour', async () => {
	const { timeline, unpack } = await import('@laticent/ltt');
	const html = await exportDeck(['The first slide speaks.', '', 'The last slide speaks.']);
	const p = open(html, { hour: 15 });
	const ltt = unpack(JSON.parse(p.document.querySelector('script[data-lp-ltt]').textContent));
	assert.ok(ltt.bookends?.greeting && ltt.bookends?.closing, 'the export carries both bookends');
	const plan = timeline(ltt, { greeting: 'afternoon' });

	const heard = [];
	const arrivals = [];
	let last = p.count();
	let stoppedAt = null;
	const watch = () => {
		const b = p.band();
		if (b && heard[heard.length - 1] !== b) heard.push(b);
		if (p.count() !== last) {
			last = p.count();
			arrivals.push(p.clock.now);
		}
		if (stoppedAt === null && p.pressed() === 'false') stoppedAt = p.clock.now;
	};
	p.play();
	watch();
	assert.match(p.band(), /^Good afternoon, and welcome\./, 'Play on slide 1 opens with the afternoon greeting');
	p.clock.runUntil(plan.durationMs + 5000, watch);

	assert.equal(plan.greeting.startMs, 0);
	assert.deepEqual(arrivals, plan.segments.slice(1).map((s) => s.startMs), 'each slide arrives where timeline() puts it, after the greeting');
	assert.equal(stoppedAt, plan.durationMs, 'narration stops when the closing ends');
	assert.ok(heard.some((b) => /Thank you for listening/.test(b)), 'the closing was shown');
	assert.ok(heard.findIndex((b) => /Thank you/.test(b)) > heard.findIndex((b) => /last slide/.test(b)), 'the closing comes after the last slide');

	// Nothing repeats: back to slide 1 and Play again.
	p.key('Home');
	p.play();
	assert.match(p.band(), /first slide speaks/, 'a second Play on slide 1 speaks the slide, not the greeting');
	let again = false;
	p.clock.runUntil(p.clock.now + plan.durationMs + 5000, () => {
		if (/Thank you/.test(p.band())) again = true;
	});
	assert.equal(p.pressed(), 'false', 'the second delivery ends');
	assert.equal(again, false, 'without a second closing');
	p.dom.window.close();
});

test('each period of the day picks its own greeting', async () => {
	const html = await exportDeck(['One.']);
	for (const [hour, want] of [[4, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening'], [2, 'Good evening']]) {
		const p = open(html, { hour });
		p.play();
		assert.ok(p.band().startsWith(want), `${hour}:00 greets with "${want}" (got "${p.band()}")`);
		p.dom.window.close();
	}
});

test('pausing during the greeting uses it up; Play then speaks the slide', async () => {
	const p = open(await exportDeck(['The slide itself.']));
	p.play();
	assert.match(p.band(), /^Good afternoon/);
	p.clock.runUntil(200);
	p.play(); // pause
	assert.equal(p.pressed(), 'false');
	p.play(); // resume
	assert.match(p.band(), /The slide itself/, 'resuming does not say hello twice');
	p.dom.window.close();
});

test('starting mid-deck never greets, even after returning to slide 1', async () => {
	const p = open(await exportDeck(['One speaks.', 'Two speaks.']));
	p.key('ArrowRight');
	p.play();
	assert.match(p.band(), /Two speaks/);
	p.play(); // pause
	p.key('Home');
	p.play();
	assert.match(p.band(), /One speaks/, 'the first Play used the greeting up');
	p.dom.window.close();
});

test('a silent last slide reached by autoplay still gets the closing; reached by hand, it does not', async () => {
	const { timeline, unpack } = await import('@laticent/ltt');
	const html = await exportDeck(['One speaks.', ''], { greeting: null });
	const p = open(html);
	const plan = timeline(unpack(JSON.parse(p.document.querySelector('script[data-lp-ltt]').textContent)));
	let closing = false;
	p.play();
	p.clock.runUntil(plan.durationMs + 5000, () => {
		if (/Thank you/.test(p.band())) closing = true;
	});
	assert.ok(closing, 'autoplay onto the silent "thank you" slide plays the closing');
	assert.equal(p.pressed(), 'false');
	p.dom.window.close();

	const q = open(html);
	q.play();
	q.key('ArrowRight'); // by hand, onto the silent last slide
	q.clock.runUntil(10000);
	assert.equal(q.pressed(), 'false', 'narration ends');
	assert.doesNotMatch(q.band(), /Thank you/, 'and no closing plays');
	q.dom.window.close();
});

test('a video render says the neutral greeting, whatever the clock reads', async () => {
	const p = open(await exportDeck(['One speaks.']), { hour: 9, render: true });
	p.play();
	assert.match(p.band(), /^Hello, and welcome\./);
	p.dom.window.close();
});

test('a deck without bookends plays exactly as before: slide 1 first', async () => {
	const p = open(await exportDeck(['One speaks.'], { greeting: null, closing: null }));
	p.play();
	assert.match(p.band(), /One speaks/);
	assert.equal(p.document.querySelectorAll('script[data-lp-audio]').length, 0);
	p.dom.window.close();
});

test('the greeting plays its own clip: the audio block the viewer\'s hour names', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const clipOf = (tag) => ({ audio: `data:audio/mpeg;base64,${tag}`, clip: `sha256:${'ab'.repeat(32)}`, leadMs: 0 });
	const line = (text, tag) => ({ text, track: buildTrack(text), clips: [clipOf(tag)] });
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>${SLIDE(1)}</body></html>`;
	const narration = {
		voice: { model: 'm', voice: 'v', speed: 1 },
		slides: [line('Slide one.', 'U0xJREU=')],
		bookends: {
			greeting: { morning: line('Good morning.', 'TU9STg=='), afternoon: line('Good afternoon.', 'QUZURVI='), evening: line('Good evening.', 'RVZFTg=='), neutral: line('Hello.', 'SEVMTE8=') },
			closing: line('Thank you.', 'VEhBTktT'),
		},
	};
	const { html } = await buildPlayerHtml({ docHtml, source: '# x', title: 'T', now: 0, narration });
	const keys = [...html.matchAll(/data-lp-audio="([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
	assert.deepEqual(keys, ['0', 'closing', 'greeting-afternoon', 'greeting-evening', 'greeting-morning', 'greeting-neutral']);
	for (const [hour, tag] of [[9, 'TU9STg=='], [14, 'QUZURVI='], [20, 'RVZFTg==']]) {
		const played = [];
		const dom = new JSDOM(html, {
			runScripts: 'dangerously',
			pretendToBeVisual: true,
			beforeParse(window) {
				installClock(window);
				window.Date.prototype.getHours = () => hour;
				const P = window.HTMLMediaElement.prototype;
				P.play = function () {
					played.push(this.getAttribute('src'));
					return Promise.resolve();
				};
				P.pause = () => {};
				P.load = () => {};
			},
		});
		dom.window.document.getElementById('lp-play').click();
		assert.equal(played[0], `data:audio/mpeg;base64,${tag}`, `${hour}:00 plays its own greeting clip`);
		dom.window.close();
	}
});

test('video export reads the neutral greeting and the closing, and lays them on its timeline', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const { readExportNarration, cueTimes } = await import('../../../lib/export/video.mjs');
	const clip = (tag) => [{ audio: `data:audio/mpeg;base64,${tag}`, clip: `sha256:${'cd'.repeat(32)}`, leadMs: 0 }];
	const line = (text, tag) => ({ text, track: buildTrack(text), clips: clip(tag) });
	const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>${SLIDE(1)}${SLIDE(2)}</body></html>`;
	const narration = {
		voice: { model: 'm', voice: 'v', speed: 1 },
		slides: [line('Slide one.', 'MQ=='), line('Slide two.', 'Mg==')],
		bookends: {
			greeting: { morning: line('Good morning.', 'bQ=='), afternoon: line('Good afternoon.', 'YQ=='), evening: line('Good evening.', 'ZQ=='), neutral: line('Hello.', 'aA==') },
			closing: line('Thank you.', 'dA=='),
		},
	};
	const { html } = await buildPlayerHtml({ docHtml, source: '# x', title: 'T', now: 0, narration });
	const { ltt, clips } = await readExportNarration(html);
	assert.deepEqual(clips.map((c) => c.bookend ?? c.slide), [0, 1, 'greeting-neutral', 'closing'], 'only the bookends a video plays');
	assert.deepEqual(clips.map((c) => c.uri.slice(-4)), ['MQ==', 'Mg==', 'aA==', 'dA==']);
	const { tl, cues } = await cueTimes(ltt);
	assert.deepEqual(cues.map((c) => c.text), ['Hello.', 'Slide one.', 'Slide two.', 'Thank you.']);
	assert.equal(cues[0].startMs, 0);
	assert.equal(cues[1].startMs, tl.segments[0].startMs, 'slide 1 starts after the greeting');
	assert.ok(tl.segments[0].startMs > 0);
	assert.equal(cues[3].startMs, tl.closing.startMs + ltt.bookends.closing.holdMs, 'the closing speaks after its hold');
});
