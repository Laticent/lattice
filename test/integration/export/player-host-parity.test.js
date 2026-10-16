/**
 * Integration: HOST PARITY for the self-contained player's packer
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §10, §11).
 *
 * The CLI (`--player`) and the Studio (Webpage export) used to pack one document two ways: the
 * prune orchestration was written twice by hand, the Studio never subset its fonts, and the
 * Studio's bundle re-printed the transport kernels the player inlines with `.toString()`, so its
 * player script and CSP hash differed from the CLI's. This file pins the opposite:
 *
 *   1. A GOLDEN that fires every packer stage — glyph subsetting, the font prune, the identical-file
 *      font merge, the picture hoist, the CSS prune and its computed-style gate — on the fixture in
 *      test/fixtures/player-stages. The SHA was blessed on the code BEFORE the orchestration moved
 *      (2026-10-16, a8a5707+c0231d5), with the CLI's own prune extracted verbatim from lattice.js,
 *      so the move is proven byte-neutral. The frozen-artifact golden in
 *      test/unit/export/html-player.test.js reaches none of these stages.
 *   2. The SAME bytes from the Studio host: the Studio's real modules (player-caps-browser.ts,
 *      player-prune-browser.ts, the bundled player core and prune kernel) run in Chromium on the
 *      same input and must produce the golden SHA.
 *
 * What it does not cover, stated so a green run is not over-read: the two hosts' FRONT ENDS. The
 * CLI renders a deck to `docHtml` in its own Chromium page and the Studio renders it in the
 * author's browser, and those documents differ; the packer is at parity, the renderers are not.
 * Determinism holds within one engine (the prune keeps what THAT engine matches), so this asserts
 * Chromium only.
 *
 * Re-bless ONLY with a deliberate packer change, in the same commit, saying why.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { buildPlayerHtml } = require(path.join(ROOT, 'lib', 'export', 'html-player.js'));
const { prunePlayerHtml } = require(path.join(ROOT, 'lib', 'export', 'player-prune.js'));
const { playerStagesFixture } = require(path.join(ROOT, 'test', 'fixtures', 'player-stages', 'fixture.js'));

// Blessed 2026-10-16 on the pre-move code. Every stage fired: 2 pictures hoisted (13,017 bytes),
// fonts subset (34,016 bytes), 5/433 rules kept (60,018 bytes), 3/4 faces kept, 1 merged.
const GOLDEN_SHA = '5c2afbe15eae27fabff627dbe4c9fa9196b73d9185a802a7219f2ed00a40d316';
const GOLDEN_BYTES = 101757;

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

let puppeteer;
let browser;
before(async () => {
	puppeteer = require('puppeteer');
	const opts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
	if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
	browser = await puppeteer.launch(opts);
});
after(async () => {
	await browser?.close();
});

/** The CLI host's page capability, as lattice.js builds it, on the shared browser. */
const cliPage = async (html) => {
	const page = await browser.newPage();
	await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
	return { run: (probe, arg) => page.evaluate(probe, arg), close: () => page.close() };
};

test('the CLI host packs the stages fixture to the golden bytes, every stage firing', async () => {
	const { html, report } = await buildPlayerHtml(playerStagesFixture());
	assert.equal(report.subsetApplied, true, 'glyph subsetting fired');
	assert.equal(report.assetsHoisted, 2, 'both repeated pictures were stored once');
	const pr = await prunePlayerHtml(html, cliPage);
	assert.equal(pr.applied, true);
	assert.equal(pr.gateFailed, false, 'the computed-style gate passed');
	assert.equal(pr.keptRules, 5, 'the CSS prune kept only the used rules');
	assert.equal(pr.fontApplied, true, 'the font prune fired');
	assert.equal(pr.fontsMerged, 1, 'the identical-file merge fired');
	assert.equal(pr.html.length, GOLDEN_BYTES);
	assert.equal(sha(pr.html), GOLDEN_SHA, 'the packer moved a byte: re-bless only with a deliberate change');
});

test('the Studio host packs the same input to the same bytes, in Chromium', async (t) => {
	const esbuild = require('esbuild');
	const generated = ['player-core.generated.js', 'player-prune.generated.js'].map((f) => path.join(ROOT, 'docs', 'src', 'playground', f));
	if (generated.some((f) => !fs.existsSync(f))) {
		// Built by `npm run build`, which CI's integration job runs first. Say so rather than pass.
		assert.fail(`missing ${generated.filter((f) => !fs.existsSync(f)).join(', ')}: run \`npm run build\``);
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-host-parity-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	// The entry wires the Studio's own modules exactly as share-export.ts does.
	const entry = path.join(dir, 'entry.ts');
	fs.writeFileSync(
		entry,
		`import * as core from '@/playground/player-core.generated.js';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';
import { browserPlayerCaps } from '@/components/studio/player-caps-browser';
import { prunePlayerInBrowser, subsetFontsInBrowser } from '@/components/studio/player-prune-browser';
export async function pack(data) {
	const caps = browserPlayerCaps({ sanitize: sanitizeSlideHtml, subsetFonts: subsetFontsInBrowser });
	const { html, report } = await core.assemblePlayer(data, caps);
	const pr = await prunePlayerInBrowser(html);
	return { html: pr.applied ? pr.html : html, report, pr: { ...pr, html: undefined } };
}
`,
	);
	const WASM_PATH = '/hb-subset.wasm';
	const bundle = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		format: 'iife',
		globalName: 'Studio',
		platform: 'browser',
		write: false,
		logLevel: 'error',
		alias: { '@': path.join(ROOT, 'docs', 'src') },
		nodePaths: [path.join(ROOT, 'node_modules')],
		tsconfigRaw: '{}',
		// Vite's `?url` import: the page fetches the wasm from this test's server instead.
		plugins: [
			{
				name: 'vite-url',
				setup(b) {
					b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'vite-url' }));
					b.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: `export default ${JSON.stringify(WASM_PATH)};`, loader: 'js' }));
				},
			},
		],
	});
	const wasm = fs.readFileSync(require.resolve('harfbuzzjs/hb-subset.wasm'));
	// A real http origin: `crypto.subtle` (the sha256 cap) exists only in a secure context.
	const server = http.createServer((req, res) => {
		if (req.url === WASM_PATH) {
			res.setHeader('content-type', 'application/wasm');
			return res.end(wasm);
		}
		res.setHeader('content-type', 'text/html');
		res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	t.after(() => server.close());
	const page = await browser.newPage();
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.address().port}/`);
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	const out = await page.evaluate((data) => Studio.pack(data), playerStagesFixture());
	assert.equal(out.report.subsetApplied, true, 'the Studio subsets its fonts now, as the CLI does');
	assert.equal(out.pr.applied, true);
	assert.equal(out.pr.gateFailed, false);
	assert.equal(out.html.length, GOLDEN_BYTES);
	assert.equal(sha(out.html), GOLDEN_SHA, 'the Studio host packed the same input to different bytes than the CLI');
});
