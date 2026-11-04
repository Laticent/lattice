/**
 * Integration: the `--fluid` viewer runs the narrow-layout fit check, and re-judges it on a resize.
 *
 * The fluid view is a PAGED host: one screen per slide, and what does not fit is clipped. So a narrow
 * table layout stands only where it fits (lib/core/table-reflow-fit.js), as on a slide. The fluid boot
 * branch skips the live-preview pass that used to hold it, so a fluid export held nothing; a first fix
 * then held but never released, so one phone rotation left every narrow table in table form; and two
 * stale stamps (`data-orientation`, the `#lattice-orientation` scale style) made a rotated slide differ
 * from a fresh load. engineering/decisions/2026-11-03-responsive-tables.md §"The fluid view is a paged
 * host". Pinned here on the real export in Chromium:
 *
 *   - after every rotation and widening, the held count equals a fresh load's at that size;
 *   - a long record table in a 30% pane on a phone is held (it overflows as cards);
 *   - a hand-authored `<section>` nested in a slide does not set the deck's orientation style.
 *
 * Slow tier: one CLI export per deck and a Chromium launch. See engineering/pipeline.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('node:url');

describe('export: the --fluid viewer holds and releases narrow layouts as the box changes', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 240000;
	const PHONE = { width: 390, height: 844 };
	const LANDSCAPE = { width: 844, height: 390 };
	const DESKTOP = { width: 1280, height: 800 };

	const team = [
		['Ada Okafor', 'Engineering lead', 'Lagos'], ['Priya Raman', 'Design director', 'Bengaluru'],
		['Tomás Ruiz', 'Product manager', 'Madrid'], ['Lena Fischer', 'Data scientist', 'Berlin'],
		['Kenji Sato', 'Staff engineer', 'Osaka'], ['Maya Cohen', 'Researcher', 'Haifa'], ['Omar Haddad', 'Designer', 'Amman'],
	].map((r) => `| ${r.join(' | ')} |`).join('\n');
	const shortTeam = team.split('\n').slice(0, 2).join('\n');
	const pane = (rows) => `<!-- _class: columns ratio-30-70 -->\n\n### The team\n\n| Name | Role | City |\n| --- | --- | --- |\n${rows}\n\n### What changed\n\nEach row is one person.\n`;
	const DECK = `---\ntheme: indaco\n---\n\n## A long record list in a narrow pane.\n\n${pane(team)}\n---\n\n## A short one.\n\n${pane(shortTeam)}`;
	const NESTED = `---\ntheme: indaco\n---\n\n## One slide.\n\nText.\n\n---\n\n## A slide with a nested section.\n\n<section style="display:block;width:300px;height:60px">inner box</section>\n`;

	let dir;
	let browser;
	const render = (name, md) => {
		fs.writeFileSync(path.join(dir, `${name}.md`), md);
		const out = path.join(dir, `${name}.html`);
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, `${name}.md`), out, '--quiet', '--fluid'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		return pathToFileURL(out).href;
	};
	const settle = (page) => new Promise((r) => setTimeout(r, 900)).then(() => page.evaluate(() => document.fonts.ready));
	const held = (page) => page.evaluate(() => document.querySelectorAll('.lat-reflow-held').length);
	const fresh = async (url, vp) => {
		const page = await browser.newPage();
		await page.setViewport(vp);
		await page.goto(url, { waitUntil: 'load' });
		await settle(page);
		const n = await held(page);
		await page.close();
		return n;
	};

	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fluid-hold-'));
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	test('a phone holds the overflowing pane table, and every resize lands where a fresh load does', { timeout: TIMEOUT }, async () => {
		const url = render('hold', DECK);
		const page = await browser.newPage();
		await page.setViewport(PHONE);
		await page.goto(url, { waitUntil: 'load' });
		await settle(page);
		const atLoad = await page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')]
			.map((s) => s.querySelectorAll('.lat-reflow-held').length));
		// The long table overflows its 30% pane as cards on a phone, so it is held; the short one fits.
		assert.equal(atLoad[0], 1, `the long pane table is held on a phone (slides: ${atLoad})`);

		const seen = {};
		for (const [name, vp] of [['landscape', LANDSCAPE], ['back', PHONE], ['desktop', DESKTOP]]) {
			await page.setViewport(vp);
			await settle(page);
			seen[name] = await held(page);
		}
		await page.close();
		const want = { landscape: await fresh(url, LANDSCAPE), back: await fresh(url, PHONE), desktop: await fresh(url, DESKTOP) };
		// The failing arm this pins: a hold-only pass left every narrow table held after one rotation.
		assert.deepEqual(seen, want, 'after each resize the holds equal a fresh load at that size');
	});

	test('a section nested in a slide does not set the deck\'s portrait scale', { timeout: TIMEOUT }, async () => {
		const url = render('nested', NESTED);
		const page = await browser.newPage();
		await page.setViewport(PHONE);
		await page.goto(url, { waitUntil: 'load' });
		await settle(page);
		const got = await page.evaluate(() => ({
			style: !!document.getElementById('lattice-orientation'),
			scale: getComputedStyle(document.querySelector('section[data-lattice-slide]')).getPropertyValue('--canvas-scale').trim(),
		}));
		await page.close();
		assert.ok(got.style, 'the portrait canvas style is present on a phone');
		assert.notEqual(got.scale, '', 'the slides carry a canvas scale');
	});
});
