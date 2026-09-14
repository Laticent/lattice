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
// plus the obvious neighbors, so a copy-paste from a README trips it.
const BARRED_HOSTS = [
	'cdn.jsdelivr.net',
	'unpkg.com',
	'cdnjs.cloudflare.com',
	'code.jquery.com',
	'esm.sh',
	'esm.run',
	'fonts.googleapis.com',
	'fonts.gstatic.com',
];

// ─── The esm.run carve-out ─────────────────────────────────────────────────
//
// `esm.run` is not a neighboring CDN this list adds for completeness. It is
// `cdn.jsdelivr.net` — the FIRST host on the bar list — under another name.
// Measured 2026-09-13:
//
//     $ curl -sSI https://esm.run/kokoro-js
//     HTTP/2 301
//     location: https://cdn.jsdelivr.net/npm/kokoro-js/+esm
//
// So the 2026-09-03 sweep barred jsdelivr by one hostname while three runtime
// imports kept reaching the same origin through its alias. That is a GAP the
// sweep missed, not a carve-out it granted — nothing in
// `2026-09-03-self-hosted-runtime-deps.md` names the AI tier at all. It is
// listed here so the gate can see it.
//
// WHY THE THREE BELOW ARE STILL ADMITTED. They are the Studio's opt-in
// on-device AI tier, and loading them from a CDN is a decision with a record:
// `2026-06-08-drawing-board-phase-2-build.md` § "no new npm deps" chose lazy
// CDN import over bundling, and left the escape hatch ("swap the CDN URL
// constants … and add the deps then"). Taking that hatch is a bigger change
// than listing the host, and it cannot be verified from this sandbox — WebGPU
// and WASM inference need a real device (HARD RULE #23), which is the same
// reason the 2026-06-08 note gave for not bundling them. Self-hosting the
// three LIBRARIES would also leave the hundreds of megabytes of model WEIGHTS
// (Qwen2.5-0.5B, Kokoro-82M, bge-small) on HuggingFace's CDN regardless, so it
// buys less than it looks like it buys.
//
// WHAT IS ACCEPTED, SAID PLAINLY, so nobody has to re-derive it: ALL THREE can
// execute in the TOP-LEVEL document that holds the user's OpenRouter key in
// `localStorage`, and all three are UNPINNED (`esm.run/<pkg>` with no version
// resolves to whatever jsdelivr serves that day) and carry no `integrity` —
// the same shape as the `mermaid@11` default that 2026-09-03 deleted. The
// difference is consent and reach, not kind: these load only after a user
// opts into the AI tier, where mermaid ran on the landing page for everyone.
// That is a real residual risk, written down rather than closed. The follow-up
// is in `2026-09-13-esm-run-ai-tier-carve-out.md`.
//
// THE SANCTION IS PER URL, NOT PER FILE, and deliberately: a file-scoped
// exemption would let a FOURTH package appear inside an already-exempt file
// and ship green. Adding one here is a review conversation with its
// justification, exactly like every `SANCTIONED_*` list in
// `tools/check-ownership.js`.
const SANCTIONED_CDN_IMPORTS = new Map([
	[
		'esm.run/@mlc-ai/web-llm',
		'WebLLM — the opt-in local generation rung of the Studio AI ladder ' +
			'(architect-model.js). Main thread, so it shares the origin holding the ' +
			'OpenRouter key.',
	],
	[
		'esm.run/@huggingface/transformers',
		'Transformers.js — bge-small embeddings for the Studio AI ladder ' +
			'(architect-model.js). Main thread, same origin caveat as WebLLM.',
	],
	[
		'esm.run/kokoro-js',
		'Kokoro — the on-device read-aloud voice (voice-model.js). PREFERS a ' +
			'same-origin module worker (kokoro-worker.js), which cannot read ' +
			'localStorage; the worker origin is load-bearing because iOS Safari ' +
			'refuses a cross-origin import from the opaque origin of a blob: worker. ' +
			'But `loadMain()` (voice-model.js:555) imports it on the MAIN THREAD when ' +
			'the Worker cannot be constructed or its load fails on a non-coarse ' +
			'pointer, so this rung reaches the key-bearing document too. It is on the ' +
			'main thread that mobile is spared, not the key.',
	],
]);

// Every `esm.run/<specifier>` (or any other barred host followed by a path) written
// in docs/src, whatever quoting or scheme carries it.
//
// PLAIN STRING SCANNING, NOT A BUILT REGEX, and CodeQL is why. The first cut built
// `new RegExp(host.replace(/\./g, '\\.') + …)` and drew SIX high-severity alerts on
// this one file: five `js/incomplete-hostname-regexp` on the BARRED_HOSTS literals
// flowing into a RegExp, and one `js/incomplete-sanitization` on the escape itself —
// which escapes `.` and not `\`, the exact partial-escape defect CodeQL already
// caught in this repo once (#2176, `2026-09-13-plugin-architecture.md`). A host
// carries no backslash today, so nothing was exploitable; a partial escape is still
// wrong the moment the input widens, and the alert was right to say so.
//
// Interpolating a hostname into a regex at all is the thing worth deleting, not the
// escaping bug on top of it. Scanning for `host + '/'` and reading forward to a
// delimiter needs no escaping, cannot be defeated by a metacharacter in a host, and
// says what it means. The delimiter set is the old character class verbatim —
// whitespace, quote, double-quote, backtick, close-paren.
const isDelimiter = (ch) => /\s/.test(ch) || ch === "'" || ch === '"' || ch === '`' || ch === ')';

function cdnImportsOn(line, host) {
	const found = [];
	const needle = `${host}/`;
	for (let from = 0; ; ) {
		const at = line.indexOf(needle, from);
		if (at === -1) return found;
		let end = at + needle.length;
		while (end < line.length && !isDelimiter(line[end])) end++;
		// The old pattern required at least one character after the slash, so a bare
		// `host/` is not a URL — it is prose about the host.
		if (end > at + needle.length) found.push(line.slice(at, end));
		from = at + 1;
	}
}

// The hosts that carry at least one sanctioned URL. Derived, never written twice.
const sanctionedHosts = new Set([...SANCTIONED_CDN_IMPORTS.keys()].map((u) => u.split('/')[0]));

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
				if (!line.includes(host)) continue;
				// A sanctioned URL is admitted; anything else on the line — including a
				// FIFTH package inside a file that already carries a sanctioned one — is
				// a hit. A bare hostname with no path is prose (a comment explaining the
				// carve-out), and cannot load anything by itself.
				const urls = cdnImportsOn(line, host);
				const unsanctioned = urls.filter((u) => !SANCTIONED_CDN_IMPORTS.has(u));
				if (unsanctioned.length > 0) {
					hits.push(`${rel}:${i + 1} → ${unsanctioned.join(', ')}`);
				} else if (urls.length === 0 && !sanctionedHosts.has(host)) {
					// A bare hostname with no path. For a host with nothing sanctioned it is
					// still a hit — that is the original, strict reading, and it is what
					// catches a URL assembled from pieces. For a host that legitimately
					// appears in the tree, prose about it is unavoidable (the comments
					// explaining this carve-out are exactly that) and loads nothing.
					hits.push(`${rel}:${i + 1} → ${host}`);
				}
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

test('every sanctioned CDN import is still loaded by docs/src', () => {
	// A sanction outlives its call site silently: the load moves to a bundled import,
	// the entry stays, and the next reader takes the carve-out for a live one. Every
	// neighboring `SANCTIONED_*` list in tools/check-ownership.js fails on a stale
	// entry for the same reason, so this one does too — and it is the arm that turns
	// the allowlist back into a bar the day the AI tier is self-hosted.
	const text = walk(DOCS_SRC)
		.filter((f) => path.relative(REPO, f) !== SELF)
		.map((f) => fs.readFileSync(f, 'utf8'))
		.join('\n');

	const stale = [...SANCTIONED_CDN_IMPORTS.keys()].filter((url) => !text.includes(url));
	assert.deepStrictEqual(
		stale,
		[],
		`SANCTIONED_CDN_IMPORTS lists a URL that docs/src no longer loads. Delete the ` +
			`entry — a carve-out nobody exercises reads as permission next time. Stale:\n  ${stale.join('\n  ')}`,
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

	// dagre is staged by literal destination path, like KaTeX — it is NOT under
	// `export/`, because it is fetched by the preview frame rather than copied into an
	// exported bundle (it is BOTH, in fact: `STATIC_ASSETS` carries it too, for the
	// exported deck the recipient opens from `file://`).
	assert.match(
		staging,
		/'lattice-dagre\.js'/,
		"sync-playground-assets.mjs must stage 'lattice-dagre.js' — the hosts request exactly that path, and with the engine no longer inlined in the runtime bundle nothing else supplies it",
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
	// The FORWARDING hop, not an originating host — and it is on this list because
	// omitting it is exactly how the dagre URL was lost once already.
	// `createCaptureFrame` destructures the `DeckRender` it is handed by NAME, so a
	// field missing from that list is dropped silently and `buildSrcdoc` emits no
	// tag. Every Studio export goes through it, so a branching state chart previewed
	// as a fan-out and exported as a numbered column. The five hosts above all
	// passed; nothing looked at the hop in between.
	//
	// ASSERTED ON THE DESTRUCTURE LIST, not on the file text. The first cut of this
	// arm was `text.includes('dagreUrl')`, and it stayed green when the name was
	// removed from the signature — the file still mentions it in a comment and in
	// the spread two lines below. A guard that cannot fail is the thing this file
	// keeps being written to prevent.
	const CAPTURE = 'docs/src/components/studio/export/deck-export.js';
	const captureSrc = fs.readFileSync(path.join(REPO, CAPTURE), 'utf8');
	const params = (captureSrc.match(/async function createCaptureFrame\(\{([^}]*)\}/) || [])[1];
	assert.ok(params, `${CAPTURE} no longer declares createCaptureFrame({ … }) — this arm cannot see what it forwards`);
	for (const url of ['runtimeUrl', 'mermaidUrl', 'dagreUrl']) {
		assert.ok(
			new RegExp(`\\b${url}\\b`).test(params),
			`createCaptureFrame must destructure ${url} — it takes the whole DeckRender and names its fields, so one left out is dropped SILENTLY: buildSrcdoc defaults the URL to '' and emits no tag, and every Studio export (.pdf, .pptx, .png, the shared player) ships a render missing that asset. Saw: { ${params.trim()} }`,
		);
	}
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
		// The engine's failure is the quietest of the three, which is why it is worth an
		// arm of its own: a missing Mermaid URL leaves a blank diagram and a missing
		// KaTeX URL leaves unstyled math, but a missing dagre URL leaves a state chart
		// that DRAWS — as the numbered column. A host that stops passing this ships a
		// plausible-looking wrong layout.
		assert.ok(
			text.includes('lattice-dagre.js'),
			`${rel} must pass the vendored dagre URL — omitting it silently returns every BRANCHING state chart to the numbered column`,
		);
	}
});
