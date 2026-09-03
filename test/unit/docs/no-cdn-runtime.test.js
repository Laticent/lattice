/**
 * The docs site self-hosts every runtime dependency — no CDN, ever.
 *
 * WHY THIS IS A TEST AND NOT A CODE REVIEW HABIT. Mermaid and KaTeX were reachable
 * from a third-party CDN through a "back-compat" DEFAULT, not through any call site
 * that meant to use one: `deck-preview.js` exported `MERMAID_URL`/`KATEX_URL`
 * pointing at jsdelivr, and four places read `options.x || <that constant>`. A host
 * that simply did not pass a URL got the CDN, silently, and it worked — so nothing
 * ever failed to reveal it. The landing page was live on that path: `index.astro`
 * gates its `diagram` field card on ```mermaid (via CARD_COMPONENTS) and passed no `mermaidUrl`, so
 * the most-visited page on the site executed `mermaid@11` — a FLOATING major, so
 * whatever 11.x jsdelivr was serving that day — with no `integrity` attribute,
 * inside the preview frame, on the surface that holds the user's OpenRouter key.
 * That is HARD RULE #22's threat model (script execution → key theft) arriving
 * through a default value rather than through a sanitizer hole.
 *
 * Deleting the constants fixes it once. This test is what stops it coming back:
 * the failure mode is a DEFAULT nobody notices, and the only durable defense is a
 * gate that refuses the URL's existence rather than one that inspects call sites.
 *
 * SCOPE — `docs/src/**` only, and deliberately:
 *   · `tools/` may fetch a CDN at BUILD time and vendor the result (that is the
 *     wanted pattern — `build-basemap.js`, `fetch-emoji-font.js`), so it is not
 *     scanned. The output is committed and served from our own origin.
 *   · `lib/components/chart/map/map.basemap.json` carries a `sourceUrl` as
 *     PROVENANCE metadata for a vendored 21KB file. Also not scanned, also fine.
 *   · This file names the hosts it bars, so it is excluded from its own scan.
 *
 * See engineering/decisions/2026-09-03-self-hosted-runtime-deps.md.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const DOCS_SRC = path.join(REPO, 'docs', 'src');

// The hosts a runtime dependency must never come from. Not an exhaustive list of
// CDNs on the internet — it is the list of ones this repo has actually reached for,
// plus the obvious neighbours, so a copy-paste from a README trips it.
const BARRED_HOSTS = [
	'cdn.jsdelivr.net',
	'unpkg.com',
	'cdnjs.cloudflare.com',
	'code.jquery.com',
	'esm.sh',
	'fonts.googleapis.com',
	'fonts.gstatic.com',
];

// This test file itself, which necessarily spells the hosts out.
const SELF = path.relative(REPO, __filename);

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'dist') continue;
			walk(full, out);
		} else if (/\.(m?[jt]sx?|astro|css)$/.test(entry.name)) {
			out.push(full);
		}
	}
	return out;
}

test('no docs/src file references a CDN host', () => {
	const files = walk(DOCS_SRC);
	// A guard on the guard: if the walk finds nothing, the test would pass vacuously
	// and certify a tree it never read.
	assert.ok(files.length > 100, `expected to scan >100 docs/src files, scanned ${files.length}`);

	/** @type {string[]} */
	const hits = [];
	for (const file of files) {
		const rel = path.relative(REPO, file);
		if (rel === SELF) continue;
		const text = fs.readFileSync(file, 'utf8');
		text.split('\n').forEach((line, i) => {
			for (const host of BARRED_HOSTS) {
				if (line.includes(host)) hits.push(`${rel}:${i + 1} → ${host}`);
			}
		});
	}

	assert.deepStrictEqual(
		hits,
		[],
		`docs/src must not reference a CDN host — self-host it instead (stage it in ` +
			`docs/scripts/sync-playground-assets.mjs and pass the local URL through the ` +
			`host's options). Found:\n  ${hits.join('\n  ')}`,
	);
});

test('the relative paths the hosts request are the ones sync-playground-assets stages', () => {
	// The other half of the contract: with the CDN fallback gone, a rename on either
	// side is the difference between a rendered diagram and a blank one, and nothing
	// else would catch it — the hosts build their URL by string concatenation.
	//
	// This is checked from SOURCE, not from built output, and that is deliberate.
	// The first cut asserted the staged files existed under
	// docs/public/playground/v/<hash>/. That directory is GITIGNORED (.gitignore:132,
	// zero tracked files), so it passed locally — where a docs build had populated
	// it — and failed on a fresh CI checkout. Exactly the HARD RULE #23 trap: the
	// artifact happened to be on the machine that ran the check. Both sides of this
	// contract are committed source, so this arm holds anywhere.
	const staging = fs.readFileSync(path.join(REPO, 'docs', 'scripts', 'sync-playground-assets.mjs'), 'utf8');

	// KaTeX is staged by literal destination path.
	assert.match(
		staging,
		/'katex\/katex\.min\.css'/,
		"sync-playground-assets.mjs must stage 'katex/katex.min.css' — the hosts request exactly that path and no CDN backs it up",
	);

	// Mermaid is staged as `export/${basename(from)}` from the shared marp-bundle
	// manifest, so the guarantee that `export/mermaid-v11.min.js` exists is that a
	// STATIC_ASSETS entry has that basename.
	const { STATIC_ASSETS } = require(path.join(REPO, 'lib', 'core', 'marp-bundle.js'));
	const basenames = STATIC_ASSETS.map((a) => path.basename(a.from));
	assert.ok(
		basenames.includes('mermaid-v11.min.js'),
		`lib/core/marp-bundle.js STATIC_ASSETS must carry mermaid-v11.min.js (staged as export/<basename>) — the hosts request /export/mermaid-v11.min.js. Saw: ${basenames.join(', ')}`,
	);

	// And the hosts must ask for those exact paths. Any host that builds one of these
	// URLs is a place a rename has to reach.
	const hosts = [
		'docs/src/pages/index.astro',
		'docs/src/pages/studio.astro',
		'docs/src/pages/playground.astro',
		'docs/src/components/Specimen.astro',
		'docs/src/components/craft/CraftLab.astro',
	];
	for (const rel of hosts) {
		const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
		assert.ok(
			text.includes('export/mermaid-v11.min.js'),
			`${rel} must pass the vendored mermaid URL — with no CDN fallback, omitting it silently stops diagrams rendering`,
		);
		assert.ok(
			text.includes('katex/katex.min.css'),
			`${rel} must pass the vendored KaTeX URL — with no CDN fallback, omitting it silently ships math unstyled`,
		);
	}
});
