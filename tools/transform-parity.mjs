#!/usr/bin/env node
/**
 * transform-parity — does the DOM implementation of each registry transformer
 * produce the same document as its hand-written string twin?
 *
 * WHY IT EXISTS. Fifteen of the seventeen registry transformers carry TWO
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
 * Usage:  node tools/transform-parity.mjs [--verbose] [--deck <path>]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const engine = require(path.join(ROOT, 'lib', 'engine'));
const { applyAllToHtml, applyAllToDom } = require(path.join(ROOT, 'lib', 'transformers', 'registry'));
const { withDom, domProvider } = require(path.join(ROOT, 'lib', 'core', 'dom-provider'));

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
  [/\s+/g, ' '], // insignificant whitespace runs
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

  const viaString = applyAllToHtml(raw, {});
  const viaDom = withDom(raw, (root) => applyAllToDom(root, {}));

  if (viaString === viaDom) { buckets.identical.push(rel); continue; }
  const na = normalize(viaString);
  const nb = normalize(viaDom);
  if (na === nb) { buckets.equivalent.push(rel); continue; }
  buckets.different.push([rel, firstDivergence(na, nb)]);
}

console.log(`transform-parity — string path vs DOM path, parser: ${domProvider()?.name ?? 'none'}\n`);
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
