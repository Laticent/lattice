// Mobile/tablet/desktop horizontal-overflow guard for the converted docs
// surfaces. A page wider than its viewport becomes horizontally pannable, and
// on touch any zoom/scroll/tap reveals scrolled-off, broken layout — exactly
// the Workbench regression that shipped (the CSS-grid `1fr` = `minmax(auto,1fr)`
// trap + shadcn-button rows that wouldn't shrink) and the playground tablet
// topbar overflow. A pure static check would have MISSED the first (it only
// surfaced after a pane switch), so this exercises the interaction states too.
//
// Asserts scrollWidth <= clientWidth (+2px tolerance) at 390 / 820 / 1440 for
// every converted surface, after each interaction step. Requires a built
// `dist/` (the perf step / `astro build` produces it) and CHROME_PATH.
//
// Run: `npm run check:overflow` (after a build). CI: ci.yml `docs-build` job (advisory).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 4396;
const TOLERANCE = 2; // sub-pixel rounding
// 700 is the FLOOR of the `tablet` breakpoint (use-breakpoint.ts: mobile ends at
// 699), and it is the width this guard was blind to. #1381 lived entirely in
// 700–787: the Studio header fit at 820 and overflowed below ~787, pushing the ⋯
// Menu — a tablet's only route to Library / Reader views / Workspace settings —
// off-screen. Testing a band only at its widest point tests the case least likely
// to break, so each band now carries its narrowest supported width too.
const BREAKPOINTS = [
	['mobile', 390, 844],
	['tablet-floor', 700, 1000],
	['tablet', 820, 1180],
	['desktop', 1440, 900],
];

// Interaction steps: each `find` runs in the page and returns the element to
// click (resilient — a missing target is skipped, not failed). Run only at
// mobile/tablet, where the viewport constrains.
const CASES = [
	{ name: 'landing', path: '/lattice/' },
	{
		name: 'components',
		path: '/lattice/components/',
		steps: [{ label: 'nav-drawer', find: () => [...document.querySelectorAll('button')].find((b) => /components|menu/i.test(b.getAttribute('aria-label') || b.textContent || '')) }],
	},
	{ name: 'component-page', path: '/lattice/components/comparison/verdict-grid/' },
	{
		name: 'playground',
		path: '/lattice/playground/',
		steps: [
			{ label: 'picker', find: () => document.querySelector('#pg-template-trigger') },
			{ label: 'deck-setup', find: () => [...document.querySelectorAll('button')].find((b) => /Deck setup/.test(b.getAttribute('aria-label') || b.textContent || '')) },
			{ label: 'galleries', find: () => [...document.querySelectorAll('button')].find((b) => /Galleries/.test(b.getAttribute('aria-label') || b.textContent || '')) },
		],
	},
	{
		// The Studio SUCCEEDED the Workbench and Drawing Board cases that used to sit here.
		// Both were removed in the succession (2026-07-03-studio-succession.md P5); leaving
		// their entries behind would not have gone red — their paths now serve a redirect
		// stub, so this guard would have measured /studio/ twice under two wrong names with
		// every `find()` returning null, reporting coverage it wasn't providing. The
		// interaction states matter here for the same reason they did on the Workbench:
		// panes and drawers only overflow once shown.
		name: 'studio',
		path: '/lattice/studio/',
		// The top bar is a single non-wrapping flex row of controls, every one of them
		// `shrink-0` bar the deck switcher. Once the title truncates to its floor the row
		// has no give left and the tail controls leave the screen silently. #1381.
		noSelfOverflow: ['[data-studio-root] header'],
		steps: [
			{ label: 'coach', find: () => [...document.querySelectorAll('button')].find((b) => /Toggle Coach/.test(b.getAttribute('aria-label') || '')) },
			{ label: 'chat', find: () => [...document.querySelectorAll('button')].find((b) => /Toggle Chat/.test(b.getAttribute('aria-label') || '')) },
			{ label: 'workspace', find: () => [...document.querySelectorAll('button')].find((b) => /Workspace launcher/.test(b.getAttribute('aria-label') || '')) },
		],
	},
	{
		name: 'docs',
		path: '/lattice/getting-started/',
		steps: [{ label: 'sidebar', find: () => document.querySelector('starlight-menu-button button') || [...document.querySelectorAll('button')].find((b) => /menu/i.test(b.getAttribute('aria-label') || '')) }],
	},
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mjs': 'text/javascript', '.map': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function serve() {
	return http
		.createServer((req, res) => {
			let u = decodeURIComponent(req.url.split('?')[0]).replace(/^\/lattice/, '');
			if (u.endsWith('/')) u += 'index.html';
			if (!path.extname(u)) u += '/index.html';
			fs.readFile(path.join(DIST, u), (e, d) => {
				if (e) {
					res.writeHead(404);
					res.end();
				} else {
					res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
					res.end(d);
				}
			});
		})
		.listen(PORT, '127.0.0.1');
}

function chromePath() {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	try {
		return execSync('ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1').toString().trim() || undefined;
	} catch {
		return undefined;
	}
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Document-level overflow is only HALF the failure mode, and it is the half that
// misses the worse one. When a too-wide row sits inside a clipping ancestor, the
// document never grows — the page looks perfectly fine to the check above — and the
// controls at the end of the row are simply GONE. That is #1381: the Studio header
// wanted 787px at a 700px viewport and put the ⋯ Menu (a tablet's only route to
// Library / Reader views / Workspace settings) past the right edge, with
// `documentElement.scrollWidth - clientWidth === 0` throughout. Adding the 700px
// breakpoint alone did NOT catch it — verified by mutation, the run stayed green.
//
// So: name the rows that must never self-overflow and measure THEM, not the page.
// `scrollWidth > clientWidth` on the row itself is exactly "my content does not
// fit inside me", which is the invariant a toolbar has to hold. Scoped to an
// explicit selector list because plenty of elements are legitimately wider than
// their box (the slide navigator scrolls on purpose) — a blanket rule would cry
// wolf and get muted.
const selfOverflow = (page, selectors) =>
	page.evaluate((sels) => {
		const out = [];
		for (const sel of sels) {
			for (const el of document.querySelectorAll(sel)) {
				const d = el.scrollWidth - el.clientWidth;
				if (d > 1) out.push(`${sel}·wants ${el.scrollWidth} in ${el.clientWidth} (+${d}px)`);
			}
		}
		return out;
	}, selectors);
const offenders = (page) =>
	page.evaluate(() => {
		const vw = document.documentElement.clientWidth;
		const o = [];
		for (const el of document.querySelectorAll('body *')) {
			const r = el.getBoundingClientRect();
			if (r.right > vw + 1 && r.width > 0) o.push(`${(typeof el.className === 'string' ? el.className : el.tagName).slice(0, 40)}·${Math.round(r.right)}`);
		}
		return [...new Set(o)].slice(0, 5);
	});

async function main() {
	if (!fs.existsSync(path.join(DIST, 'index.html'))) {
		console.error('✗ docs/dist not built — run `npm run build` (or the perf step) first.');
		process.exit(1);
	}
	const exe = chromePath();
	if (!exe) {
		console.error('✗ no Chrome found — set CHROME_PATH.');
		process.exit(1);
	}
	const server = serve();
	const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] });
	const failures = [];
	let checks = 0;

	for (const [bp, w, h] of BREAKPOINTS) {
		for (const c of CASES) {
			const page = await browser.newPage();
			await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
			await page.goto(`http://127.0.0.1:${PORT}${c.path}`, { waitUntil: 'networkidle0', timeout: 45000 });
			await new Promise((r) => setTimeout(r, 2500));
			const record = async (label) => {
				checks++;
				const ov = await overflow(page);
				if (ov > TOLERANCE) failures.push(`${bp} ${c.name} [${label}] overflow=${ov}px — ${JSON.stringify(await offenders(page))}`);
				if (c.noSelfOverflow) {
					const self = await selfOverflow(page, c.noSelfOverflow);
					if (self.length) failures.push(`${bp} ${c.name} [${label}] clipped row — ${JSON.stringify(self)}`);
				}
			};
			await record('initial');
			if (c.steps && bp !== 'desktop') {
				for (const s of c.steps) {
					try {
						const handle = await page.evaluateHandle(s.find);
						const el = handle.asElement();
						if (el) {
							await el.click();
							await new Promise((r) => setTimeout(r, 600));
							await record(s.label);
						} else {
							// A step whose target is missing used to vanish without a trace, so a
							// case pointed at a dead route reported "checked" while exercising
							// nothing (the retired Workbench/Drawing Board entries did exactly
							// that until 2026-08-02). Name the miss so disguised coverage is
							// visible; still not a failure, since a step can legitimately be
							// absent at one breakpoint.
							console.warn(`  · ${c.name} @${bp}: step "${s.label}" found no target — not exercised`);
						}
					} catch {
						/* best-effort: a missing target is not a failure */
					}
				}
			}
			await page.close();
		}
	}

	await browser.close();
	server.close();

	if (failures.length) {
		console.error(`✗ horizontal overflow on ${failures.length} state(s) (of ${checks} checked):`);
		for (const f of failures) console.error(`  • ${f}`);
		console.error('\n"overflow=" — the PAGE is wider than the viewport, so it pans on touch. Fix with minmax(0,1fr) / min-width:0 / flex-wrap.');
		console.error('"clipped row" — the row fits the page but not ITSELF, so the controls at its end are off-screen and unreachable.');
		console.error('  Give the row less to carry at that width (drop a label, fold a non-protected control into the overflow menu), not more room to overflow into.');
		process.exit(1);
	}
	console.log(`✓ no horizontal overflow — ${checks} states checked across mobile/tablet/desktop on every converted surface.`);
}

main().catch((e) => {
	console.error('check-overflow error:', e.message);
	process.exit(1);
});
