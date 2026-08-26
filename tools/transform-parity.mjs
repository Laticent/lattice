#!/usr/bin/env node
/**
 * transform-parity — does the DOM implementation of each registry transformer
 * produce the same document as its hand-written string twin?
 *
 * WHY IT EXISTS. Sixteen of the eighteen registry transformers carry TWO
 * implementations: `applyToHtml` rewrites a string for the engine, `applyToDom`
 * walks live nodes for the runtime. They agree by care, not by construction, and
 * that is how the compare-code trailing-blockquote defect ended up in both. The
 * plan is to delete the string twins and route `applyToHtml` through the DOM
 * implementation via `lib/core/dom-provider`. This harness is the evidence that
 * doing so changes nothing — run BEFORE deleting anything, over the real corpus.
 *
 * WHAT IT ALREADY CAUGHT, and the reason it is a committed tool rather than a
 * throwaway: routing through linkedom (17x faster than jsdom, and the obvious pick
 * on speed alone) LOWERCASED every SVG element name — `<radialGradient>` →
 * `<radialgradient>`, `<foreignObject>` → `<foreignobject>`. SVG element names are
 * case-sensitive, so those are dead elements: every chart gradient and every
 * Mermaid node label would have stopped rendering, silently, with the whole suite
 * green. The perf number was real and pointed straight off a cliff.
 *
 * THE THREE-WAY CLASSIFICATION is the point of the output. A raw byte diff is
 * useless here because a parser legitimately re-serializes: `attr` becomes
 * `attr=""`, `&#x27;` becomes `'`, `<rect/>` becomes `<rect></rect>`. Those are the
 * same document. So each deck lands in one of:
 *
 *   identical    — byte for byte
 *   equivalent   — differs only in serialization form (the list below)
 *   DIFFERENT    — something else, which is a finding and needs reading
 *
 * The normalizations are deliberately ENUMERATED rather than clever. Every entry is
 * a specific, known-safe re-serialization; anything not on the list stays a finding.
 * Widening this list to make a number go down is the one way to make this tool lie.
 *
 * ⚠ NOT YET TRUSTWORTHY — READ THIS BEFORE BELIEVING A NUMBER.
 * The runtime does prerequisite work before it reaches the registry:
 *
 *     deckFrontMatterSource();      // deck-wide front matter
 *     applyFormDefaultToDom(...)    // stamps `data-lattice-slide` + the `form` class
 *     transformSlotLabels();
 *     applyAllToDom(document);      // <- only now
 *
 * and `lib/runtime/index.js` says why: "Must precede applyAllToDom (masthead-lift keys
 * on `section.form`)." This tool calls `applyAllToDom` BARE, so masthead-lift sees
 * sections with no `form` class and takes a different branch. Most of what it currently
 * reports as DIFFERENT is that missing setup, not a disagreement between the two
 * implementations. Replicate the pre-steps before treating the count as a finding.
 * See engineering/decisions/2026-08-26-transform-twin-divergences.md.
 *
 * Usage:  node tools/transform-parity.mjs [--verbose] [--deck <path>]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ORDER IS LOAD-BEARING, and getting it wrong invalidates every number below.
// `lib/engine` runs `applyAllToHtml` itself (index.js:381) and DESTRUCTURES it at
// require time. So the registry is loaded first and its export stubbed to identity
// BEFORE the engine is required — otherwise `engine.render()` returns HTML that has
// already been through the transformers, both paths are handed transformed input,
// and the comparison silently becomes an idempotence test instead of a parity test.
// A first cut of this tool did exactly that and reported six "live defects" that
// were nothing of the kind.
const registry = require(path.join(ROOT, 'lib', 'transformers', 'registry'));
const applyAllToHtml = registry.applyAllToHtml;
const { applyAllToDom } = registry;
registry.applyAllToHtml = (html) => html; // the engine now emits PRE-transform HTML
const engine = require(path.join(ROOT, 'lib', 'engine'));
const { withDom, domProvider } = require(path.join(ROOT, 'lib', 'core', 'dom-provider'));

// A cheap self-check on the stub: if the engine's output already carries a
// transformer's marker, the stub did not take and every result is meaningless.
function assertPreTransform(html, rel) {
  for (const marker of ['cell-masthead', 'code-cols', 'panel-left', 'below-note']) {
    if (html.includes(marker)) {
      console.error(`transform-parity: ABORT — engine output for ${rel} already contains "${marker}".`);
      console.error('The pre-transform stub did not take; every comparison would be an idempotence test.');
      process.exit(2);
    }
  }
}

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const only = argv.includes('--deck') ? argv[argv.indexOf('--deck') + 1] : null;

/** Known-safe re-serializations. Each is a parser formatting choice, not a change. */
const EQUIVALENCES = [
  [/&quot;/g, '"'], // entity forms of characters that need no escaping in text
  [/&#x27;/gi, "'"],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&#x2F;/gi, '/'],
  [/([a-zA-Z-]+)=""/g, '$1'], // boolean attribute canonical form
  [/<([a-zA-Z][\w-]*)([^>]*?)\s*\/>/g, '<$1$2></$1>'], // self-closing → explicit pair
  [/\s+>/g, '>'],
  [/\s+/g, ' '], // whitespace runs
  // Inter-tag whitespace. FLAGGED, because unlike the entries above this one is
  // not unconditionally safe: between inline elements a space is rendered text,
  // so collapsing it could mask a real difference. It is included because the
  // parser reinstates a newline the string path consumed between BLOCK elements
  // and that accounts for most of the corpus, but a divergence that only shows up
  // once this is applied deserves a look before it is called equivalent.
  [/>\s+</g, '><'],
];
const normalize = (s) => EQUIVALENCES.reduce((acc, [re, to]) => acc.replace(re, to), s);

function galleryDecks() {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(p)) walk(p); }
      else if (/\.(gallery|exemplar)\.md$/.test(e.name)) out.push(p);
    }
  })(path.join(ROOT, 'lib'));
  const baseline = path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md');
  try { readFileSync(baseline); out.push(baseline); } catch { /* optional */ }
  return out.sort();
}

/** First point of divergence, with context — enough to read, not a full dump. */
function firstDivergence(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const win = (s) => s.slice(Math.max(0, i - 80), i + 160).replace(/\n/g, '⏎');
  return { at: i, a: win(a), b: win(b) };
}

engine.addThemes([{ name: 'indaco', css: readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8') }]);

const decks = only ? [path.resolve(only)] : galleryDecks();
const buckets = { identical: [], equivalent: [], different: [], skipped: [] };

for (const file of decks) {
  const rel = path.relative(ROOT, file);
  let raw;
  try { raw = engine.render(readFileSync(file, 'utf8'), 'indaco').html; }
  catch (e) { buckets.skipped.push([rel, e.message.slice(0, 60)]); continue; }
  assertPreTransform(raw, rel);

  const viaString = applyAllToHtml(raw, {});
  const viaDom = withDom(raw, (root) => applyAllToDom(root, {}));

  if (viaString === viaDom) { buckets.identical.push(rel); continue; }
  const na = normalize(viaString);
  const nb = normalize(viaDom);
  if (na === nb) { buckets.equivalent.push(rel); continue; }
  buckets.different.push([rel, firstDivergence(na, nb)]);
}

console.log(`transform-parity — string path vs DOM path, parser: ${domProvider()?.name ?? 'none'}`);
console.log('⚠  applyAllToDom runs BARE here — without the runtime\'s form-class/front-matter');
console.log('   pre-steps — so most "DIFFERENT" rows are that gap, not a real disagreement.');
console.log('   See engineering/decisions/2026-08-26-transform-twin-divergences.md.\n');
console.log(`  byte-identical            ${String(buckets.identical.length).padStart(4)}`);
console.log(`  equivalent (re-serialized)${String(buckets.equivalent.length).padStart(4)}`);
console.log(`  DIFFERENT                 ${String(buckets.different.length).padStart(4)}`);
if (buckets.skipped.length) console.log(`  skipped (render failed)   ${String(buckets.skipped.length).padStart(4)}`);

for (const [rel, d] of buckets.different) {
  console.log(`\n  ✗ ${rel}   diverges at ~${d.at}`);
  if (verbose) {
    console.log(`      string: …${d.a}`);
    console.log(`      dom   : …${d.b}`);
  }
}
if (buckets.different.length && !verbose) console.log('\n  (--verbose to see each divergence)');
console.log('');

// Report-only by design: this is a migration instrument, not a merge gate. It
// becomes a gate the day the string twins are deleted and `different` must be 0.
process.exitCode = 0;
