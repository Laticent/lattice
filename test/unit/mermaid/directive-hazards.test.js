/**
 * The two directive hazards that outlived the code that defended against them (#1674).
 *
 * The engine used to serialize its config into a `%%{init}%%` directive, and
 * `lib/integrations/mermaid/init-directive.js` carried real machinery for two traps in
 * Mermaid's directive parser. That machinery is gone — the engine's config goes to
 * `mermaid.initialize` now, which runs the far more permissive `sanitize`.
 *
 * The TRAPS ARE NOT GONE. They still govern every directive an AUTHOR writes, in every
 * deck, on both render paths. Deleting the defense and keeping the knowledge as a
 * paragraph would leave a claim about a dependency's behavior with nothing re-checking
 * it, so a Mermaid upgrade that changed either would turn a comment into a lie silently.
 *
 * These are CHARACTERIZATION tests: they assert what the installed Mermaid does, not
 * what we want it to do. A failure here is not a bug in Lattice — it means Mermaid
 * changed and `engineering/mermaid.md` §5.3 needs rewriting.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');

/** Mermaid's `sanitizeDirective` allow-list for directive-borne themeVariables values. */
function installedAllowList() {
  const dir = path.join(REPO, 'node_modules', 'mermaid', 'dist', 'chunks', 'mermaid.core');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // The allow-list's own character class contains parentheses, so this matches the
    // literal `/^[...]+$/` form rather than "up to the next `)`".
    const m = /val\.match\((\/[^\n]{5,60}?\/)\)/.exec(src);
    if (m) return m[1];
  }
  return null;
}

describe('mermaid directive hazards (characterization — the installed Mermaid)', () => {
  test('the themeVariables allow-list still bars the hyphen', () => {
    // Why it matters to an AUTHOR: `%%{init: {"themeVariables": {"fontFamily": "Outfit,
    // system-ui, sans-serif"}}}%%` does not set that stack — mermaid replaces the value
    // with `""`, and a blank font makes it MEASURE labels in one face while the page
    // PAINTS them in another, clipping mid-word. This is the constraint that forced the
    // export onto a monospace stack for years.
    const src = installedAllowList();
    assert.ok(src, "could not read sanitizeDirective's allow-list from the installed mermaid");
    // Test the BEHAVIOR, not the text. `-` appears in the source as a range separator
    // inside `A-Za-z`, so grepping for the character says nothing — the question is
    // whether a hyphenated VALUE passes, and only building the expression answers it.
    const body = src.slice(1, src.lastIndexOf('/'));
    const allow = new RegExp(body);
    assert.equal(allow.test('Outfit, system-ui, sans-serif'), false,
      `Mermaid's themeVariables allow-list (${src}) now admits the hyphen. A real font stack `
      + 'can ride a directive again — engineering/mermaid.md §5.3 says it cannot, and the note '
      + 'in lib/integrations/mermaid/init-directive.js explaining the retired constants is stale.');
    // …and it is not simply rejecting everything: the values the engine used to emit pass.
    assert.equal(allow.test('#1F4A6E'), true);
    assert.equal(allow.test('"JetBrains Mono", monospace'), true);
    // The docs quote the pattern verbatim, so pin the text too — but as its own claim,
    // after the behavioral one, so a cosmetic change to the bundle cannot masquerade as a
    // semantic one.
    assert.equal(src, '/^[\\d "#%(),.;A-Za-z]+$/',
      'the allow-list source changed — engineering/mermaid.md §5.3 quotes it verbatim');
  });

  test('ONE apostrophe in a directive payload discards the WHOLE directive', () => {
    // The nastier of the two, and the one with no visible symptom. Mermaid runs a blanket
    // `'` → `"` swap over the payload before `JSON.parse`, so a value like
    // `"the client's blue"` makes the payload invalid JSON — and the catch drops every
    // directive in the diagram, palette included. Measured on 11.14: an apostrophe in
    // `primaryColor` alone takes an engine-palette diagram to stock #ECECFF/#333333.
    //
    // Asserted on the PARSER rather than on a render, so it costs no browser: the swap is
    // what makes the payload unparseable, and that is the whole mechanism.
    const payload = `{"themeVariables":{"primaryColor":"the client's blue"}}`;
    const swapped = payload.replace(/'/g, '"');
    assert.throws(() => JSON.parse(swapped),
      'the apostrophe no longer breaks the payload — re-check whether mermaid still swaps '
      + 'quotes before JSON.parse, and update engineering/mermaid.md §5.3 if it does not');
    // The same value with no apostrophe parses, so this is the apostrophe and not the shape.
    assert.doesNotThrow(() => JSON.parse(payload.replace("client's", 'client')
      .replace(/'/g, '"')));
  });

  test('mermaid still does the quote swap this depends on', () => {
    // The assertion above is only meaningful while mermaid actually performs the swap.
    // Pin that against the real bundle rather than inferring it.
    const dir = path.join(REPO, 'node_modules', 'mermaid', 'dist', 'chunks', 'mermaid.core');
    // `detectInit` → `detectDirective` (chunk-5PVQY5BW): the payload is trimmed, comments
    // stripped, then EVERY apostrophe becomes a double quote before `JSON.parse`.
    const found = fs.readdirSync(dir)
      .filter((n) => n.endsWith('.mjs'))
      .some((f) => /replace\(\/'\/gm?,\s*'"'\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    assert.ok(found,
      "mermaid no longer swaps ' for \" before parsing a directive payload — the apostrophe "
      + 'hazard documented in engineering/mermaid.md §5.3 may be gone. Re-measure before trusting it.');
  });
});
