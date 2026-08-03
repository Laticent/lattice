#!/usr/bin/env node
/**
 * check-css-values — does the browser actually ACCEPT every value we ship?
 *
 * THE BUG THIS EXISTS TO CATCH, in one sentence: a CSS value outside its
 * property's grammar makes the declaration invalid at parse time, so the browser
 * DROPS it — and nothing in this repo notices.
 *
 * It is invisible to every gate we have, by construction:
 *   · it is valid *syntax*, so `checkCssSyntax` (esbuild) parses it clean;
 *   · esbuild builds the bundle and passes the value straight through;
 *   · a dropped declaration usually changes no pixels — an override that was
 *     never going to move anything, a shadow nobody had seen — so the regression
 *     gate stays green and the goldens were blessed with it already missing.
 * The result reads as working CSS with a comment above it describing behavior
 * that does not happen. Two real instances shipped before this existed:
 * `text-wrap: normal` (#1309 — `normal` is in neither half of the shorthand's
 * grammar) and `box-shadow: light-dark(<shadow>, <shadow>)` (light-dark()
 * resolves a `<color>` and nothing else, so the whole declaration went).
 *
 * THE ORACLE is the rendering engine itself — `CSS.supports(prop, value)` in the
 * same Chromium the PDF/HTML paths render through. Not a value database: an
 * external grammar table answers what the *spec* says, and what ships is decided
 * by what Chromium accepts. Where the two disagree, Chromium wins here.
 *
 * WHY THIS IS NOT IN `build:check`. That gate is contractually render-free — the
 * CI job that runs it sets `PUPPETEER_SKIP_DOWNLOAD: '1'` and has no browser
 * (.github/workflows/ci.yml, "Artifact freshness gate (build --check, no
 * render)"). Needing Chromium would break that guarantee for every PR. So this
 * follows the repo's established on-demand precedent — `overflow:check`,
 * `geometry:check`, `check-render-nature` — accurate, browser-backed, run when
 * CSS changes rather than on every commit.
 *
 * WHAT IT CANNOT JUDGE, and why each exclusion is a real limit rather than a
 * convenience:
 *   · custom properties (`--x: …`) — the grammar IS "any token stream" (CSS
 *     Variables §2), so every value is valid and `CSS.supports` always says yes.
 *
 * VALUES CARRYING `var()` get a WEAKER, second-class pass rather than a skip. They
 * cannot be judged directly — substitution happens at computed-value time, so the
 * declaration parses whatever the token turns out to hold — and the first cut of
 * this tool skipped them outright. That skip cost it the bug it was written during:
 * `box-shadow: light-dark(0 0.1cqi 0.3cqi var(--col-hue), none)` on the tinted
 * kanban card, which the gate certified while fixing the identical mistake one rule
 * above. So var() values are now substituted with a battery of typed probes (a
 * colour, a length, a number, a percentage, `none`, a time, `auto`, a string, an
 * ident) and reported only when EVERY probe is rejected — i.e. no token of any type
 * could make the declaration parse, so it is dead for structural reasons. That
 * cannot see a value whose token merely happens to be the wrong type today, and it
 * does not claim to. What it does see is the nastier half: this class fails at
 * computed-value time, so the declaration WINS the cascade and then resolves to the
 * property's INITIAL value — it does not fall back to the rule it overrode.
 *
 * USAGE
 *   node tools/check-css-values.js           # gate: exit 1 on any unsanctioned drop
 *   node tools/check-css-values.js --json    # machine-readable
 *   node tools/check-css-values.js --all     # also list what was sanctioned
 *
 * Needs CHROME_PATH (the SessionStart hook exports it).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['lib', 'themes'].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d));

/**
 * Declarations Chromium legitimately drops, kept on purpose.
 *
 * Every entry is a value Chromium does NOT implement but that we ship anyway.
 * Three shapes are legitimate, and a fourth is admitted only under protest:
 *
 *   1. CROSS-ENGINE PAIR — the standard property written beside its vendor twin
 *      (or vice versa) so each engine takes the one it knows. Chromium drops the
 *      half addressed to someone else; that is the pattern working, not failing.
 *      Today: `print-color-adjust`, `-moz-osx-font-smoothing`, `line-clamp`.
 *   2. LEGACY ENGINE — a vendor property modern Chromium has RETIRED, kept for the
 *      older WebKit the exported HTML can land on. There is no twin to pair with;
 *      the standard mechanism simply arrived later. Today: `-webkit-overflow-scrolling`.
 *   3. FORWARD INTENT — a property no engine implements yet, kept because the
 *      intent is worth recording in the cascade. Today: none.
 *   4. KNOWN DEFECT — the value is plain wrong and the fix is real work, so the
 *      entry holds the gate green while it is scheduled. It must name an issue.
 *      This is a debt marker, not a pattern; do not reach for it. Today: `speak`.
 *
 * A `why` is mandatory. So are `files` and `sites` — the stylesheets the sanction
 * covers, and how many occurrences it covers across them. A sanction is a claim
 * about a SPECIFIC pairing ("the vendor twin is on the line above"), so it must not
 * absorb a site nobody checked. Two earlier versions did: the first matched on
 * `prop|value` alone across every file at once, and the second scoped to `files` but
 * not to a count, so a SECOND unpaired `line-clamp: 2` written into
 * kanban.styles.css still collapsed into the existing entry, exit 0, justification
 * now true of one site out of two. `sites` closes that: any new occurrence, in a new
 * file or an already-named one, is a NEW offence that has to be looked at. Line
 * numbers are deliberately not pinned — they churn on every edit above.
 *
 * The gate fails on a STALE entry too (one whose declaration is gone), so the list
 * cannot rot into a pile of unexplained exceptions.
 */
const SANCTIONED = [
  {
    prop: 'print-color-adjust', value: 'exact', files: ['lib/base/base.elements.css'], sites: 1,
    why: 'Standard half of a cross-engine pair — `-webkit-print-color-adjust:exact` sits beside it on the same line (base.elements.css). Chromium takes the prefixed one; the standard name is there for engines that ship it.',
  },
  {
    prop: '-moz-osx-font-smoothing', value: 'grayscale', files: ['lib/base/base.elements.css'], sites: 1,
    why: 'Firefox/macOS-only twin of `-webkit-font-smoothing:antialiased`, which is on the same line. Chromium has no equivalent and drops it by design.',
  },
  {
    prop: '-webkit-overflow-scrolling', value: 'touch', files: ['lib/base/base.fluid-view.css'], sites: 1,
    why: 'Legacy iOS Safari momentum scrolling for the fluid viewer. Inert in modern Chromium; still read by the old WebKit versions the exported HTML can land on.',
  },
  {
    prop: 'line-clamp', value: '2', files: ['lib/components/chart/kanban/kanban.styles.css'], sites: 1,
    why: 'Standard half of a cross-engine pair — `-webkit-line-clamp:2` is on the line above (kanban card title). Chromium clamps via the prefixed property; the standard one is there for when it lands.',
  },
  {
    prop: 'speak', value: 'never', files: ['lib/base/base.print-textures.css', 'themes/a11y-base.css'], sites: 2,
    why: 'KNOWN DEFECT (shape 4) — sanctioned to keep the gate green while it is fixed properly, NOT a deliberate pattern. Chromium DOES implement `speak`, with the CSS 2.1 aural vocabulary (`normal | none | spell-out`, plus `digits` / `literal-punctuation`); `never` is the CSS Speech Level 1 spelling and is outside that grammar, so it is dropped exactly like any other bad value. An earlier version of this entry claimed "no engine implements speak", which the tool\'s own oracle refutes (`CSS.supports("speak","none")` is true, `"never"` is false). The intent — do not announce the decorative ✓/✗/◆ that `::before` injects — is real but unserved either way: `speak` has no effect on the accessibility tree in any current engine, so even the spelling Chromium parses would do nothing. The fix is to stop injecting announced content (an `aria-hidden` wrapper or a background image), which is an accessibility redesign, not a value swap. Sites: lib/base/base.print-textures.css, themes/a11y-base.css. Issue #1320.',
  },
];

function listCss(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listCss(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/**
 * Blank comments out rather than deleting them, so reported line numbers stay true.
 *
 * STRING-AWARE, and that is load-bearing rather than fastidious. The obvious
 * `replace(/\/\*[\s\S]*?\*\//g, …)` is not: a `/*` inside a quoted value — say
 * `content: "/*"` — reads as a comment OPEN, and everything up to the next `*​/`
 * anywhere in the file is blanked. A test case proves the damage is silent and
 * total: given
 *     a { content: "/*"; color: red; }
 *     b { color: notacolor; }
 *     c { content: "*​/"; }
 * the regex erases the whole middle rule, so `color: notacolor` — a genuine
 * invalid value — never reaches the oracle and the gate reports clean. A
 * verification tool that can blind itself this way is worse than no tool, so this
 * one tracks quotes and backslash escapes and blanks only real comments. Nothing
 * shipped today carries `/*` in a string; this is about the gate staying true when
 * something does. (test/unit/tools/check-css-values.test.js pins it.)
 */
function stripComments(css) {
  const s = String(css || '');
  let out = '', quote = null, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && i + 1 < s.length) { out += c + s[i + 1]; i += 2; continue; }
      out += c;
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2; // an unterminated comment runs to EOF, as CSS says
      for (let k = i; k < stop; k++) out += s[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every `prop: value` declaration in a stylesheet, with its line.
 *
 * Walks characters tracking brace depth, paren depth and string state, so a `;`
 * inside `url(data:…)`, a quoted `content:` string, or a multi-argument
 * `color-mix(…)` never splits a declaration early. At-rule preludes (`@media …`)
 * are not declarations and are skipped; declarations INSIDE a CONDITIONAL group
 * rule (`@media`, `@supports`, `@container`, `@layer`) are collected — an invalid
 * value is just as dead inside `@media print`.
 *
 * DESCRIPTOR at-rules are skipped whole. `@font-face`, `@property`,
 * `@counter-style`, `@page` and friends contain *descriptors*, not properties —
 * `font-display`, `src`, `syntax`, `inherits`, `size`, `marks`. `CSS.supports`
 * only answers about properties, so it rejects every one of them and the gate
 * would fail on perfectly valid CSS. `lib/` + `themes/` happen to contain no
 * `@font-face` today, so this was latent: the first one added would have turned
 * the gate red for no reason. Found by running the sweep over `docs/src/styles/**`,
 * where 13 false positives on `font-display: swap` and `src: url(…) format(…)`
 * made it obvious.
 */
const DESCRIPTOR_AT_RULES = /^@(font-face|font-palette-values|font-feature-values|property|counter-style|page|viewport|color-profile)\b/i;

/**
 * Walk a stylesheet once, returning both the declarations AND the evidence that
 * the walk itself was sound.
 *
 * The counters in the second half are not decoration. Three separate bugs in this
 * parser have now made the gate report CLEAN on CSS it never looked at — a `/*`
 * inside a string, `content: "\\"` swallowing the file, and a stray `)` pinning
 * `paren` below zero so `paren === 0` was never true again and every subsequent
 * `{`/`}`/`;` stopped registering. Each one was found by a reader, not by the
 * tool, because a hand-rolled parser that loses its place produces exactly the
 * output of a clean corpus: nothing.
 *
 * So the walk now reports its own end state, and main() refuses to certify a file
 * whose walk did not land balanced (`depth`/`paren` back to zero, no open string,
 * no unclosed descriptor skip, no stray `)`), and cross-checks the block count
 * against the browser's own parse of the same bytes. Silence has to be earned.
 */
function scan(css) {
  const out = [];
  let buf = '', paren = 0, quote = null, line = 1, startLine = 1;
  let skipDepth = 0, depth = 0, blocks = 0, statements = 0, strayParen = 0;
  const flush = () => {
    const t = buf.trim();
    buf = '';
    if (!t) return;
    // A statement at-rule (`@import …;`, `@layer a, b;`) is a RULE to the CSSOM
    // even though it opens no block — counted so the cross-check below lines up.
    if (t.startsWith('@')) { statements++; return; }
    const i = t.indexOf(':');
    if (i < 1) return;
    const prop = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (!prop || !value || /\s/.test(prop)) return;
    out.push({ prop, value, line: startLine });
  };
  for (let k = 0; k < css.length; k++) {
    const c = css[k];
    if (c === '\n') line++;
    if (quote) {
      // Consume an escape and its target together. Looking BACK at css[k-1] the
      // way this used to gets `content: "\\"` — one literal backslash, which ends
      // the string in CSS — exactly wrong: the closing quote reads as escaped, the
      // parser stays inside the string, and it swallows the rest of the file. The
      // gate then reports clean on CSS it never saw, which is the failure mode this
      // whole tool exists to catch. stripComments was fixed for this; declarations
      // was not, until a checker found the pair had diverged.
      if (c === '\\' && k + 1 < css.length) { buf += c + css[k + 1]; if (css[k + 1] === '\n') line++; k++; continue; }
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '(') paren++;
    // Clamp rather than go negative. An unbalanced `)` used to pin `paren` at -1
    // for the remainder of the file, so `paren === 0` never held again and the
    // walk stopped seeing braces and semicolons entirely — the whole rest of the
    // stylesheet vanished, silently. Clamping contains the damage to one value;
    // `strayParen` makes main() refuse to certify the file at all.
    if (c === ')') { if (paren === 0) strayParen++; else paren--; }
    if (paren === 0 && (c === '{' || c === '}' || c === ';')) {
      if (c === '{') {
        depth++;
        blocks++;
        // A descriptor at-rule's whole body is skipped (see DESCRIPTOR_AT_RULES).
        if (!skipDepth && DESCRIPTOR_AT_RULES.test(buf.trim())) skipDepth = depth;
        buf = '';
      } else if (c === '}') {
        // Leaving a skipped body must DROP what it accumulated. Clearing skipDepth
        // without clearing buf leaks the block's last descriptor (one written
        // without a trailing `;`) into the next flush — so `@media print {
        // @font-face { src: url(a) } }` emitted `src: url(a)` as if it were a
        // property, `CSS.supports` rejected it, and the gate went RED on valid CSS.
        if (skipDepth && depth === skipDepth) { skipDepth = 0; buf = ''; }
        else if (!skipDepth) flush();
        else buf = '';
        depth--;
      } else if (skipDepth) {
        buf = '';
      } else {
        flush();
      }
      startLine = line;
      continue;
    }
    if (!buf.trim()) startLine = line;
    buf += c;
  }
  return { decls: out, blocks, statements, depth, paren, strayParen, openString: quote !== null, skipDepth };
}

/** The declaration list alone — the shape the unit tests and callers want. */
function declarations(css) {
  return scan(css).decls;
}

/**
 * Resolve a Chromium, or return undefined so the caller can exit cleanly.
 *
 * A stale `CHROME_PATH` — the sandbox's puppeteer cache is not durable, so the
 * exported path can outlive the binary — falls through to the cache probe rather
 * than failing outright, since the probe is exactly what the hook would have found.
 *
 * PORTABLE, unlike the first cut. That one shelled out to `bash -lc 'ls
 * /root/.cache/puppeteer/…'`: it hardcoded root's home, so the tool could only ever
 * run in this sandbox, and it needed a shell to do a directory listing. This is the
 * resolver from tools/check-family-tiers.js:46, which probes `$HOME` first and the
 * root path second and uses fs directly. (Nine tools now carry a near-identical
 * resolver — off-path duplication for this change, filed rather than folded in.)
 */
function chromePath() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/**
 * Replace every `var(…)` in a value with `probe`, matching parens properly.
 *
 * A regex cannot do this — `var(--a, var(--b, 1px))` nests, and
 * `color-mix(in oklab, var(--x) 12%, transparent)` puts a var() inside another
 * function's argument list. Both appear verbatim in this repo's CSS.
 */
function splitVars(value) {
  const parts = [], slots = [];
  let lit = '', i = 0;
  while (i < value.length) {
    const at = value.toLowerCase().indexOf('var(', i);
    if (at === -1) { lit += value.slice(i); break; }
    lit += value.slice(i, at);
    let depth = 0, k = at + 3;
    for (; k < value.length; k++) {
      if (value[k] === '(') depth++;
      else if (value[k] === ')') { depth--; if (depth === 0) break; }
    }
    const inner = value.slice(at + 4, k);
    const comma = inner.indexOf(',');
    // A fallback that itself contains a var() is flattened one more level; if the
    // innermost has no fallback the slot simply has none, and the generic probes
    // carry it. Nothing here needs to be exact — a probe list only has to CONTAIN
    // one substitution that parses, for the value to be cleared.
    let fallback = comma === -1 ? null : inner.slice(comma + 1).trim();
    if (fallback && /\bvar\s*\(/i.test(fallback)) {
      const inner2 = splitVars(fallback);
      fallback = inner2.slots.every((s) => s.fallback) ? inner2.parts.reduce((a, p, n) => a + (n ? inner2.slots[n - 1].fallback : '') + p, '') : null;
    }
    parts.push(lit);
    slots.push({ fallback });
    lit = '';
    i = k + 1;
  }
  parts.push(lit);
  return { parts, slots };
}

/** Rebuild a value from `splitVars` output with one substitution per slot. */
function substituteVars(value, probes) {
  const { parts, slots } = splitVars(value);
  const pick = (n) => (Array.isArray(probes) ? probes[n] : probes);
  return parts.reduce((a, p, n) => a + (n ? (pick(n - 1) ?? slots[n - 1].fallback ?? '') : '') + p, '');
}

/**
 * Generic probe tokens, one per CSS type a custom property plausibly carries here.
 *
 * Each var() in a value is an INDEPENDENT slot and gets its own probe — the first
 * cut substituted one probe into every slot at once, which reported 40+ false
 * positives on this repo's own CSS. `border: var(--chart-hairline) solid
 * var(--pill-ink)` is fine as `1px solid red` and nonsense as `red solid red`, and
 * only a per-slot search finds the first. The slot's DECLARED FALLBACK is tried
 * ahead of these where one exists, because the author wrote the type they expect
 * right there in the value.
 *
 * A value is reported only when EVERY combination is rejected — i.e. no assignment
 * of tokens to slots could make it parse — so this finds values dead for structural
 * reasons, not values whose token merely happens to be the wrong type today.
 */
const VAR_PROBES = ['1px', 'red', 'none', '0 0 red', '1', '1%', 'auto', 'solid', '1s', '"s"'];

/**
 * Cap on combinations tried per value. The search is a cross-product over slots, so
 * it is exponential; the cap makes the pass's cost bounded and its blind spot
 * explicit. A value that exhausts the cap without a hit is NOT reported — an
 * unfinished search is not evidence of a defect.
 */
const VAR_COMBO_CAP = 4000;

/**
 * The var() pass runs TWICE, over the same values, asking opposite questions.
 *
 *   STRUCTURAL (generic probes above): "is there ANY token that makes this parse?"
 *     No → the value is dead whatever the cascade does. Catches the `.tinted` kanban
 *     class — `light-dark(<shadow>, <shadow>)` never parses, period.
 *
 *   DECLARED (this pass): "does it parse under every value the token is ACTUALLY
 *     GIVEN in our own CSS?" The tokens are ours, so their declared values are all
 *     right here — 492 custom properties, already collected because the gate skips
 *     them. Any → no, and the declaration is dead for a REACHABLE configuration.
 *
 * The second question is the one that finds the expensive bugs, because it sees the
 * token-dependent deaths the first is blind to by construction. Both real finds came
 * from it and neither is theoretical: `--elevation-card` defaults to `none`, and
 * `none` is only legal as box-shadow's SOLE value, so pricing's elevated-tier accent
 * ring was dead on every deck without `lift: on`; `--fin-frame: none` in the
 * `finish-none` opt-out killed the composed tone rail the same way, six lines under a
 * comment stating the exact invariant it broke.
 *
 * It is deliberately conservative. A slot whose token has no literal declaration in
 * the corpus (a deck-supplied override, a var()-of-var() chain) is not probed at all,
 * and a value with any such slot is left to the structural pass. That leaves real
 * coverage on the table; it also means a report here is a configuration that exists.
 */
const DECLARED_COMBO_CAP = 2000;

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const showAll = argv.includes('--all');

  const files = SCAN_DIRS.flatMap((d) => listCss(d));
  const all = [];
  const walks = [];
  const integrity = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const src = fs.readFileSync(f, 'utf8');
    const s = scan(stripComments(src));
    walks.push({ file: rel, src, blocks: s.blocks, statements: s.statements });
    // The walk has to land where it started. Anything else means it lost its
    // place mid-file, and every declaration after that point went unseen.
    const faults = [];
    if (s.depth !== 0) faults.push(`brace depth ended at ${s.depth}, not 0`);
    if (s.paren !== 0) faults.push(`paren depth ended at ${s.paren}, not 0`);
    if (s.strayParen) faults.push(`${s.strayParen} unmatched \`)\``);
    if (s.openString) faults.push('a string was still open at EOF');
    if (s.skipDepth) faults.push('a descriptor at-rule body was never closed');
    if (faults.length) integrity.push({ file: rel, faults });
    for (const d of s.decls) all.push({ file: rel, ...d });
  }

  const skipped = { custom: 0 };
  const testable = [], varred = [];
  // Every literal value each custom property is GIVEN anywhere in the corpus — the
  // input to the declared pass. A value that is itself a var() chain is left out:
  // resolving it needs the cascade, and a wrong resolution would invent a failure.
  const declaredValues = new Map();
  for (const d of all) {
    if (!d.prop.startsWith('--')) continue;
    const v = d.value.replace(/\s*!\s*important\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!v || /\bvar\s*\(/i.test(v)) continue;
    if (!declaredValues.has(d.prop)) declaredValues.set(d.prop, new Set());
    declaredValues.get(d.prop).add(v);
  }
  for (const d of all) {
    if (d.prop.startsWith('--')) { skipped.custom++; continue; }
    // `!important` is a DECLARATION-level flag, not part of the value grammar —
    // CSS.supports() rejects any value carrying it. Values may also span lines
    // (a multi-layer box-shadow); newlines are not what the parser sees.
    const value = d.value.replace(/\s*!\s*important\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    (/\bvar\s*\(/i.test(value) ? varred : testable).push({ ...d, value });
  }

  const group = (list) => {
    const m = new Map();
    for (const d of list) {
      const k = `${d.prop}|${d.value}`;
      if (!m.has(k)) m.set(k, { prop: d.prop, value: d.value, sites: [] });
      m.get(k).sites.push(`${d.file}:${d.line}`);
    }
    return [...m.values()];
  };
  const pairs = group(testable);
  const varPairs = group(varred);

  const exe = chromePath();
  if (!exe) {
    console.error('✗ no Chrome found — set CHROME_PATH (the SessionStart hook exports it).');
    process.exit(2);
  }
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const verdicts = await page.evaluate(
    (list) => list.map(({ prop, value }) => CSS.supports(prop, value)),
    pairs.map(({ prop, value }) => ({ prop, value })),
  );
  // The var() pass: a value clears only if SOME assignment of probe tokens to its
  // var() slots parses. The odometer runs in-page so it can stop at the first hit
  // — most values clear in a handful of combinations.
  const varVerdicts = await page.evaluate((list, probes, cap) => list.map(({ prop, parts, fallbacks }) => {
    const lists = fallbacks.map((f) => (f === null ? probes : [f, ...probes]));
    const build = (idx) => parts.reduce((a, p, n) => a + (n ? lists[n - 1][idx[n - 1]] : '') + p, '');
    const idx = new Array(lists.length).fill(0);
    for (let tried = 0; tried < cap; tried++) {
      if (CSS.supports(prop, build(idx))) return true;
      let k = lists.length - 1;
      while (k >= 0 && ++idx[k] >= lists[k].length) { idx[k] = 0; k--; }
      if (k < 0) return false;          // search exhausted — genuinely nothing parses
    }
    return true;                        // hit the cap; an unfinished search proves nothing
  }), varPairs.map((d) => {
    const { parts, slots } = splitVars(d.value);
    return { prop: d.prop, parts, fallbacks: slots.map((s) => s.fallback) };
  }), VAR_PROBES, VAR_COMBO_CAP);

  // The DECLARED pass (see DECLARED_COMBO_CAP): same values, opposite question —
  // does it parse under EVERY value our own CSS gives the token? Reports the first
  // combination that does not, so the message can name it.
  const declaredInput = varPairs.map((d) => {
    const { parts, slots } = splitVars(d.value);
    const names = [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    if (names.length !== slots.length) return null;                 // shape we cannot read
    const lists = names.map((n) => [...(declaredValues.get(n) || [])]);
    if (lists.some((l) => !l.length)) return null;                  // a token we never see declared
    if (lists.reduce((a, l) => a * l.length, 1) > DECLARED_COMBO_CAP) return null;
    return { prop: d.prop, parts, lists };
  });
  const declaredVerdicts = await page.evaluate((list) => list.map((item) => {
    if (!item) return null;
    const { prop, parts, lists } = item;
    const idx = new Array(lists.length).fill(0);
    for (;;) {
      const v = parts.reduce((a, p, n) => a + (n ? lists[n - 1][idx[n - 1]] : '') + p, '');
      if (!CSS.supports(prop, v)) return v;
      let k = lists.length - 1;
      while (k >= 0 && ++idx[k] >= lists[k].length) { idx[k] = 0; k--; }
      if (k < 0) return null;
    }
  }), declaredInput);

  // Cross-check the walk against the browser's own parse of the same bytes: the
  // blocks we counted plus the statement at-rules we counted must equal the rules
  // Chromium built. This is the check the three self-blinding bugs would have
  // tripped on their first run — a parser that loses its place counts too few
  // blocks, and the browser is not fooled by the same input.
  const cssomCounts = await page.evaluate((list) => list.map(({ src }) => {
    const el = document.createElement('style');
    el.textContent = src;
    document.head.appendChild(el);
    let n = 0;
    const walk = (rules) => { for (const r of rules) { n++; if (r.cssRules) walk(r.cssRules); } };
    try { walk(el.sheet.cssRules); } catch { n = -1; }
    el.remove();
    return n;
  }), walks.map(({ src }) => ({ src })));
  await browser.close();

  walks.forEach((w, i) => {
    const mine = w.blocks + w.statements;
    if (cssomCounts[i] !== mine) {
      integrity.push({
        file: w.file,
        faults: [`saw ${mine} rule(s) (${w.blocks} block(s) + ${w.statements} statement at-rule(s)); Chromium parsed ${cssomCounts[i]}`],
      });
    }
  });

  const dropped = pairs.filter((_, i) => !verdicts[i]);
  const sanctioned = [], offences = [];
  const unused = [...SANCTIONED];
  const fileOf = (site) => site.replace(/:\d+$/, '');
  for (const d of dropped) {
    const i = unused.findIndex(
      (s) => s.prop === d.prop && s.value === d.value
        && d.sites.length === s.sites && d.sites.every((site) => s.files.includes(fileOf(site))),
    );
    if (i === -1) {
      // Distinguish "never sanctioned" from "sanctioned, but it has spread" — the
      // second is the interesting one, and it splits again by HOW it spread: into
      // a file the entry does not name, or into one it does but at a new site.
      const near = SANCTIONED.find((s) => s.prop === d.prop && s.value === d.value);
      const stray = near ? d.sites.filter((site) => !near.files.includes(fileOf(site))) : [];
      const extra = near && !stray.length && d.sites.length !== near.sites ? { saw: d.sites.length, want: near.sites } : null;
      offences.push({ ...d, stray, extra, sanctionedFiles: near ? near.files : null });
    } else {
      sanctioned.push({ ...d, why: unused[i].why });
      unused.splice(i, 1);
    }
  }

  // Values whose var() makes them unparseable under EVERY probe substitution, and
  // values that die under a token value our own CSS actually assigns.
  const varDead = varPairs.filter((_, i) => !varVerdicts[i]);
  const varDeclaredDead = varPairs
    .map((d, i) => (declaredVerdicts[i] ? { ...d, resolved: declaredVerdicts[i] } : null))
    .filter(Boolean)
    .filter((d) => !varDead.some((x) => x.prop === d.prop && x.value === d.value));

  const fail = offences.length || unused.length || integrity.length || varDead.length || varDeclaredDead.length;
  if (json) {
    console.log(JSON.stringify({
      files: files.length, declarations: all.length, skipped,
      tested: pairs.length, varTested: varPairs.length,
      integrity, offences, varDead, varDeclaredDead, sanctioned, staleSanctions: unused,
    }, null, 1));
    process.exit(fail ? 1 : 0);
  }

  console.log(`\n  ${files.length} stylesheets · ${all.length} declarations`);
  console.log(`  skipped ${skipped.custom} custom properties (the grammar IS "any token stream" — see the header)`);
  console.log(`  tested  ${pairs.length} distinct (property, value) pairs against the rendering engine`);
  console.log(`          + ${varPairs.length} carrying var(), against ${VAR_PROBES.length} typed probes per slot`);
  console.log(`            (${declaredInput.filter(Boolean).length} of those also against the values our own CSS declares for their tokens)\n`);

  for (const p of integrity) {
    console.log(`  ✗ PARSE INTEGRITY — ${p.file}`);
    for (const f of p.faults) console.log(`      ${f}`);
    console.log('    This tool\'s own walk of that file did not land where it started, so an unknown');
    console.log('    number of declarations in it were never tested. Do NOT read a clean run below as');
    console.log('    coverage of this file. Fix the CSS if it is genuinely malformed, or fix scan().\n');
  }

  for (const v of varDead) {
    console.log(`  ✗ ${v.prop}: ${v.value}`);
    for (const site of v.sites) console.log(`      ${site}`);
    console.log(`    No substitution for its var() makes this parse — every one of the ${VAR_PROBES.length} typed probes`);
    console.log('    is rejected, so the value is dead for structural reasons whatever the token holds.');
    console.log('    This class fails at COMPUTED-VALUE time, not parse time, which is worse: the');
    console.log('    declaration wins the cascade and then resolves to the property\'s INITIAL value');
    console.log('    instead of falling back to the rule it overrode.\n');
  }

  for (const v of varDeclaredDead) {
    console.log(`  ✗ ${v.prop}: ${v.value}`);
    for (const site of v.sites) console.log(`      ${site}`);
    console.log('    Parses in the abstract, but NOT under a value our own CSS gives the token:');
    console.log(`      ${v.prop}: ${v.resolved}`);
    console.log('    That is a REACHABLE configuration, not a hypothetical — the substituted value');
    console.log('    is declared somewhere in lib/ or themes/. The declaration dies at');
    console.log("    computed-value time, so it wins the cascade and resolves to the property's");
    console.log('    INITIAL value; it does NOT fall back to the rule it overrode.\n');
  }

  if (showAll && sanctioned.length) {
    console.log(`  ${sanctioned.length} sanctioned drop(s) — deliberate, kept:`);
    for (const s of sanctioned) console.log(`    ${s.prop}: ${s.value}  [${s.sites.length} site(s)]\n      ${s.why}`);
    console.log('');
  }

  // A sanction goes unused for three different reasons, and saying "no longer in
  // the CSS" for all three is a lie in two of them. Distinguish by looking at what
  // is actually in the corpus: gone (delete the entry) · still present but now
  // ACCEPTED, e.g. Chromium shipped the property (delete the entry, the value is
  // fine now) · still present and still dropped, but at a site the entry does not
  // cover (it was reported as an offence above; do not double-report it here).
  for (const s of unused) {
    const present = pairs.find((p) => p.prop === s.prop && p.value === s.value);
    if (present && offences.some((o) => o.prop === s.prop && o.value === s.value)) continue;
    console.log(`  ✗ STALE sanction — \`${s.prop}: ${s.value}\``);
    if (!present) {
      console.log('    is no longer in the CSS at all. Remove its SANCTIONED entry so the list stays honest.\n');
    } else {
      console.log('    is still in the CSS, but the engine now ACCEPTS it — most likely Chromium shipped');
      console.log('    the property since the sanction was written. Nothing to fix in the CSS; remove the');
      console.log('    SANCTIONED entry, and drop the vendor-prefixed twin too if it has one.\n');
    }
  }

  for (const o of offences) {
    console.log(`  ✗ ${o.prop}: ${o.value}`);
    for (const site of o.sites) console.log(`      ${site}`);
    if (o.stray?.length) {
      console.log(`    This value IS sanctioned, but only in ${o.sanctionedFiles.join(', ')}.`);
      console.log(`    New site(s): ${o.stray.join(', ')} — the sanction's justification does not`);
      console.log('    cover them. Check the reason still holds there (e.g. is the vendor twin');
      console.log("    actually beside it?), then widen the entry's `files` — or fix the value.");
    } else if (o.extra) {
      console.log(`    This value IS sanctioned in these file(s), for ${o.extra.want} site(s) — there are now ${o.extra.saw}.`);
      console.log('    A sanction is a claim about a specific pairing ("the vendor twin is on the line');
      console.log('    above"), and a new site in the same file does not inherit it. Check the reason');
      console.log("    holds at the new one, then raise the entry's `sites` — or fix the value.");
    }
    console.log('');
  }

  if (offences.length) {
    console.log(
      `  ${offences.length} declaration(s) the rendering engine DROPS. The value is outside the\n` +
      `  property's grammar, so the declaration is invalid at parse time and never applies —\n` +
      `  silently. Fix the value, or add a SANCTIONED entry WITH its justification if the drop\n` +
      `  is deliberate (a cross-engine pair, or intent no engine implements yet).\n` +
      `  Background: engineering/gotchas.md "A CSS reset declaration silently does nothing".\n`,
    );
  }
  if (!fail) {
    console.log(`  ✓ every testable declaration is accepted (${sanctioned.length} sanctioned drop(s) — \`--all\` to list)`);
    console.log(`  ✓ every walk balanced and matched Chromium's own rule count\n`);
  }
  process.exit(fail ? 1 : 0);
}

// Exported for test/unit/tools/check-css-values.test.js. These decide what the
// oracle ever gets to see, so their correctness gates the gate's: a stripComments
// that eats a rule, or a scan() that mis-splits one, makes this tool report clean
// on CSS it never actually looked at.
module.exports = { stripComments, declarations, scan, substituteVars, splitVars };

if (require.main === module) main();
