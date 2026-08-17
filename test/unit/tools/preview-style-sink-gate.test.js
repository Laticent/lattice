/**
 * `checkPreviewHtmlSinks` — the STYLESHEET arm (HARD RULE #22).
 *
 * WHY THIS FILE EXISTS, AND WHY IT WAS WRITTEN FIRST. The gate it tests grew a second
 * channel because the first one was provably incomplete: #22 and its gate were both
 * written about the slide-HTML sink, so a preview builder passed the gate while
 * concatenating unsanitized theme CSS two lines above the sanitized HTML — and a
 * `</style>` in that CSS ends the element and runs script regardless of the markup
 * sanitizer (measured, Chromium 131; see
 * engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §2).
 *
 * The standing rule in this repo is that a gate added or modified in
 * `tools/check-ownership.js` gets its test FIRST, because the theme-registration gate
 * broke five times and a human caught it every time. A gate with no test is a claim,
 * not an enforcement. So: every shape that must fire, every shape that must not,
 * asserted against the real gate over scratch files in the tree it actually walks.
 */
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkPreviewHtmlSinks, checkDocumentStyleSinks, SANCTIONED_PREVIEW_BUILDERS, SANCTIONED_STYLE_SINK_EXEMPT } = require('../../../tools/check-ownership.js');

// The gate walks `<root>/docs/src`, and `root` is injectable — so probes live in a
// TEMP tree, never in the real one. Writing them into `docs/src` (the first shape of this
// file) is a self-inflicted red build: `node --test` runs test files concurrently, so a
// probe present here is seen by check-ownership.test.js scanning the same tree, and a
// crash between write and cleanup leaves a file that fails `build:check`. It did exactly
// that once, as a 1-in-6589 flake during a push.
const REAL_ROOT = path.join(__dirname, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-style-gate-'));
fs.mkdirSync(path.join(TMP, 'docs', 'src'), { recursive: true });
const NAME = 'probe.js';
const PROBE_ABS = path.join(TMP, 'docs', 'src', NAME);
const PROBE_REL = path.join('docs', 'src', NAME);

afterEach(() => fs.rmSync(PROBE_ABS, { force: true }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/**
 * Run the real gate over the temp tree with `src` as the only file in it, sanctioned or
 * not, and return the errors naming the probe. `sanctions` is injected so a probe can be
 * treated as an allowlisted builder without editing the committed allowlist — the seam
 * that makes the "listed builder drops the call" arms testable at all.
 */
function gate(src, { sanctioned = true, why = 'probe' } = {}) {
  fs.writeFileSync(PROBE_ABS, src);
  const sanctions = sanctioned ? [{ file: PROBE_REL, why }] : [];
  const errors = [];
  checkPreviewHtmlSinks(errors, sanctions, TMP);
  return errors.filter((e) => e.includes(NAME));
}

const fires = (src, opts) => gate(src, opts).length > 0;

// A preview BUILDER is defined by the split runtime-`<script>` idiom; every probe
// carries it, because a file without it is not a builder and the gate must ignore it.
const MARKER = "s += '<scr' + 'ipt src=\"' + rt + '\"></scr' + 'ipt>';";
const SANITIZE_HTML = 'html = sanitizeSlideHtml(html);';
const SANITIZE_STYLE = "s += '<style>' + sanitizeStyleText(css) + '</style>';";
const RAW_STYLE = "s += '<style>' + css + '</style>';";
// The stylesheet arm keys on DOCUMENT ASSEMBLY, not on the runtime-<script> idiom — that
// is the whole point of it (the idiom missed share-export.ts, which assembles a downloaded
// document). So every probe that should be style-checked has to actually look like one.
const DOC = "s += '<!doctype html><html><head>';";

describe('the stylesheet arm fires when it must', () => {
  const bad = {
    'a sanctioned builder embeds a <style> with no sanitizeStyleText':
      `export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} ${RAW_STYLE} ${MARKER} return s; }`,
    'it sanitizes the HTML but not the stylesheet — the exact shape that passed before':
      `export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} ${RAW_STYLE} ${MARKER} return s; }`,
    'a <style> with attributes (the resident theme element carries an id)':
      `export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} s += '<style id="lattice-theme">' + css + '</style>'; ${MARKER} return s; }`,
    'uppercase <STYLE>':
      `export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} s += '<STYLE>' + css + '</STYLE>'; ${MARKER} return s; }`,
    'a template-literal assembly':
      `export function b(css, html, rt){ ${SANITIZE_HTML} return \`<!doctype html><style>\${css}</style>\` + '<scr' + 'ipt src="x"></scr' + 'ipt>'; }`,
  };
  for (const [label, src] of Object.entries(bad)) {
    test(`fires: ${label}`, () => {
      const errs = gate(src);
      assert.ok(errs.length > 0, `the gate did NOT report the stylesheet sink for: ${label}`);
      assert.ok(
        errs.some((e) => /sanitizeStyleText/.test(e)),
        `the error must name the fix; got: ${errs.join(' | ')}`,
      );
    });
  }

  test('the two channels are independent — dropping the HTML sanitize still fires its own arm', () => {
    const errs = gate(`export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_STYLE} ${MARKER} return s; }`);
    assert.ok(errs.some((e) => /sanitizeSlideHtml/.test(e)), 'the markup arm must still bite on its own');
    assert.ok(!errs.some((e) => /sanitizeStyleText/.test(e)), 'the stylesheet arm must be satisfied here');
  });

  test('a builder missing BOTH is reported for both channels', () => {
    const errs = gate(`export function b(css, html, rt){ let s=''; ${DOC} ${RAW_STYLE} ${MARKER} return s; }`);
    assert.ok(errs.some((e) => /sanitizeSlideHtml/.test(e)));
    assert.ok(errs.some((e) => /sanitizeStyleText/.test(e)));
  });
});

describe('the stylesheet arm stays quiet when it must', () => {
  const good = {
    'both channels sanitized':
      `export function b(css, html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} ${SANITIZE_STYLE} ${MARKER} return s; }`,
    'a builder with NO stylesheet channel owes nothing':
      `export function b(html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} s += '<link rel="stylesheet" href="x">'; ${MARKER} return s; }`,
    'the word "style" in prose or an inline style attribute is not a <style> element':
      `export function b(html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} /* the theme style is swapped in place */ s += '<div style="color:red">'; ${MARKER} return s; }`,
    'a </style> CLOSING tag alone (no opener) is not a sink':
      `export function b(html, rt){ let s=''; ${DOC} ${SANITIZE_HTML} s += '</style>'; ${MARKER} return s; }`,
  };
  for (const [label, src] of Object.entries(good)) {
    test(`quiet: ${label}`, () => {
      const errs = gate(src).filter((e) => /sanitizeStyleText/.test(e));
      assert.equal(errs.length, 0, `the gate wrongly reported: ${label} -> ${errs.join(' | ')}`);
    });
  }

  test('a NON-builder is ignored entirely, stylesheet channel and all', () => {
    // No runtime-<script> marker => not a preview frame => outside #22 by definition.
    assert.equal(fires("export const t = '<style>' + css + '</style>';", { sanctioned: false }), false);
  });

  test('an UNSANCTIONED builder is reported for being unlisted, not silently style-checked', () => {
    const errs = gate(`export function b(css, html, rt){ let s=''; ${DOC} ${RAW_STYLE} ${MARKER} return s; }`, { sanctioned: false });
    assert.ok(errs.some((e) => /SANCTIONED_PREVIEW_BUILDERS/.test(e)), 'an unlisted builder must fail the allowlist arm');
    // The other half of the name, which the first cut left unasserted: the PREVIEW-BUILDER
    // check must not also pile on "you dropped sanitizeSlideHtml" for a file it never
    // certified. This pins the `continue` that produces that — without it the gate falls
    // through and reports both, and nothing failed.
    assert.ok(!errs.some((e) => /no longer calls sanitizeSlideHtml/.test(e)),
      `an unlisted builder must not also be told it dropped a call: ${errs.join(' | ')}`);
    // The stylesheet arm is a SEPARATE check keyed on document assembly, so it legitimately
    // reports this probe too — being unlisted as a preview builder is not an exemption from
    // having to sanitize the CSS in a document you assemble.
    assert.ok(errs.some((e) => /sanitizeStyleText/.test(e)), 'the document style-sink arm applies regardless of the preview allowlist');
  });
});

describe('the document-assembler arm — the one the runtime-<script> marker missed', () => {
  // `share-export.ts` assembles a self-contained document with the same composed sheet in
  // the same `<style>` shape, has NO runtime-<script> marker, and its output is DOWNLOADED
  // and SHARED — and, before it is downloaded, mounted in a same-origin un-sandboxed frame
  // inside the docs site (player-prune-browser.ts). A red-team pass drove a `</style>` in
  // component CSS through it to a live cross-origin stylesheet fetch from the docs origin,
  // baked into the shipped file. Keying the stylesheet channel on document assembly rather
  // than on the preview idiom is what closes that.
  // These strings ARE probe source text: the `${…}` is what the gate must see interpolated
  // into a <style>, not an interpolation in this file.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: probe source text, not an interpolation
  const EXPORT_SHAPE = "export function d(p){ return `<!DOCTYPE html><html><head><style>${p.css}</style></head><body>${p.slides}</body></html>`; }";

  test('fires on a document assembler with NO runtime <script> at all', () => {
    const errs = gate(EXPORT_SHAPE, { sanctioned: false });
    assert.ok(errs.some((e) => /sanitizeStyleText/.test(e)), 'an export assembler must owe the stylesheet channel');
    assert.ok(!errs.some((e) => /SANCTIONED_PREVIEW_BUILDERS/.test(e)), 'it is not a preview builder and must not be reported as one');
  });

  test('quiet once it sanitizes', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: probe source text, not an interpolation
    const errs = gate(EXPORT_SHAPE.replace('${p.css}', '${sanitizeStyleText(p.css)}'), { sanctioned: false });
    assert.equal(errs.filter((e) => /sanitizeStyleText/.test(e)).length, 0);
  });

  test('a document with no <style> element owes nothing', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: probe source text, not an interpolation
    const errs = gate("export function d(p){ return `<!DOCTYPE html><html><head><link rel=stylesheet href=x></head><body>${p.slides}</body></html>`; }", { sanctioned: false });
    assert.equal(errs.length, 0);
  });

  test('a <style> that is NOT part of a whole document is out of scope', () => {
    // A fragment builder (a widget, a chart) is not assembling the document an attacker
    // would land in; widening to every `<style>` in docs/src selects 22 files, almost all
    // of them our own font and chart CSS, and an allowlist that long stops meaning anything.
    const errs = gate("export const t = '<style>' + css + '</style>';", { sanctioned: false });
    assert.equal(errs.length, 0);
  });

  test('a stale exemption is reported', () => {
    const errors = [];
    checkDocumentStyleSinks(errors, [{ file: 'docs/src/gone.js', why: 'no longer here' }], TMP);
    assert.ok(errors.some((e) => /stale style-sink exemption/.test(e)), 'the exemption list must not be allowed to rot');
  });
});

describe('the live tree', () => {
  test('passes the gate with both channels enforced', () => {
    const errors = [];
    checkPreviewHtmlSinks(errors);
    assert.deepEqual(errors, [], `HARD RULE #22 violations on the live tree:\n${errors.join('\n')}`);
  });

  test('every exemption names a file that really is still a document style sink', () => {
    for (const e of SANCTIONED_STYLE_SINK_EXEMPT) {
      const src = fs.readFileSync(path.join(REAL_ROOT, e.file), 'utf8');
      assert.match(src, /<!doctype html/i, `${e.file} no longer assembles a document`);
      assert.ok(e.why && e.why.length > 40, `${e.file} needs a real justification, not a placeholder`);
    }
  });

  test('every sanctioned builder that embeds a <style> actually calls sanitizeStyleText', () => {
    // Asserted independently of the gate, so a gate that silently stopped checking
    // would not also silence this.
    let withStyleSink = 0;
    for (const s of SANCTIONED_PREVIEW_BUILDERS) {
      const src = fs.readFileSync(path.join(REAL_ROOT, s.file), 'utf8');
      if (!/<style[\s>]/i.test(src)) continue;
      withStyleSink++;
      assert.match(src, /sanitizeStyleText\s*\(/, `${s.file} embeds a <style> and must sanitize it`);
    }
    assert.ok(withStyleSink >= 3, `expected all three builders to carry a stylesheet channel, found ${withStyleSink}`);
  });
});
