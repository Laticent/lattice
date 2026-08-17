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
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { checkPreviewHtmlSinks, SANCTIONED_PREVIEW_BUILDERS } = require('../../../tools/check-ownership.js');

// The gate walks `docs/src`, so a probe has to live inside it.
const ROOT = path.join(__dirname, '..', '..', '..');
const NAME = `__style-sink-probe-${process.pid}.js`;
const PROBE_ABS = path.join(ROOT, 'docs', 'src', NAME);
const PROBE_REL = path.join('docs', 'src', NAME);

afterEach(() => fs.rmSync(PROBE_ABS, { force: true }));

/**
 * Run the real gate with `src` as a probe file, sanctioned or not, and return only the
 * errors naming the probe. `sanctions` is injected so a probe can be treated as an
 * allowlisted builder without editing the committed allowlist — the seam that makes
 * the "listed builder drops the call" arms testable at all.
 */
function gate(src, { sanctioned = true, why = 'probe' } = {}) {
  fs.writeFileSync(PROBE_ABS, src);
  const sanctions = sanctioned
    ? [...SANCTIONED_PREVIEW_BUILDERS, { file: PROBE_REL, why }]
    : SANCTIONED_PREVIEW_BUILDERS;
  const errors = [];
  checkPreviewHtmlSinks(errors, sanctions);
  return errors.filter((e) => e.includes(NAME));
}

const fires = (src, opts) => gate(src, opts).length > 0;

// A preview BUILDER is defined by the split runtime-`<script>` idiom; every probe
// carries it, because a file without it is not a builder and the gate must ignore it.
const MARKER = "s += '<scr' + 'ipt src=\"' + rt + '\"></scr' + 'ipt>';";
const SANITIZE_HTML = 'html = sanitizeSlideHtml(html);';
const SANITIZE_STYLE = "s += '<style>' + sanitizeStyleText(css) + '</style>';";
const RAW_STYLE = "s += '<style>' + css + '</style>';";

describe('the stylesheet arm fires when it must', () => {
  const bad = {
    'a sanctioned builder embeds a <style> with no sanitizeStyleText':
      `export function b(css, html, rt){ let s=''; ${SANITIZE_HTML} ${RAW_STYLE} ${MARKER} return s; }`,
    'it sanitizes the HTML but not the stylesheet — the exact shape that passed before':
      `export function b(css, html, rt){ let s=''; ${SANITIZE_HTML} ${RAW_STYLE} ${MARKER} return s; }`,
    'a <style> with attributes (the resident theme element carries an id)':
      `export function b(css, html, rt){ let s=''; ${SANITIZE_HTML} s += '<style id="lattice-theme">' + css + '</style>'; ${MARKER} return s; }`,
    'uppercase <STYLE>':
      `export function b(css, html, rt){ let s=''; ${SANITIZE_HTML} s += '<STYLE>' + css + '</STYLE>'; ${MARKER} return s; }`,
    'a template-literal assembly':
      `export function b(css, html, rt){ ${SANITIZE_HTML} return \`<style>\${css}</style>\` + \`${''}\` + '<scr' + 'ipt src="x"></scr' + 'ipt>'; }`,
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
    const errs = gate(`export function b(css, html, rt){ let s=''; ${SANITIZE_STYLE} ${MARKER} return s; }`);
    assert.ok(errs.some((e) => /sanitizeSlideHtml/.test(e)), 'the markup arm must still bite on its own');
    assert.ok(!errs.some((e) => /sanitizeStyleText/.test(e)), 'the stylesheet arm must be satisfied here');
  });

  test('a builder missing BOTH is reported for both channels', () => {
    const errs = gate(`export function b(css, html, rt){ let s=''; ${RAW_STYLE} ${MARKER} return s; }`);
    assert.ok(errs.some((e) => /sanitizeSlideHtml/.test(e)));
    assert.ok(errs.some((e) => /sanitizeStyleText/.test(e)));
  });
});

describe('the stylesheet arm stays quiet when it must', () => {
  const good = {
    'both channels sanitized':
      `export function b(css, html, rt){ let s=''; ${SANITIZE_HTML} ${SANITIZE_STYLE} ${MARKER} return s; }`,
    'a builder with NO stylesheet channel owes nothing':
      `export function b(html, rt){ let s=''; ${SANITIZE_HTML} s += '<link rel="stylesheet" href="x">'; ${MARKER} return s; }`,
    'the word "style" in prose or an inline style attribute is not a <style> element':
      `export function b(html, rt){ let s=''; ${SANITIZE_HTML} /* the theme style is swapped in place */ s += '<div style="color:red">'; ${MARKER} return s; }`,
    'a </style> CLOSING tag alone (no opener) is not a sink':
      `export function b(html, rt){ let s=''; ${SANITIZE_HTML} s += '</style>'; ${MARKER} return s; }`,
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
    const errs = gate(`export function b(css, html, rt){ let s=''; ${RAW_STYLE} ${MARKER} return s; }`, { sanctioned: false });
    assert.ok(errs.some((e) => /SANCTIONED_PREVIEW_BUILDERS/.test(e)), 'an unlisted builder must fail the allowlist arm');
  });
});

describe('the live tree', () => {
  test('passes the gate with both channels enforced', () => {
    const errors = [];
    checkPreviewHtmlSinks(errors);
    assert.deepEqual(errors, [], `HARD RULE #22 violations on the live tree:\n${errors.join('\n')}`);
  });

  test('every sanctioned builder that embeds a <style> actually calls sanitizeStyleText', () => {
    // Asserted independently of the gate, so a gate that silently stopped checking
    // would not also silence this.
    let withStyleSink = 0;
    for (const s of SANCTIONED_PREVIEW_BUILDERS) {
      const src = fs.readFileSync(path.join(ROOT, s.file), 'utf8');
      if (!/<style[\s>]/i.test(src)) continue;
      withStyleSink++;
      assert.match(src, /sanitizeStyleText\s*\(/, `${s.file} embeds a <style> and must sanitize it`);
    }
    assert.ok(withStyleSink >= 3, `expected all three builders to carry a stylesheet channel, found ${withStyleSink}`);
  });
});
