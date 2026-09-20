const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

// The browser bundle the CLI export evaluates inside its own Chromium to project
// caption narration (lattice-emulator.js `projectDeckSpeechFromHtml`). The export path
// itself needs a live page, which this tier has no business launching — so the contract
// is pinned where it can be: the bundle is driven in a DOM and its output is compared
// against the Node-side kernel call it replaced.
//
// EVERY ARM ASSERTS THE ANSWER, never that a call "did not throw". The bake-off this
// change came out of produced four false PASSes doing exactly that — one of them scored
// a sanitizer that DESTROYED all markup as correct, because the probe only checked that
// the attack payload was gone (engineering/decisions/2026-09-20-dom-library-bakeoff.md
// § "What the independent checks found"). So the sanitize arm below asserts both
// directions, and the parity arm asserts the narration is non-empty before comparing.

const ROOT = path.resolve(__dirname, '..', '..', '..');

// A two-slide rendered document, in the shape the emulator's cleanDocHtml has: a full
// page whose `section[data-lattice-slide]` elements carry the `.cell-stage` /
// `.masthead-lede` skeleton the projection reads.
const DECK_HTML = `<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body><div id="deck">
<section data-lattice-slide class="title"><h1>Quarterly review</h1></section>
<section data-lattice-slide class="content form"><div class="cell-stage">
  <div class="masthead-lede"><p class="eyebrow">Signal</p><h2>Churn fell by a third</h2></div>
  <p>Three cohorts drove the move.</p>
</div></section>
</div></body></html>`;

/** The Node-side reference: exactly the kernel call the emulator used to make. */
async function referenceScript(docHtml) {
	const { createSlideSanitizer } = await import('../../../lib/core/sanitize-slide-html.mjs');
	const { projectDeckToScript } = await import('../../../lib/transformers/prose-projection.mjs');
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
	const doc = new JSDOM(docHtml).window.document;
	const raw = [...doc.querySelectorAll('section[data-lattice-slide]')];
	const clean = raw
		.map((s) => new JSDOM(sanitize(s.outerHTML)).window.document.querySelector('section[data-lattice-slide]'))
		.filter(Boolean);
	return projectDeckToScript(clean);
}

/** Run the shipped IIFE in a jsdom window and return its `projectDeckSpeech` binding. */
async function loadBundle() {
	const { SPEECH_PROJECTION_JS } = await import('../../../lib/export/speech-projection-bundle.generated.mjs');
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
	dom.window.eval(SPEECH_PROJECTION_JS);
	return dom.window.__latticeSpeechProjection;
}

test('the generated bundle is present and exposes the projection entry point', async () => {
	const api = await loadBundle();
	assert.equal(typeof api?.projectDeckSpeech, 'function', 'window.__latticeSpeechProjection.projectDeckSpeech');
});

test('bundle output equals the Node kernel call it replaced, entry for entry', async () => {
	const api = await loadBundle();
	const got = api.projectDeckSpeech(DECK_HTML);
	const want = await referenceScript(DECK_HTML);

	// Guard the comparison before making it: two empty arrays are equal, and an adapter
	// that silently parsed nothing would pass a bare deepEqual. This is the arm the
	// bake-off's basichtml adapter failed to carry.
	assert.equal(want.length, 2, 'the reference itself projected both slides');
	assert.ok(want.every((s) => s.text.trim().length > 0), 'the reference narration is non-empty');
	assert.match(want[1].text, /Churn fell by a third/);

	assert.equal(got.length, want.length);
	// The BUNDLE side is JSON-normalized and the reference side is NOT, on purpose:
	// normalizing BOTH sides would hide a field that does not survive the CDP boundary by
	// destroying it symmetrically, so the asymmetry is what gives the arm teeth.
	// WHAT IT DOES NOT MEAN, because the first version of this comment claimed it: CDP is
	// NOT the same transform as `JSON.stringify`. Measured on real Chromium — a `Date`
	// crosses as `{}` where JSON gives an ISO string, a function as `{}` where JSON drops
	// the key, and a symbol-keyed value makes CDP return `undefined` for the WHOLE value
	// while JSON returns the object. So this arm catches a field on the REFERENCE side that
	// JSON mangles; it does not catch one the bundle adds that JSON drops. Today's payload
	// is `{text: string, emphasis: {start,end,weight}[]}` — all JSON-safe — so none of the
	// three divergences is reachable, and the guard is against a future field, not a
	// present bug.
	assert.deepEqual(JSON.parse(JSON.stringify(got)), want);
});

test('the bundle sanitizes — the payload dies AND the real content survives', async () => {
	const api = await loadBundle();
	// `<svg><foreignObject>` is the payload, and choosing it took a measurement rather than
	// an intuition. A `<script>`, a `<style>`, an `onerror` handler, an `<iframe>` and a
	// `<form>` all LOOK like the obvious probe and every one of them is vacuous here: the
	// projection's own SKIP_SELECTOR drops script/style, and it reads text rather than
	// attributes — so the narration is identical whether the sanitizer ran or not, and this
	// arm passed with the sanitize call deleted from the bundle. `<foreignObject>` is the
	// shape DOMPurify removes WITH its contents, so it is the one that moves the output.
	const attacked = DECK_HTML.replace(
		'<p>Three cohorts drove the move.</p>',
		'<p>Three cohorts drove the move.</p><svg><foreignObject><p>EXFIL</p></foreignObject></svg>',
	);
	const got = api.projectDeckSpeech(attacked);
	const joined = got.map((s) => s.text).join(' ');
	assert.doesNotMatch(joined, /EXFIL/, 'foreignObject content is stripped before narration');
	// The other direction, which is the one a DESTRUCTIVE sanitizer passes without it — the
	// bake-off scored DOMPurify-on-domino as correct for exactly this omission.
	assert.equal(got.length, 2, 'both slides still project');
	assert.match(joined, /Quarterly review/);
	assert.match(joined, /Three cohorts drove the move/);
});

test('the emulator projects the deck BEFORE any branch closes the browser', () => {
	// POSITION, not presence — and that distinction was measured, not assumed. This arm used
	// to assert only that the call site existed, under the message "while the browser is
	// still open". A checker mutated the source by moving the call one line BELOW
	// `await closeBrowser()` — which makes `--captions` silently produce nothing — and the
	// arm stayed green. It also false-failed on a line rewrap and on renaming the `g`
	// parameter. So it now compares offsets, which is the claim, and matches loosely enough
	// that reformatting does not break it.
	const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
	const call = src.search(/captionScript\s*=\s*CAPTIONS[\s\S]{0,80}?projectDeckSpeechFromHtml\(/);
	assert.ok(call > 0, 'renderBody projects the deck into `captionScript`');

	// Every `closeBrowser()` inside renderBody must come AFTER the projection; the projection
	// is useless once any of them has run, and there are eight call sites to stay ahead of.
	const closes = [...src.matchAll(/await closeBrowser\(\)/g)].map((m) => m.index);
	assert.ok(closes.length >= 5, `found the closeBrowser call sites (${closes.length})`);
	const renderBodyStart = src.indexOf('async function renderBody(');
	const inBody = closes.filter((i) => i > renderBodyStart);
	assert.ok(inBody.length >= 5, 'closeBrowser call sites inside renderBody');
	assert.ok(
		call < Math.min(...inBody),
		'the projection runs before the FIRST branch that closes the browser',
	);

	// …and its result is what reaches the sidecar writer.
	assert.match(
		src,
		/writeCaptionsSidecar\([^)]*captionScript\s*\)/,
		'the projected script is handed to writeCaptionsSidecar',
	);
});

test('the caption path no longer constructs a jsdom window', () => {
	// SCOPED TO THE FUNCTION, not to the file, and the scoping was forced rather than chosen.
	// This arm read `assert.doesNotMatch(wholeFile, /new JSDOM\(/)` and was true when written.
	// Then #2246 landed `buildReadingArticleDocument` on main — the SAME three-window pattern
	// this change removes (a window for DOMPurify, one for the document, one per section),
	// for reader-mode article projection — and a file-wide assertion went red for a reason
	// that has nothing to do with the caption path. A test that fails when an unrelated
	// feature lands is a test that gets deleted, so it now asserts the claim it means.
	const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
	const start = src.indexOf('async function projectDeckSpeechFromHtml(');
	assert.ok(start > 0, 'projectDeckSpeechFromHtml is still in lattice-emulator.js');
	// The function ends at the next brace in column 0 — this file's top-level style.
	const end = src.indexOf('\n}\n', start);
	assert.ok(end > start, 'found the end of projectDeckSpeechFromHtml');
	const body = src
		.slice(start, end)
		.split('\n')
		.filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
		.join('\n');
	assert.doesNotMatch(body, /new JSDOM\(/, 'the caption projection builds no jsdom window');
	assert.doesNotMatch(body, /require\(['"]jsdom['"]\)/, "and does not require('jsdom')");
});
