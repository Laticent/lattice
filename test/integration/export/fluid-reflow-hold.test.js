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
 *   - a long record table in a 30% pane on a phone is held (stacked full width, it still overflows as cards);
 *   - a phone stacks a panes slide's panes at full width, and a wide box or a portrait tablet keeps
 *     them side by side;
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
const { trackPageWork } = require('../../helpers/page-settle');

describe('export: the --fluid viewer holds and releases narrow layouts as the box changes', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 240000;
	const PHONE = { width: 390, height: 844 };
	const LANDSCAPE = { width: 844, height: 390 };
	const DESKTOP = { width: 1280, height: 800 };
	const TABLET = { width: 820, height: 1180 };

	const team = [
		['Ada Okafor', 'Engineering lead', 'Lagos', 'Core', '2019'], ['Priya Raman', 'Design director', 'Bengaluru', 'Design', '2021'],
		['Tomás Ruiz', 'Product manager', 'Madrid', 'Product', '2020'], ['Lena Fischer', 'Data scientist', 'Berlin', 'Data', '2022'],
		['Kenji Sato', 'Staff engineer', 'Osaka', 'Core', '2018'], ['Maya Cohen', 'Researcher', 'Haifa', 'Research', '2023'],
		['Omar Haddad', 'Designer', 'Amman', 'Design', '2021'],
	].map((r) => `| ${r.join(' | ')} |`).join('\n');
	// A phone stacks the panes (base.fluid-view.css), so the table has the phone's full width: five
	// columns still switch to cards there (below 24em), and a list this long overflows as cards.
	const longTeam = `${team}\n${team}`;
	const shortTeam = team.split('\n').slice(0, 2).join('\n');
	const pane = (rows) => `<!-- _class: columns ratio-30-70 -->\n\n### The team\n\n| Name | Role | City | Team | Since |\n| --- | --- | --- | --- | --- |\n${rows}\n\n### What changed\n\nEach row is one person.\n`;
	const DECK = `---\ntheme: indaco\n---\n\n## A long record list in a narrow pane.\n\n${pane(longTeam)}\n---\n\n## A short one.\n\n${pane(shortTeam)}`;
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
	// The hold pass waits out a 150 ms burst of size reports and then a frame; the page's own timer and frame queue
	// running dry, for three frames in a row so a resize's ResizeObserver work has run, is the signal it has judged the
	// settled box (HARD RULE #32).
	const settle = (settled) => settled({ frames: 3, images: true });
	const held = (page) => page.evaluate(() => document.querySelectorAll('.lat-reflow-held').length);
	const fresh = async (url, vp) => {
		const page = await browser.newPage();
		const settled = await trackPageWork(page);
		await page.setViewport(vp);
		await page.goto(url, { waitUntil: 'load' });
		await settle(settled);
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
		const settled = await trackPageWork(page);
		await page.setViewport(PHONE);
		await page.goto(url, { waitUntil: 'load' });
		await settle(settled);
		const atLoad = await page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')]
			.map((s) => s.querySelectorAll('.lat-reflow-held').length));
		// The long table overflows its stacked pane as cards on a phone, so it is held; the short one fits.
		assert.equal(atLoad[0], 1, `the long pane table is held on a phone (slides: ${atLoad})`);

		const seen = {};
		for (const [name, vp] of [['landscape', LANDSCAPE], ['back', PHONE], ['desktop', DESKTOP]]) {
			await page.setViewport(vp);
			await settle(settled);
			seen[name] = await held(page);
		}
		await page.close();
		const want = { landscape: await fresh(url, LANDSCAPE), back: await fresh(url, PHONE), desktop: await fresh(url, DESKTOP) };
		// The failing arm this pins: a hold-only pass left every narrow table held after one rotation.
		assert.deepEqual(seen, want, 'after each resize the holds equal a fresh load at that size');
	});

	test('a phone stacks a slide\'s panes at full width, and a wide or tablet box keeps them side by side', { timeout: TIMEOUT }, async () => {
		const url = render('stack', DECK);
		const page = await browser.newPage();
		const geometry = () => page.evaluate(() => {
			const s = document.querySelectorAll('section[data-lattice-slide]')[1];
			const panes = [...s.querySelectorAll('lat-pane')];
			const [a, b] = panes.map((p) => p.getBoundingClientRect());
			const stage = s.querySelector('.lat-panes').getBoundingClientRect();
			return {
				stacked: b.top >= a.bottom, side: b.left >= a.right,
				fullWidth: Math.abs(a.width - stage.width) < 1 && Math.abs(b.width - stage.width) < 1,
				// The 30% pane's render-time `tall` stamp is set aside while stacked (lib/runtime stampStackedPanes).
				family: panes[0].getAttribute('data-family'),
			};
		});
		// Wait on the signal the layout follows: the runtime's orientation stamp on the slide, and the
		// pane stamps that follow it, never on a fixed delay (HARD RULE #32).
		const until = (tall, paneFamily) => page.waitForFunction((want, fam) => {
			const s = document.querySelectorAll('section[data-lattice-slide]')[1];
			const p = s && s.querySelector('lat-pane');
			return document.fonts.status === 'loaded' && s.hasAttribute('data-orientation') === want && p.getAttribute('data-family') === fam;
		}, { timeout: 30000 }, tall, paneFamily);
		await page.setViewport(PHONE);
		await page.goto(url, { waitUntil: 'load' });
		await until(true, null);
		// On main the 30% pane was about 92px beside the 70% one.
		assert.deepEqual(await geometry(), { stacked: true, side: false, fullWidth: true, family: null }, 'a phone stacks the panes, each the full width');
		await page.setViewport(LANDSCAPE);
		await until(false, 'tall');
		assert.deepEqual(await geometry(), { stacked: false, side: true, fullWidth: false, family: 'tall' }, 'a landscape phone puts them side by side, with the pane stamp back');
		await page.setViewport(PHONE);
		await until(true, null);
		assert.equal((await geometry()).stacked, true, 'rotated back, they stack again');
		// A portrait tablet is tall but wider than 40em: its panes stay side by side, as on main.
		await page.setViewport(TABLET);
		await until(true, 'tall');
		assert.deepEqual(await geometry(), { stacked: false, side: true, fullWidth: false, family: 'tall' }, 'a portrait tablet keeps them side by side');
		await page.close();
	});

	test('a section nested in a slide does not set the deck\'s portrait scale', { timeout: TIMEOUT }, async () => {
		const url = render('nested', NESTED);
		const page = await browser.newPage();
		const settled = await trackPageWork(page);
		await page.setViewport(PHONE);
		await page.goto(url, { waitUntil: 'load' });
		await settle(settled);
		const got = await page.evaluate(() => ({
			style: !!document.getElementById('lattice-orientation'),
			scale: getComputedStyle(document.querySelector('section[data-lattice-slide]')).getPropertyValue('--canvas-scale').trim(),
		}));
		await page.close();
		assert.ok(got.style, 'the portrait canvas style is present on a phone');
		assert.notEqual(got.scale, '', 'the slides carry a canvas scale');
	});
});
