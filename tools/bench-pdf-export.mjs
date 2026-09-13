#!/usr/bin/env node
// Times the Studio's REAL browser PDF export, per browser engine, and checks the
// pages it produces against a baseline PDF — page for page, by the image each page
// actually draws.
//
// Why a tool and not a `bench` dataset: the thing being measured is a Web Worker
// pipeline inside a real browser (OffscreenCanvas encode, ImageBitmap transfers, the
// capture frame). `test/benchmark/engine-bench.mjs` runs in Node and cannot reach it
// — its "print" tier re-implements the assemble half in Node precisely because the
// browser module's imports are browser-only. So the reproducible measurement behind
// HARD RULE #19 for this path lives here: it drives the built docs site with
// Playwright, the same surface a user drives.
//
// Prerequisite: a built docs site (`cd docs && npm run build:e2e`). Chromium is
// preinstalled in the sandbox; `npx playwright install firefox webkit` adds the rest.
//
// Usage
//   node tools/bench-pdf-export.mjs                                 # chromium, 20 blocks
//   node tools/bench-pdf-export.mjs --engine webkit --slides 58
//   node tools/bench-pdf-export.mjs --format jpeg
//   node tools/bench-pdf-export.mjs --verify .scratch/pdf-bench/baseline.pdf
//
// Flags
//   --engine <chromium|firefox|webkit>   default chromium
//   --slides <n>                         how many `---` blocks of the deck to load (default 20)
//   --deck <path>                        default examples/gallery-jargon.md
//   --format <png|jpeg>                  the Workspace page-format preference
//   --verify <pdf>                       compare every page against this PDF
//   --out <dir>                          where the PDF lands (default .scratch/pdf-bench)
//
// Reports wall time, peak browser RSS sampled from the OS, and — with --verify — a
// per-page digest match. The digest resolves each page's content stream to the image
// it draws, so a transposed page fails it; page count alone does not. Exit code 1 if
// the pages differ.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'docs/package.json'));
const { chromium, firefox, webkit } = await import(join(ROOT, 'docs/node_modules/@playwright/test/index.mjs'));
const { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = require('pdf-lib');

function flag(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}
const ENGINE = String(flag('engine', 'chromium'));
const SLIDES = Number(flag('slides', 20));
const FORMAT = String(flag('format', 'png'));
const VERIFY = flag('verify', null);
const OUT = String(flag('out', join(ROOT, '.scratch/pdf-bench')));
const DECK = String(flag('deck', join(ROOT, 'examples/gallery-jargon.md')));
const ENGINES = { chromium, firefox, webkit };
const PROCESS_MATCH = { chromium: 'chrom', firefox: 'firefox', webkit: 'WebKit\\|MiniBrowser\\|webkit' };
if (!ENGINES[ENGINE]) throw new Error(`unknown engine "${ENGINE}" — chromium | firefox | webkit`);

// The deck's repo-relative `logo:` cannot resolve over http, and html-to-image throws
// the raw load Event when an embedded image 404s — which fails the export itself.
const source = readFileSync(DECK, 'utf8').split('\n---\n').slice(0, SLIDES + 1).join('\n---\n').replace(/^logo:.*$/m, '');
mkdirSync(OUT, { recursive: true });

/** Peak resident memory of every browser process while an arm runs. */
function sampleRss(match) {
	let peak = 0;
	const id = setInterval(() => {
		try {
			const out = execSync(`ps -eo rss=,args= | grep -i "${match}" | grep -v grep`, { encoding: 'utf8' });
			const total = out.split('\n').filter(Boolean).reduce((n, line) => n + Number(line.trim().split(/\s+/)[0] || 0), 0);
			if (total > peak) peak = total;
		} catch {
			/* no browser processes yet */
		}
	}, 250);
	return () => {
		clearInterval(id);
		return Math.round(peak / 1024);
	};
}

/**
 * One digest per page, taken from the image that page actually draws. It has to go
 * through the page's CONTENT STREAM (`/Name Do`) and only then into the resources:
 * jsPDF gives every page of a document the same shared XObject dictionary, so reading
 * "the first image in the resources" returns the same bytes for every page and would
 * call any order correct. The XObject NAME is deliberately not part of the digest —
 * each lane numbers its own images from zero.
 */
async function pageDigests(file) {
	const doc = await PDFDocument.load(readFileSync(file));
	return doc.getPages().map((page) => {
		const contents = doc.context.lookup(page.node.get(PDFName.of('Contents')));
		const decoded = contents instanceof PDFRawStream ? decodePDFRawStream(contents).decode() : new Uint8Array();
		const name = /\/([A-Za-z0-9_.+-]+)\s+Do\b/.exec(new TextDecoder('latin1').decode(decoded))?.[1];
		const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
		const image = name && xobjects ? xobjects.lookup(PDFName.of(name)) : null;
		const raw = image instanceof PDFRawStream ? image.contents : new Uint8Array();
		let hash = 0x811c9dc5;
		for (let i = 0; i < raw.length; i++) {
			hash ^= raw[i];
			hash = Math.imul(hash, 0x01000193);
		}
		return `${raw.length}:${(hash >>> 0).toString(16)}`;
	});
}

const preview = spawn('npx', ['astro', 'preview', '--port', '4321'], { cwd: join(ROOT, 'docs'), stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error('astro preview never came up — is docs/dist built?')), 90_000);
	preview.stdout.on('data', (chunk) => {
		if (String(chunk).includes('localhost:4321')) {
			clearTimeout(timer);
			setTimeout(resolve, 500);
		}
	});
});

async function run(browser) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
	const page = await context.newPage();
	await page.addInitScript(`window.__pageFormat = ${JSON.stringify(FORMAT)};`);
	await page.addInitScript(() => {
		const counter = window;
		counter.__pdfWorkers = 0;
		const Original = window.Worker;
		window.Worker = class extends Original {
			constructor(url, opts) {
				if (/pdf-export-worker/.test(String(url))) counter.__pdfWorkers += 1;
				super(url, opts);
			}
		};
		try {
			const key = 'lattice-studio-settings';
			localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || '{}'), posture: 'craft', pdfPages: window.__pageFormat || 'png' }));
		} catch {
			/* storage unavailable — the app falls back to its default */
		}
	});
	await page.goto('http://localhost:4321/studio/', { waitUntil: 'domcontentloaded' });
	await page.frameLocator('[aria-label="Live deck preview"] iframe.live').locator('.lattice section').first().waitFor({ state: 'visible', timeout: 120_000 });
	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(source);
	await page.waitForTimeout(Math.max(4000, Math.min(15_000, source.length / 40)));
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.waitFor({ state: 'visible', timeout: 30_000 });
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 900_000 });
	const stopRss = sampleRss(PROCESS_MATCH[ENGINE]);
	const started = Date.now();
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	const wall = Date.now() - started;
	const peakRss = stopRss();
	const out = join(OUT, `${ENGINE}-${SLIDES}-${FORMAT}.pdf`);
	await file.saveAs(out);
	const workers = await page.evaluate(() => window.__pdfWorkers);
	await context.close();
	return { wall, peakRss, workers, out };
}

const browser = await ENGINES[ENGINE].launch();
try {
	const r = await run(browser);
	const digests = await pageDigests(r.out);
	console.log(`${ENGINE} · ${SLIDES} blocks → ${digests.length} pages · ${FORMAT}: ${(r.wall / 1000).toFixed(1)}s  (${(r.wall / digests.length).toFixed(0)} ms/page)  peak RSS ${r.peakRss} MB  workers ${r.workers}  → ${r.out}`);
	if (VERIFY) {
		const baseline = await pageDigests(String(VERIFY));
		const same = baseline.length === digests.length && baseline.every((d, i) => d === digests[i]);
		console.log(`vs ${VERIFY}: ${baseline.length} pages · distinct ${new Set(baseline).size} · identical page-for-page: ${same ? 'YES' : 'NO'}`);
		if (!same) process.exitCode = 1;
	}
} finally {
	await browser.close();
	preview.kill();
}
