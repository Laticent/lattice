/**
 * Integration: the exported player's controls with scripting OFF.
 *
 * iOS Quick Look (the file preview in Mail, Files and Messages) renders an HTML file with
 * JavaScript disabled, so the toolbar's onclick handlers never run there. The player ships
 * hidden radios and a checkbox whose <label>s stand in for Present, Read·Slides and the moon
 * (`engineering/decisions/2026-09-29-player-no-js-controls.md`). This drives a real export in
 * Chromium with JavaScript disabled and pins the behavior a reader gets:
 *   - the labels show, the dead scripted buttons do not;
 *   - Present is one whole slide on screen at phone, landscape and desktop sizes;
 *   - Read·Slides is the column, and a tap does not scroll the reader back to the top;
 *   - the flip gives the same slide colors as the scripted toggle, in every baked scheme,
 *     under a light and a dark OS;
 *   - print still gives every slide;
 *   - with the script on, none of the no-JS controls show.
 * CI runs it in Chromium, which is a stand-in for WebKit, not a substitute: Quick Look
 * itself is WebKit. To run the same file in WebKit, point LATTICE_PLAYWRIGHT at an installed
 * `playwright` package whose WebKit build is present (it is not a repo dependency):
 *   LATTICE_PLAYWRIGHT=/path/to/node_modules/playwright node --test <this file>
 * Slow tier (spawns the emulator and a browser).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
// Pinned-light, pinned-dark and bookend slides: the cases the flip's carve-outs exist for.
const DECK = path.join(ROOT, 'examples', 'slide-class-forms.md');
const TIMEOUT = 240000;

function exportPlayer(deck, dir, name, extra = []) {
	const out = path.join(dir, `${name}.pdf`);
	const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', ...extra], {
		cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
	});
	assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
	return out.replace(/\.pdf$/, '.html');
}

// The properties that carry a scheme. Lengths (box-shadow and the like) are left out on
// purpose: the two views size the frame differently, so a shadow scaled to the frame differs
// between them in every cell, flipped or not.
const PROPS = ['color', 'background-color', 'background-image', 'fill', 'stroke', 'border-top-color', 'opacity', 'filter', 'outline-color', 'color-scheme'];

function slideStyles(props) {
	const out = [getComputedStyle(document.body).backgroundColor];
	for (const el of document.querySelectorAll('#lp-stage section[data-lattice-slide], #lp-stage section[data-lattice-slide] *')) {
		const cs = getComputedStyle(el);
		out.push(`${el.tagName}.${el.getAttribute('class') || ''} ${props.map((k) => cs.getPropertyValue(k)).join('|')}`);
	}
	return out;
}

// One interface over the two drivers, so every test below reads the same in both engines.
async function launchEngine() {
	if (process.env.LATTICE_PLAYWRIGHT) {
		const { webkit } = require(process.env.LATTICE_PLAYWRIGHT);
		const b = await webkit.launch();
		return {
			name: `WebKit ${b.version()}`,
			close: () => b.close(),
			async open(file, { js, width, height, scheme }) {
				const ctx = await b.newContext({ javaScriptEnabled: js, viewport: { width, height }, colorScheme: scheme });
				const page = await ctx.newPage();
				await page.goto(`file://${file}`, { waitUntil: 'load' });
				page.printMedia = () => page.emulateMedia({ media: 'print' });
				page.done = () => ctx.close();
				return page;
			},
		};
	}
	const b = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	return {
		name: `Chromium ${await b.version()}`,
		close: () => b.close(),
		async open(file, { js, width, height, scheme }) {
			const page = await b.newPage();
			await page.setJavaScriptEnabled(js);
			await page.setViewport({ width, height });
			await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
			await page.goto(`file://${file}`, { waitUntil: 'load' });
			page.printMedia = () => page.emulateMediaType('print');
			page.done = () => page.close();
			return page;
		},
	};
}

describe('html-player export — the controls work with scripting off', () => {
	let browser;
	let dir;
	const files = {};

	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nojs-'));
		for (const mode of ['light', 'dark', 'system']) {
			files[mode] = exportPlayer(DECK, dir, mode, ['--player-mode', mode]);
		}
		const deckMode = path.join(dir, 'deck-mode.md');
		fs.writeFileSync(deckMode, '---\ntheme: indaco\ncolor-mode: dark\n---\n\n# One\n\n---\n\n# Two\n');
		files.deckMode = exportPlayer(deckMode, dir, 'deck-mode');
		browser = await launchEngine();
		console.log(`# no-JS player tests run in ${browser.name}`);
	}, { timeout: TIMEOUT * 2 });

	test.after(async () => {
		if (browser) await browser.close();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	});

	const open = (file, { js = false, width = 390, height = 844, os: scheme = 'light' } = {}) =>
		browser.open(file, { js, width, height, scheme });

	const shown = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0);

	test('the labels stand in for the dead scripted buttons', async () => {
		const page = await open(files.light);
		for (const sel of ['label[for=lp-nj-present]', 'label[for=lp-nj-slides]', 'label[for=lp-nj-flip]']) {
			assert.ok(await shown(page, sel), `${sel} shows with no script`);
		}
		for (const sel of ['[data-lp-btn=present]', '[data-lp-btn=read-slides]', '[data-lp-btn=read-article]', '#lp-mode', '#lp-full', '#lp-notes-btn']) {
			assert.ok(!(await shown(page, sel)), `${sel} hides: it cannot work with no script`);
		}
		await page.done();
	});

	test('Present shows one whole slide at phone, landscape and desktop sizes', async () => {
		for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
			const page = await open(files.light, { width, height });
			const r = await page.evaluate(() => {
				const f = document.querySelector('.lp-frame').getBoundingClientRect();
				return { left: f.left, right: f.right, top: f.top, bottom: f.bottom, w: f.width, docH: document.documentElement.scrollHeight };
			});
			assert.ok(r.w > 0, `a frame is laid out at ${width}x${height}`);
			assert.ok(r.left >= 0 && r.right <= width, `the slide fits the width at ${width}x${height}: ${JSON.stringify(r)}`);
			assert.ok(r.top >= 48 && r.bottom <= height, `the slide fits under the bar at ${width}x${height}: ${JSON.stringify(r)}`);
			assert.equal(r.docH, height, `the page itself does not scroll at ${width}x${height}`);
			await page.done();
		}
	});

	test('one swipe moves one slide, and Read·Slides is the column', async () => {
		const page = await open(files.light);
		const step = await page.evaluate(() => {
			const frames = document.querySelectorAll('.lp-frame');
			return frames[1].getBoundingClientRect().left - frames[0].getBoundingClientRect().left;
		});
		await page.evaluate((dx) => document.getElementById('lp-stage').scrollBy({ left: dx, behavior: 'instant' }), step);
		const second = await page.evaluate(() => {
			const f = document.querySelectorAll('.lp-frame')[1].getBoundingClientRect();
			return Math.abs(f.left + f.width / 2 - innerWidth / 2);
		});
		assert.ok(second < 2, `the second slide is centered after one step (off by ${second}px)`);
		await page.click('label[for=lp-nj-slides]');
		const column = await page.evaluate(() => {
			const [a, b] = document.querySelectorAll('.lp-frame');
			return b.getBoundingClientRect().top > a.getBoundingClientRect().bottom;
		});
		assert.ok(column, 'Read·Slides stacks the slides');
		await page.done();
	});

	test('a label tap does not scroll a reader in the column back to the top', async () => {
		const page = await open(files.light, { width: 1440, height: 900 });
		await page.click('label[for=lp-nj-slides]');
		await page.evaluate(() => window.scrollTo(0, 3000));
		const before = await page.evaluate(() => scrollY);
		assert.ok(before > 1000, 'the column is long enough to scroll');
		await page.click('label[for=lp-nj-flip]');
		await page.click('label[for=lp-nj-slides]');
		assert.equal(await page.evaluate(() => scrollY), before);
		await page.done();
	});

	test('the flip gives the same slide colors as the scripted toggle', async () => {
		for (const mode of ['light', 'dark', 'system']) {
			for (const scheme of ['light', 'dark']) {
				for (const flip of [false, true]) {
					const scripted = await open(files[mode], { js: true, width: 1000, height: 800, os: scheme });
					if (flip) await scripted.click('#lp-mode');
					const noJs = await open(files[mode], { width: 1000, height: 800, os: scheme });
					if (flip) await noJs.click('label[for=lp-nj-flip]');
					const a = await scripted.evaluate(slideStyles, PROPS);
					const b = await noJs.evaluate(slideStyles, PROPS);
					const cell = `${mode} export, ${scheme} OS, ${flip ? 'flipped' : 'as opened'}`;
					assert.equal(b.length, a.length, `${cell}: the same elements`);
					const diff = a.findIndex((v, i) => v !== b[i]);
					assert.equal(diff, -1, `${cell}: element ${diff} differs\n  scripted: ${a[diff]}\n  no-JS:    ${b[diff]}`);
					await scripted.done();
					await noJs.done();
				}
			}
		}
	});

	test('print lays out every slide, not the one-slide strip', async () => {
		// Asserted as the print LAYOUT rather than a PDF page count, because only Chromium can
		// print a PDF through its driver. A strip in print media is the bug: it printed one slide.
		const page = await open(files.light);
		await page.printMedia();
		const r = await page.evaluate(() => {
			const frames = [...document.querySelectorAll('.lp-frame')].map((f) => f.getBoundingClientRect());
			const stacked = frames.every((f, i) => i === 0 || f.top >= frames[i - 1].bottom);
			return { n: frames.length, stacked, overflow: getComputedStyle(document.body).overflow };
		});
		assert.ok(r.n > 1, 'the deck has several slides');
		assert.ok(r.stacked, 'in print media every slide sits below the one before it');
		assert.notEqual(r.overflow, 'hidden', 'and the page is not clipped to one screen');
		await page.done();
	});

	test('with the script on, none of the no-JS controls show', async () => {
		const page = await open(files.light, { js: true });
		assert.ok(await page.evaluate(() => document.documentElement.classList.contains('lp-js')), 'the script ran');
		for (const sel of ['#lp-nj-present', 'label[for=lp-nj-present]', 'label[for=lp-nj-slides]', 'label[for=lp-nj-flip]']) {
			assert.ok(!(await shown(page, sel)), `${sel} hides once the script runs`);
		}
		assert.ok(await shown(page, '#lp-mode'), 'the scripted moon shows');
		await page.done();
	});

	test('a deck-wide color-mode ships no no-JS moon', async () => {
		const html = fs.readFileSync(files.deckMode, 'utf8');
		assert.doesNotMatch(html, /id="lp-nj-flip"/, 'no checkbox: only the script can restamp the section class');
		assert.doesNotMatch(html, /for="lp-nj-flip"/, 'and no label for it');
		assert.match(html, /id="lp-nj-present"/, 'the view controls still ship');
	});
});
