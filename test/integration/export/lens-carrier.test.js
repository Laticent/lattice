/**
 * Integration: a multi-view `.html` CARRIER, driven in a REAL browser. #1854.
 *
 * WHY A BROWSER AND NOT JSDOM. Every claim this feature makes is about what a recipient
 * SEES after clicking something, and both defects found while building it were invisible
 * to a structural read of the markup. The `hidden` attribute was set correctly on the
 * table of contents and on the article's stat blocks, and neither hid: `#lp-toc a` and
 * `#lp-article .lp-stats` set `display` at a higher specificity than the UA sheet's
 * `[hidden]{display:none}`, so a reader on the `brief` view was shown the whole deck's
 * contents and a non-member's numbers. Only a real cascade reports that (HARD RULE #23).
 * The other was an ownership bug that filed each slide's prose under the NEXT slide —
 * also perfectly well-formed markup.
 *
 * WHAT IS ASSERTED is the agreement between the baked view map and all THREE views the
 * player already had, because a lens is a second axis over them rather than a fourth
 * view: Present's frames, Read·Slides' column, and Read·Article's prose AND its table of
 * contents. Plus the transport's bounds, which is where a baked index list invites a
 * transport still sized to the whole carrier.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { applyTag, approvalHash, emitRegistry } = require('@workwel/lente');
const { splitSlideChunks } = require('../../../lib/core/slide-boundaries.mjs');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const CHROME = resolveChrome();
const skip = skipWithoutChrome(CHROME);

describe('a multi-view player carrier', { skip }, () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const TIMEOUT = 240000;

	// brief ⊂ evidence (two rungs) and `ask` escapes both (a cut), so the union is a real
	// reduction of the deck AND no single view is the whole carrier — the shape that
	// catches an off-by-one in the baked map.
	const MEMBERSHIP = { brief: [0, 3, 6], evidence: [0, 1, 3, 5, 6], ask: [6, 7] };
	const VIEWS = [
		{ id: 'brief', label: 'Brief', base: 'none', kind: 'rung' },
		{ id: 'evidence', label: 'Evidence', base: 'none', kind: 'rung' },
		{ id: 'ask', label: 'The ask', base: 'none' },
	];
	// Author index → index within the exported union, which is what the player addresses.
	const UNION = [...new Set(Object.values(MEMBERSHIP).flat())].sort((a, b) => a - b);
	const inCarrier = (ids) => ids.map((i) => UNION.indexOf(i));

	let browser;
	let page;
	let file;

	before(async () => {
		let slides = Array.from({ length: 9 }, (_, i) =>
			`\n<!-- _class: content -->\n\n# Heading ${i + 1}\n\n\`Kicker ${i + 1}\`\n\nBody of slide ${i + 1}.\n`,
		);
		for (const v of VIEWS) {
			const mem = new Set(MEMBERSHIP[v.id]);
			slides = slides.map((s, i) => applyTag(s, v.id, mem.has(i), v.base));
		}
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(slides, bare, l.id) })), default: 'full' };
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-carrier-'));
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${slides.join('\n---\n')}`);

		file = path.join(dir, 'carrier.html');
		const r = spawnSync(process.execPath, [EMULATOR, deck, file, '--quiet', '--player', '--lens', 'brief,evidence,ask'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

		browser = await require('puppeteer').launch({ executablePath: CHROME, args: ['--no-sandbox'] });
		page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900 });
		page.on('pageerror', (e) => assert.fail(`player threw: ${e}`));
		await page.goto(`file://${file}`);
		await page.waitForFunction(() => document.documentElement.classList.contains('lp-js'));
	}, { timeout: TIMEOUT });

	after(async () => { await browser?.close(); });

	/** What each of the three views actually shows, as carrier indices. */
	async function showing() {
		return page.evaluate(() => {
			const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
			const idx = (el) => +el.getAttribute('data-lp-i');
			const frames = [...document.querySelectorAll('.lp-frame')];
			const art = document.querySelector('#lp-doc #lp-article');
			const toc = document.querySelector('#lp-doc #lp-toc');
			return {
				// GEOMETRY, not the `hidden` attribute. The attribute is what the switcher sets;
				// asking it back only proves the switcher set what it set. What has to hold is
				// that the CASCADE agrees — which is exactly where two live defects hid, since
				// `#lp-toc a{display:block}` and `#lp-article .lp-stats{display:grid}` both
				// outrank the UA sheet's `[hidden]{display:none}`.
				frames: frames.filter(vis).map(idx),
				prose: [...new Set([...art.querySelectorAll('[data-lp-i]')].filter(vis).map(idx))].sort((a, b) => a - b),
				toc: [...toc.querySelectorAll('a[data-lp-i]')].filter(vis).map(idx),
				counter: document.getElementById('lp-count').textContent,
			};
		});
	}

	test('the carrier ships the UNION of the exported views, not the deck', { timeout: TIMEOUT }, () => {
		const html = fs.readFileSync(file, 'utf8');
		const frames = (html.match(/<div class="lp-frame" data-lp-i="\d+">/g) || []).length;
		assert.equal(frames, UNION.length, 'one frame per union member');
		assert.ok(UNION.length < 9, 'the fixture really does withhold slides');
		// Slides 2, 4 and 8 are in no exported view. None of them may be in the file at all —
		// this is the half the export CAN withhold, unlike the switching, which only hides.
		for (const away of [2, 4, 8]) assert.ok(!html.includes(`Body of slide ${away + 1}.`), `slide ${away} withheld`);
	});

	test('the switcher offers exactly the exported views, in order', { timeout: TIMEOUT }, async () => {
		const ids = await page.$$eval('#lp-lens-sel option', (os) => os.map((o) => o.value));
		assert.deepEqual(ids, ['brief', 'evidence', 'ask']);
		const labels = await page.$$eval('#lp-lens-sel option', (os) => os.map((o) => o.textContent));
		assert.deepEqual(labels, ['Brief', 'Evidence', 'The ask'], 'the author’s own names, in full — the reason this is a select');
	});

	test('a carrier opens on the first view it was given', { timeout: TIMEOUT }, async () => {
		assert.equal(await page.$eval('#lp-lens-sel', (s) => s.value), 'brief');
	});

	for (const id of ['brief', 'evidence', 'ask']) {
		test(`\`${id}\` agrees across Present, Read·Slides and Read·Article`, { timeout: TIMEOUT }, async () => {
			const want = inCarrier(MEMBERSHIP[id]);
			await page.select('#lp-lens-sel', id);
			// Each surface is measured WHERE IT IS LAID OUT. Present hides every frame but the
			// active one by design, so a geometric read of the frames there — or in Read·Article,
			// where the stage is display:none entirely — reports nothing and proves nothing.
			// Read·Slides is the view that lays the whole column out at once.
			await page.click('[data-lp-btn="read-slides"]');
			const frameState = await showing();
			assert.deepEqual(frameState.frames, want, 'Read·Slides lays out exactly the view’s frames');
			await page.click('[data-lp-btn="read-article"]');
			const s = await showing();
			assert.deepEqual(s.prose, want, 'Read·Article prose — the surface the `hidden` cascade defeated');
			assert.deepEqual(s.toc, want, 'Read·Article table of contents');
			assert.equal(s.counter, `1 / ${want.length}`, 'the counter re-sizes to the view');
			assert.equal(await page.$eval('#lp-lens-sel', (s) => s.value), id, 'the control reads back the view it is showing');
			await page.click('[data-lp-btn="present"]');
		});
	}

	test('navigation stays inside the active view and clamps at both ends', { timeout: TIMEOUT }, async () => {
		const want = inCarrier(MEMBERSHIP.ask);
		await page.select('#lp-lens-sel', 'ask');
		await page.click('[data-lp-btn="present"]');
		const at = () => page.evaluate(() => {
			const f = [...document.querySelectorAll('.lp-frame')].filter((x) => x.classList.contains('lp-active') && !x.hidden);
			if (f.length !== 1) return `BROKEN(${f.length} visible active frames)`;
			return +f[0].getAttribute('data-lp-i');
		});
		assert.equal(await at(), want[0], 'switching a view lands on that view’s first slide');
		const seen = [await at()];
		for (let k = 0; k < want.length + 2; k++) {
			await page.keyboard.press('ArrowRight');
			seen.push(await at());
		}
		assert.deepEqual([...new Set(seen)], want, 'every slide visited is a member, and every member is reachable');
		assert.equal(await page.$eval('#lp-next', (b) => b.disabled), true, 'next is spent at the view’s last slide');
		for (let k = 0; k < want.length + 2; k++) await page.keyboard.press('ArrowLeft');
		assert.equal(await at(), want[0]);
		assert.equal(await page.$eval('#lp-prev', (b) => b.disabled), true, 'prev is spent at the view’s first slide');
	});

	// ── The index space, which is where this feature failed OPEN ─────────────────────
	// The two cases below are the ones the fixture above CANNOT see, and both were live
	// defects found by an adversarial pass, not by the suite. The fixture is 16:9 `content`
	// slides that never overflow and never forge anything, so its rendered section list is
	// 1:1 with its authored slide list — which is exactly the coincidence that let a
	// DOM-position stamp look correct.

	test('auto-split cannot shift the view map — a split slide stays whole', { timeout: TIMEOUT }, async () => {
		// A `size: portrait` deck auto-splits (AUTOSPLIT_APPLIES covers every non-`wide`
		// family), so one authored slide becomes many `<section>`s. Measured before the fix:
		// 4 authored slides rendered as 14 sections, `brief` was shown page 2 of a slide it
		// excludes, and two authored slides were unreachable in every view.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-split-'));
		const long = Array.from({ length: 22 }, (_, i) => `- Detail line ${i + 1} of the exposure analysis, at length.`).join('\n');
		const raw = [
			'\n<!-- _class: content -->\n\n# Slide A\n\nOpening.\n',
			`\n<!-- _class: list -->\n\n## Long slide\n\n${long}\n`,
			'\n<!-- _class: content -->\n\n# Slide C\n\nMiddle.\n',
			'\n<!-- _class: content -->\n\n# Slide D\n\nClosing.\n',
		];
		const views = [{ id: 'brief', label: 'Brief', base: 'none' }, { id: 'deep', label: 'Deep', base: 'none' }];
		const members = { brief: [0, 3], deep: [0, 1, 2, 3] };
		let tagged = raw;
		for (const v of views) {
			const mem = new Set(members[v.id]);
			tagged = tagged.map((s, i) => applyTag(s, v.id, mem.has(i), v.base));
		}
		// Hash the body AS WRITTEN, re-split by the engine's own splitter — not the in-memory
		// array. A trailing newline lands inside the LAST slide, so hashing the array makes
		// every view read `drifted` to a real consumer while the fixture itself looks fine.
		const body = `${tagged.join('\n---\n')}\n`;
		const asRead = splitSlideChunks(body).chunks;
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...views], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(asRead, bare, l.id) })), default: 'full' };
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\nsize: portrait\n${emitRegistry(reg)}\n---\n${body}`);
		const out = path.join(dir, 'split.html');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--lens', 'brief,deep'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, r.stderr);
		const html = fs.readFileSync(out, 'utf8');
		const stamps = [...html.matchAll(/<div class="lp-frame" data-lp-i="(\d+)"/g)].map((m) => Number(m[1]));
		assert.ok(stamps.length > 4, `the deck really did split (${stamps.length} sections from 4 slides)`);
		assert.deepEqual([...new Set(stamps)], [0, 1, 2, 3], 'every AUTHORED slide is addressable, and no stamp exceeds the authored range');
		assert.ok(stamps.filter((i) => i === 1).length > 1, 'the split slide’s pages share ONE authored index');

		const page2 = await browser.newPage();
		try {
			await page2.goto(`file://${out}`);
			await page2.waitForFunction(() => document.documentElement.classList.contains('lp-js'));
			await page2.select('#lp-lens-sel', 'brief');
			const shown = await page2.evaluate(() => {
				const st = document.querySelector('#lp-app > #lp-stage');
				return [...st.querySelectorAll(':scope > .lp-frame')].filter((f) => !f.hidden).map((f) => Number(f.getAttribute('data-lp-i')));
			});
			assert.deepEqual([...new Set(shown)], members.brief, 'brief shows its members and NOTHING from the slide it excludes');
			const text = await page2.evaluate(() => {
				const st = document.querySelector('#lp-app > #lp-stage');
				return [...st.querySelectorAll(':scope > .lp-frame')].filter((f) => !f.hidden).map((f) => f.textContent).join(' ');
			});
			assert.ok(!text.includes('Long slide'), 'no page of the excluded slide is on screen');
		} finally {
			await page2.close();
		}
	});

	test('a forged .lp-frame in author markup cannot join the view map', { timeout: TIMEOUT }, async () => {
		// `.lp-frame` is a plain class and DOMPurify keeps `class` / `data-*`, so a slide can
		// carry one. Queried from `document` it joined the list the switcher walks and shifted
		// every later frame by one; the switcher now walks the stage's DIRECT children.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-forge-'));
		const raw = [
			'\n<!-- _class: content -->\n\n# Slide A\n\n<div class="lp-frame" data-lp-i="0">FORGEDFRAME</div>\n\nOpening.\n',
			'\n<!-- _class: content -->\n\n# WITHHELDB\n\nNot in brief.\n',
			'\n<!-- _class: content -->\n\n# Slide C\n\nMiddle.\n',
		];
		const views = [{ id: 'brief', label: 'Brief', base: 'none' }, { id: 'deep', label: 'Deep', base: 'none' }];
		const members = { brief: [0, 2], deep: [0, 1, 2] };
		let tagged = raw;
		for (const v of views) {
			const mem = new Set(members[v.id]);
			tagged = tagged.map((s, i) => applyTag(s, v.id, mem.has(i), v.base));
		}
		const body = `${tagged.join('\n---\n')}\n`;
		const asRead = splitSlideChunks(body).chunks;
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...views], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(asRead, bare, l.id) })), default: 'full' };
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${body}`);
		const out = path.join(dir, 'forge.html');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--lens', 'brief,deep'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, r.stderr);
		assert.ok(fs.readFileSync(out, 'utf8').includes('FORGEDFRAME'), 'the forged element really does survive into the file');

		const page2 = await browser.newPage();
		try {
			await page2.goto(`file://${out}`);
			await page2.waitForFunction(() => document.documentElement.classList.contains('lp-js'));
			await page2.select('#lp-lens-sel', 'brief');
			const r2 = await page2.evaluate(() => {
				const st = document.querySelector('#lp-app > #lp-stage');
				const real = [...st.querySelectorAll(':scope > .lp-frame')].filter((f) => !f.hidden);
				return {
					anywhere: document.querySelectorAll('.lp-frame').length,
					walked: st.querySelectorAll(':scope > .lp-frame').length,
					stamps: real.map((f) => Number(f.getAttribute('data-lp-i'))),
					counter: document.getElementById('lp-count').textContent,
					withheld: real.map((f) => f.textContent).join(' ').includes('WITHHELDB'),
				};
			});
			assert.ok(r2.anywhere > r2.walked, 'the forged frame exists but is NOT one the switcher walks');
			assert.deepEqual(r2.stamps, members.brief, 'the real frames still map to the right authored slides');
			assert.equal(r2.counter, `1 / ${members.brief.length}`, 'and the forged element is not counted as a slide');
			assert.equal(r2.withheld, false);
		} finally {
			await page2.close();
		}
	});

	test('a single-view export is not a carrier — no switcher, no stamps', { timeout: TIMEOUT }, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-one-'));
		const deck = path.join(path.dirname(file), 'deck.md');
		const out = path.join(dir, 'one.html');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--lens', 'brief'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, r.stderr);
		const html = fs.readFileSync(out, 'utf8');
		assert.ok(!html.includes('lp-lens-sel'), 'one view is a projected deck, not a switcher');
		assert.ok(!html.includes('data-lp-i'), 'and it carries none of the carrier’s per-slide stamps');
	});
});
