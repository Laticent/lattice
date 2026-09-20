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
	// The BUNDLE side is JSON-normalized and the reference side is NOT, on purpose. The
	// shipped path returns this value across CDP, which applies that same transform — so
	// normalizing BOTH sides would hide a field that does not survive the boundary by
	// destroying it symmetrically. Normalizing one side makes the arm fail on exactly that.
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

test('the emulator still CALLS the projection, with a browser and the watchdog', () => {
	// Arms 1-3 drive the bundle in isolation and the arm below asserts an ABSENCE, so
	// deleting the call site would leave all four green while `--captions` silently
	// narrated nothing. This pins the call itself. The behavioral guard is one tier up —
	// test/integration/export/html-player.test.js drives the real emulator with
	// `--captions` and asserts narrated text in a real `.vtt` — and this arm exists so a
	// reader does not mistake THIS file for that guard.
	const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
	assert.match(
		src,
		/const captionScript = CAPTIONS \? await projectDeckSpeechFromHtml\(cleanDocHtml, browser, g\) : \[\];/,
		'renderBody projects the deck while the browser is still open',
	);
	assert.match(
		src,
		/writeCaptionsSidecar\(outFile, pageNotesForCaptions\.length, slideCaptions, captionScript\)/,
		'and hands the projected script to the sidecar writer',
	);
});

test('the caption path no longer constructs a jsdom window', () => {
	const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
	const code = src
		.split('\n')
		.filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
		.join('\n');
	assert.doesNotMatch(code, /new JSDOM\(/, 'lattice-emulator.js builds no jsdom window');
	assert.doesNotMatch(code, /require\(['"]jsdom['"]\)/, "lattice-emulator.js does not require('jsdom')");
});
