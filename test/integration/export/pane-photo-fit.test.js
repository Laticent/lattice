/**
 * Integration: a photo in a plain pane is fitted to the pane, never cropped (lib/forms/cell/pane/pane.css).
 *
 * The slide rule for `img` took the pane's width at the picture's own shape and cropped to `cover`, so a
 * picture taller than its pane ran past the pane's edge and the export stamped "Content clipped": wide at
 * 75%, tall at 50% and 75%, square at 50% and 75% (the 12-slide matrix of four photo shapes by three
 * shares, engineering/decisions/2026-10-16-mosaico-layout-library.md §8.9). Pinned here on the real export
 * in Chromium: every picture sits inside its pane's stage at its own shape, centered, and an `image` pane
 * keeps its deliberate cover crop.
 *
 * Slow tier: one CLI export and a Chromium launch. See engineering/pipeline.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('node:url');

describe('export: a photo in a plain pane is fitted, not cropped', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 240000;
	const SHAPES = ['wide', 'tall', 'pano', 'square'];
	const RATIOS = ['ratio-25-75', 'ratio-50-50', 'ratio-75-25'];
	const slide = (shape, ratio) => `<!-- _class: columns ${ratio} -->\n\n## ${shape} ${ratio}\n\n<!-- _pane: content -->\n\n![](sample:photo-${shape}.jpg)\n\n<!-- _pane: content -->\n\n- Beside text\n- A second point\n`;
	const DECK = `---\ntheme: indaco\n---\n\n${RATIOS.flatMap((r) => SHAPES.map((s) => slide(s, r))).join('\n---\n\n')}\n---\n\n<!-- _class: columns ratio-50-50 -->\n\n## headed pane\n\n<!-- _pane: content -->\n### A title\n\n![](sample:photo-tall.jpg)\n\n<!-- _pane: content -->\n\n- Beside text\n---\n\n<!-- _class: columns ratio-50-50 -->\n\n## same line\n\n<!-- _pane: content -->\n\nRevenue from ![](sample:logo-acme.svg) grew forty percent in the opening quarter.\n\n<!-- _pane: content -->\n\n- Beside text\n\n---\n\n<!-- _class: columns ratio-50-50 -->\n\n## image pane\n\n<!-- _pane: image -->\n![](sample:photo-tall.jpg)\n\n<!-- _pane: list -->\n### What changes\n\n- The hall opens in May\n`;

	let dir;
	let browser;
	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-pane-photo-'));
		fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	test('every photo sits inside its pane at its own shape, and an image pane still covers', { timeout: TIMEOUT }, async () => {
		const out = path.join(dir, 'deck.html');
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), out, '--quiet'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		await page.waitForFunction(() => [...document.querySelectorAll('lat-pane img')].every((i) => i.complete && i.naturalWidth > 0), { timeout: 30000 });
		const got = await page.evaluate(() => [...document.querySelectorAll('section.lat-pane-host')].map((s) => {
			const title = s.querySelector('h2')?.textContent || '';
			const pane = s.querySelector('lat-pane');
			const stage = (pane.querySelector('.cell-stage') || pane).getBoundingClientRect();
			const img = pane.querySelector('img');
			const b = img.getBoundingClientRect();
			return {
				title, kind: pane.dataset.pane, fit: getComputedStyle(img).objectFit,
				inside: b.left >= stage.left - 1 && b.right <= stage.right + 1 && b.top >= stage.top - 1 && b.bottom <= stage.bottom + 1,
				shapeErr: Math.abs(b.width / b.height - img.naturalWidth / img.naturalHeight),
				centerErr: Math.abs((b.top + b.bottom) / 2 - (stage.top + stage.bottom) / 2),
				centerXErr: Math.abs((b.left + b.right) / 2 - (stage.left + stage.right) / 2),
				figure: img.parentElement.hasAttribute('data-pane-figure'),
				proseW: img.parentElement.getBoundingClientRect().width,
			};
		}));
		await page.close();
		assert.equal(got.length, SHAPES.length * RATIOS.length + 3, 'every slide is a panes slide');
		const prose = got.find((x) => x.title === 'same line');
		assert.equal(prose.figure, false, 'prose with a picture in it is not a figure');
		assert.ok(prose.proseW > 150, `the prose beside an inline picture is ${prose.proseW}px wide`);
		for (const g of got.filter((x) => x.kind === 'content' && x.title !== 'same line')) {
			assert.ok(g.inside, `${g.title}: the photo runs past its pane`);
			assert.ok(g.shapeErr < 0.02, `${g.title}: the photo is not at its own shape (off by ${g.shapeErr.toFixed(3)})`);
			assert.equal(g.fit, 'contain', `${g.title}: object-fit is ${g.fit}`);
			assert.ok(g.centerErr < 2, `${g.title}: the photo is ${g.centerErr.toFixed(1)}px off the pane's center line`);
			assert.ok(g.centerXErr < 2, `${g.title}: the photo is ${g.centerXErr.toFixed(1)}px off the pane's center column`);
		}
		const image = got.find((x) => x.kind === 'image');
		assert.equal(image.fit, 'cover', 'an image pane keeps its cover crop');
	});
});
