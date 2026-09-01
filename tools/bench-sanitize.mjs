/**
 * Time the slide-HTML sanitizer in the browser the preview actually runs in.
 *
 * `sanitizeSlideHtml` (lib/core/sanitize-slide-html.mjs) is the largest single span left in a
 * cheap deck's preview render — ~4.3ms, and FLAT across a 6.5x difference in deck bytes, which is
 * the signature of a fixed per-call cost rather than content-proportional work (#1543,
 * engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md Amendments 7 and 8).
 * This is the harness that attributed it, kept so the numbers in those notes can be re-derived
 * instead of believed.
 *
 * WHY A BROWSER AND NOT `npm run bench`. The engine bench measures the engine in Node; this cost
 * is DOMPurify over the DOM of the host it runs in, and jsdom is not that host. Everything here
 * runs in the same Chromium the PDF/HTML paths use, under the SAME 4x CPU throttle
 * `docs/e2e/studio-preview-perf.spec.ts` uses, so a figure printed here is comparable with the
 * SANITIZE column that spec prints.
 *
 * THREE ARMS, one row per input:
 *   A  per-call config — `dp.sanitize(html, cfg)`, which re-runs DOMPurify's `_parseConfig` and
 *      rebuilds its ~250-tag / ~300-attribute allowlists on every call. What shipped before #1543.
 *   B  setConfig once — what ships now.
 *   C  memo hit — a `Map.get` on the exact input string, the floor `sanitizeOnce` reaches in
 *      docs/src/lib/single-slide-render.ts.
 * Inputs are REAL engine output: a prose slide, the median and heaviest slices of the 40-slide
 * gallery, and the whole 40-slide render as a control (at 62KB the config parse is a rounding
 * error, which is what "fixed cost" predicts).
 *
 * BATCH-TIMED. `performance.now()` is coarsened, so one call per sample quantizes to 0.1ms and a
 * 0.2ms effect disappears into the quantization. Each sample times 20 calls and divides; the
 * printed figure is the p50 of those per-call means.
 *
 * `--verify` swaps the timing for an EQUIVALENCE sweep: every section of every committed deck,
 * sanitized both ways, compared byte for byte. Run it on BOTH hosts — `--verify` in Chromium (the
 * preview's host) and `--verify --node` over jsdom (the `.html` export assembler's host). The two
 * are not interchangeable: DOMPurify's parser is the host's, and mXSS is exactly the class of
 * behavior that differs between the two engines.
 *
 * Usage:  CHROME_PATH=… node tools/bench-sanitize.mjs [--rate 1,4] [--samples 25]
 *         CHROME_PATH=… node tools/bench-sanitize.mjs --verify
 *         node tools/bench-sanitize.mjs --verify --node
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ADD_ATTR, ADD_TAGS, FORBID_ATTR, FORBID_TAGS, STYLE_SCRIPT_RE } from '../lib/core/sanitize-slide-html.mjs';

const require = createRequire(import.meta.url);
const { render } = require('../lib/engine/index.js');
const ROOT = path.resolve(import.meta.dirname, '..');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = argv.indexOf(name);
	return i === -1 ? fallback : argv[i + 1];
};
const RATES = String(arg('--rate', '1,4'))
	.split(',')
	.map(Number);
const SAMPLES = Number(arg('--samples', 25));
const BATCH = 20;

const PROSE = '---\ntheme: indaco\npaginate: true\n---\n\n## Slide 7\n\nBody text for slide 7, with enough prose to be a real section.\n';

/** The perf spec's own gallery deck: the first n slides of the baseline gallery, fence-aware. */
function gallerySlides(n) {
	const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
	const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(src)?.[0] ?? '';
	const chunks = [[]];
	let fence = false;
	for (const line of src.slice(fm.length).split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		if (!fence && /^-{3,}\s*$/.test(line)) {
			chunks.push([]);
			continue;
		}
		chunks[chunks.length - 1].push(line);
	}
	return { fm, slides: chunks.map((c) => c.join('\n').trim()).filter(Boolean).slice(0, n) };
}

const cases = [{ name: 'prose slide', html: (await render(PROSE, 'indaco')).html }];
{
	const { fm, slides } = gallerySlides(40);
	const rendered = [];
	for (const s of slides) {
		try {
			rendered.push((await render(`${fm}\n${s}\n`, 'indaco')).html);
		} catch {
			// A slide the bare Node engine cannot render is not this harness's subject.
		}
	}
	rendered.sort((a, b) => a.length - b.length);
	cases.push({ name: 'gallery median slice', html: rendered[Math.floor(rendered.length / 2)] });
	cases.push({ name: 'gallery heaviest slice', html: rendered[rendered.length - 1] });
	cases.push({ name: 'gallery 40-slide deck', html: (await render(`${fm}\n${slides.join('\n\n---\n\n')}\n`, 'indaco')).html });
}

/** Every section of every committed deck — the corpus the equivalence sweep asks about. */
function corpusSections() {
	const walk = (dir, out = []) => {
		if (!fs.existsSync(dir)) return out;
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p, out);
			else if (e.name.endsWith('.md') && !e.name.endsWith('.docs.md')) out.push(p);
		}
		return out;
	};
	return [...walk(path.join(ROOT, 'examples')), ...walk(path.join(ROOT, 'lib/components')).filter((f) => f.endsWith('.gallery.md')), ...walk(path.join(ROOT, 'test/integration/baseline-decks')), ...walk(path.join(ROOT, 'exemplars'))];
}

const cfg = { FORBID_TAGS, FORBID_ATTR, ADD_TAGS, ADD_ATTR };
const styleRe = { source: STYLE_SCRIPT_RE.source, flags: STYLE_SCRIPT_RE.flags };

/** Walk the corpus once, calling back with every render and every section of it. */
async function eachCorpusString(onPiece) {
	let decks = 0;
	let pieces = 0;
	let bytes = 0;
	for (const file of corpusSections()) {
		let out;
		try {
			out = await render(fs.readFileSync(file, 'utf8'), 'indaco');
		} catch {
			continue; // a deck the bare Node engine cannot render is not this sweep's subject
		}
		decks++;
		for (const piece of [out.html, ...out.html.split(/(?=<section\b)/).filter((p) => p.includes('<section'))]) {
			pieces++;
			bytes += piece.length;
			await onPiece(piece);
		}
	}
	return { decks, pieces, bytes };
}

function verdict({ decks, pieces, bytes }, host, mismatches) {
	console.log(`decks rendered: ${decks}`);
	console.log(`strings sanitized both ways, in ${host}: ${pieces} (${(bytes / 1024 / 1024).toFixed(1)} MB of engine HTML)`);
	console.log(mismatches.length === 0 ? 'BYTE-IDENTICAL — per-call config and setConfig agree everywhere' : `DIFFERENCES: ${mismatches.length}`);
	for (const m of mismatches.slice(0, 5)) console.log('  ', m);
	process.exit(mismatches.length === 0 ? 0 : 1);
}

// THE EXPORT HOST. `lib/export/html-player.js` sanitizes over a jsdom window, so the same question
// has to be asked there — and it can be, without a browser at all.
if (argv.includes('--verify') && argv.includes('--node')) {
	const DOMPurify = (await import('dompurify')).default;
	const { JSDOM } = await import('jsdom');
	const mk = () => {
		const dp = DOMPurify(new JSDOM('').window);
		dp.addHook('uponSanitizeAttribute', (_node, data) => {
			if (data.attrName === 'style' && STYLE_SCRIPT_RE.test(data.attrValue)) data.keepAttr = false;
		});
		return dp;
	};
	const dpA = mk(); // per-call config — what shipped before #1543
	const dpB = mk();
	dpB.setConfig(cfg); // configured once — what ships now
	const mismatches = [];
	const counts = await eachCorpusString((piece) => {
		if (dpA.sanitize(piece, cfg) !== dpB.sanitize(piece)) mismatches.push(piece.slice(0, 120));
	});
	verdict(counts, 'Node + jsdom', mismatches);
}

const purify = fs.readFileSync(path.join(ROOT, 'docs/node_modules/dompurify/dist/purify.js'), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: purify });
const client = await page.createCDPSession();

if (argv.includes('--verify')) {
	// EQUIVALENCE, not speed, on the PREVIEW's host. Batched so no single evaluate ships the corpus.
	const mismatches = [];
	let batch = [];
	const flush = async () => {
		if (!batch.length) return;
		const bad = await page.evaluate(
			({ htmls, cfg, styleRe }) => {
				const mk = () => {
					const dp = window.DOMPurify(window);
					dp.addHook('uponSanitizeAttribute', (_node, data) => {
						if (data.attrName === 'style' && new RegExp(styleRe.source, styleRe.flags).test(data.attrValue)) data.keepAttr = false;
					});
					return dp;
				};
				const dpA = mk();
				const dpB = mk();
				dpB.setConfig(cfg);
				const out = [];
				// Asked twice per string, in both orders: a difference that only appears once an
				// instance is warm would survive a single pass.
				for (const [i, html] of htmls.entries()) {
					if (dpA.sanitize(html, cfg) !== dpB.sanitize(html)) out.push(i);
					if (dpB.sanitize(html) !== dpA.sanitize(html, cfg)) out.push(i);
				}
				return out;
			},
			{ htmls: batch, cfg, styleRe },
		);
		for (const i of bad) mismatches.push(batch[i].slice(0, 120));
		batch = [];
	};
	const counts = await eachCorpusString(async (piece) => {
		batch.push(piece);
		if (batch.length >= 25) await flush();
	});
	await flush();
	await browser.close();
	verdict(counts, 'Chromium', mismatches);
}

for (const rate of RATES) {
	await client.send('Emulation.setCPUThrottlingRate', { rate });
	console.log(`\n=== CPU throttle ${rate}x — p50 of ${SAMPLES} samples, each the mean of ${BATCH} calls ===`);
	console.log('case                        A per-call cfg   B setConfig     C memo hit    bytes  identical');
	for (const c of cases) {
		const r = await page.evaluate(
			({ html, cfg, styleRe, n, batch }) => {
				const mk = () => {
					const dp = window.DOMPurify(window);
					dp.addHook('uponSanitizeAttribute', (_node, data) => {
						if (data.attrName === 'style' && new RegExp(styleRe.source, styleRe.flags).test(data.attrValue)) data.keepAttr = false;
					});
					return dp;
				};
				const p50 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
				const time = (fn) => {
					const t = performance.now();
					for (let i = 0; i < batch; i++) fn();
					return (performance.now() - t) / batch;
				};
				const a = [];
				const dpA = mk();
				for (let i = 0; i < n; i++) a.push(time(() => dpA.sanitize(html, cfg)));
				const b = [];
				const dpB = mk();
				dpB.setConfig(cfg);
				for (let i = 0; i < n; i++) b.push(time(() => dpB.sanitize(html)));
				const memo = new Map([[html, dpB.sanitize(html)]]);
				const c = [];
				for (let i = 0; i < n; i++) c.push(time(() => memo.get(html)));
				return { a: p50(a), b: p50(b), c: p50(c), same: dpA.sanitize(html, cfg) === dpB.sanitize(html) };
			},
			{ html: c.html, cfg, styleRe, n: SAMPLES, batch: BATCH },
		);
		console.log(
			`${c.name.padEnd(24)} ${r.a.toFixed(2).padStart(10)}ms ${r.b.toFixed(2).padStart(10)}ms ${r.c.toFixed(3).padStart(11)}ms ${String(c.html.length).padStart(8)}  ${r.same}`,
		);
	}
}
await browser.close();
