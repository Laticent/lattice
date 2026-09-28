// The Guide in the exported player (engineering/decisions/2026-09-27-guide-in-the-exported-player.md).
//
// What these pin: the Guide is an export option, on by default in every narrated export and out of
// it with `guide: false` (the owner, 2026-09-28), while `delivery:` picks only its style (restrained
// when the deck names none); no silent export carries a byte of it; it runs ahead of the player script so the
// transport can take it; and the transport feeds it a beat at each sentence, pause and slide change,
// with the switch taking it down. What the Guide then POINTS at needs layout, which jsdom has none
// of, so the pointing itself is verified in a real browser (the decision record's §5), not here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');

const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>
<section data-lattice-slide="1" id="1" class="content"><h1>One</h1><ul><li>First point here.</li></ul></section>
<section data-lattice-slide="2" id="2" class="content"><h1>Two</h1></section></body></html>`;

async function player(source, narrated = true, extra = {}) {
	const { buildTrack } = await import('@laticent/cadenza');
	const track = buildTrack('First point here. A second sentence.');
	const narration = narrated ? { voice: { model: 'm', voice: 'v', speed: 1 }, slides: [{ text: 'x', track, clips: [] }, null] } : undefined;
	return (await buildPlayerHtml({ docHtml, source, title: 'T', now: 0, ...(narration ? { narration } : {}), ...extra })).html;
}

test('a narrated export ships the Guide by default, its switch on, in the style delivery: names', async () => {
	const html = await player('---\ndelivery: expressive\n---\n\n# One\n');
	assert.match(html, /window\.__lpGuide=/, 'the bundle assigns the API');
	assert.match(html, /<button id="lp-guide"[^>]*aria-pressed="true"/, 'the switch, on');
	assert.match(html, /var GUIDE_DELIVERY=\{"name":"expressive"/, 'the preset, baked in');
	assert.ok(html.indexOf('window.__lpGuide=') < html.indexOf("var root=document.documentElement"), 'the Guide runs before the transport takes it');
});

test('a deck that names no delivery, or an unknown one, gets the Guide in the default style', async () => {
	for (const source of ['# One\n', '---\ndelivery: typo\n---\n\n# One\n']) {
		const html = await player(source);
		assert.match(html, /<button id="lp-guide"/, source);
		assert.match(html, /var GUIDE_DELIVERY=\{"name":"restrained"/, source);
	}
});

test('with guide: false, or without narration, not one byte of the Guide ships', async () => {
	for (const [source, narrated, extra, why] of [
		['---\ndelivery: expressive\n---\n\n# One\n', true, { guide: false }, 'the author switched it off'],
		['---\ndelivery: somber\n---\n\n# One\n', false, {}, 'delivery: but silent'],
	]) {
		const html = await player(source, narrated, extra);
		assert.doesNotMatch(html, /__lpGuide|lp-guide|GUIDE_DELIVERY|guideBeat/, why);
	}
});

test('the transport feeds the Guide a beat per sentence, a pause, and the switch takes it down', async () => {
	const html = await player('---\ndelivery: restrained\n---\n\n# One\n');
	const beats = [];
	let resets = 0;
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		beforeParse(window) {
			// Intercept the bundle's API as it is assigned, and record what the transport asks of it.
			let api = null;
			Object.defineProperty(window, '__lpGuide', {
				configurable: true,
				get: () => api,
				set(v) {
					const create = v.create;
					api = {
						create(delivery, shown) {
							const g = create(delivery, shown);
							return {
								beat(slide, cue, track, playing) {
									beats.push({ slide, cue, playing, cues: track ? track.cues.length : 0, preset: delivery.name });
								},
								word() {},
								reset() {
									resets++;
									g.reset();
								},
							};
						},
					};
				},
			});
		},
	});
	const { document } = dom.window;
	const play = document.querySelector('#lp-play');
	play.click();
	// Two silent cues: the first beat is sentence 0 of slide 0, playing, under the deck's preset.
	assert.deepEqual(beats[0], { slide: 0, cue: 0, playing: true, cues: 2, preset: 'restrained' });
	play.click(); // pause
	assert.ok(beats.some((b) => b.playing === false), 'a pause reaches the Guide');
	const guideBtn = document.querySelector('#lp-guide');
	guideBtn.click();
	assert.equal(guideBtn.getAttribute('aria-pressed'), 'false');
	assert.equal(resets, 1, 'switching it off takes the hand and the focus down');
	const before = beats.length;
	play.click(); // play again, Guide off
	assert.equal(beats.length, before, 'a Guide switched off gets no beats');
	dom.window.close();
});

test('a deck element named __lpGuide cannot stand in for the Guide', async () => {
	const html = (await player('---\ndelivery: restrained\n---\n\n# One\n')).replace('<h1>One</h1>', '<h1>One</h1><form name="__lpGuide"><input name="create"></form>');
	const errors = [];
	const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) { w.addEventListener('error', (e) => errors.push(e.message)); } });
	dom.window.document.querySelector('#lp-play').click();
	assert.equal(typeof dom.window.__lpGuide.create, 'function', 'the bundle, not the form');
	assert.deepEqual(errors, []);
	dom.window.close();
});
