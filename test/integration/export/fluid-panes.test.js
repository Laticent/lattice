/**
 * Integration: the `--fluid` viewer lays out a PANES slide (lib/core/panes.js).
 *
 * Each `<lat-pane>` is a SIZE container (lib/forms/cell/pane/pane.css), so its content lends it no
 * height: a pane is exactly as tall as the box its host gives it. The fluid view holds every slide
 * child to its content height so a light slide stays compact (lib/base/base.fluid-view.css), which
 * left a panes host's stage 0px tall: an overflowing panes slide showed only its masthead, and the
 * overflow watcher, measuring two empty panes, put the "Fix Me" culprit on the FIRST pane rather
 * than the one that overflows. Both are pinned here on the real export in Chromium.
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

describe('export: the --fluid viewer lays out a panes slide', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 180000;
	const rows = Array.from({ length: 24 }, (_, i) => `| Region ${i + 1} | ${(i + 1) * 3} |`).join('\n');
	const DECK = `---\ntheme: indaco\n---\n\n## A table pane that overflows.\n\n<!-- panes: 35/65 -->\n<!-- pane: list -->\n\n- One point\n\n<!-- pane: table -->\n\n| Region | Value |\n|---|---|\n${rows}\n`;

	let dir;
	let browser;
	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fluid-panes-'));
		fs.writeFileSync(path.join(dir, 'over.md'), DECK);
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	test('both panes take the slide\'s height, and the culprit is the pane that overflows', { timeout: TIMEOUT }, async () => {
		const out = path.join(dir, 'over.html');
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'over.md'), out, '--quiet', '--fluid', '--overflow-marker=author'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		await page.waitForFunction(() => document.querySelector('.fit-culprit'), { timeout: 20000 });
		const got = await page.evaluate(() => {
			const s = document.querySelector('section');
			return {
				panes: [...s.querySelectorAll('lat-pane')].map((p) => ({ pane: p.dataset.pane, h: Math.round(p.getBoundingClientRect().height) })),
				culprit: [...document.querySelectorAll('.fit-culprit')].map((e) => e.closest('lat-pane')?.dataset.pane || 'host'),
			};
		});
		await page.close();
		for (const p of got.panes) assert.ok(p.h > 200, `${p.pane} pane is ${p.h}px tall in the fluid viewer`);
		assert.deepEqual(got.culprit, ['table'], 'the Fix Me culprit is the pane that overflows');
	});
});
