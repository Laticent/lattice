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
				frames: frames.filter((f) => !f.hidden).map(idx),
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
		const ids = await page.$$eval('[data-lp-lens]', (bs) => bs.map((b) => b.getAttribute('data-lp-lens')));
		assert.deepEqual(ids, ['brief', 'evidence', 'ask']);
	});

	for (const id of ['brief', 'evidence', 'ask']) {
		test(`\`${id}\` agrees across Present, Read·Slides and Read·Article`, { timeout: TIMEOUT }, async () => {
			const want = inCarrier(MEMBERSHIP[id]);
			await page.click(`[data-lp-lens="${id}"]`);
			await page.click('[data-lp-btn="read-article"]');
			const s = await showing();
			assert.deepEqual(s.frames, want, 'the frames the view shows');
			assert.deepEqual(s.prose, want, 'Read·Article prose — the surface the `hidden` cascade defeated');
			assert.deepEqual(s.toc, want, 'Read·Article table of contents');
			assert.equal(s.counter, `1 / ${want.length}`, 'the counter re-sizes to the view');
			const pressed = await page.$$eval('[data-lp-lens]', (bs) => bs.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-lp-lens')));
			assert.deepEqual(pressed, [id], 'exactly one view reads as pressed');
			await page.click('[data-lp-btn="present"]');
		});
	}

	test('navigation stays inside the active view and clamps at both ends', { timeout: TIMEOUT }, async () => {
		const want = inCarrier(MEMBERSHIP.ask);
		await page.click('[data-lp-lens="ask"]');
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

	test('a single-view export is not a carrier — no switcher, no stamps', { timeout: TIMEOUT }, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-one-'));
		const deck = path.join(path.dirname(file), 'deck.md');
		const out = path.join(dir, 'one.html');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--lens', 'brief'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, r.stderr);
		const html = fs.readFileSync(out, 'utf8');
		assert.ok(!html.includes('data-lp-lens'), 'one view is a projected deck, not a switcher');
		assert.ok(!html.includes('data-lp-i'), 'and it carries none of the carrier’s per-slide stamps');
	});
});
