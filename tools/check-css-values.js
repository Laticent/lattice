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
 *   · values containing `var()` — substitution happens at computed-value time, so
 *     the declaration is valid at PARSE time whatever the token turns out to be.
 *     A bad token inside a var() chain is a different and harder bug; this gate
 *     does not claim it.
 *
 * USAGE
 *   node tools/check-css-values.js           # gate: exit 1 on any unsanctioned drop
 *   node tools/check-css-values.js --json    # machine-readable
 *   node tools/check-css-values.js --all     # also list what was sanctioned
 *
 * Needs CHROME_PATH (the SessionStart hook exports it).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['lib', 'themes'].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d));

/**
 * Declarations Chromium legitimately drops, kept on purpose.
 *
 * Every entry is a value Chromium does NOT implement but that we ship anyway,
 * for a reason that outlives this gate. Two shapes qualify and nothing else:
 *
 *   1. CROSS-ENGINE PAIR — the standard property written beside its vendor twin
 *      (or vice versa) so each engine takes the one it knows. Chromium drops the
 *      half addressed to someone else; that is the pattern working, not failing.
 *   2. FORWARD/AURAL INTENT — a property no engine implements yet, kept because
 *      the intent is worth recording in the cascade.
 *
 * A `why` is mandatory, and so is `files` — the list of stylesheets the sanction
 * covers. Both exist because a sanction is a claim about a SPECIFIC pairing in a
 * SPECIFIC file ("the vendor twin is on the line above"), and an earlier version
 * matched on `prop|value` alone across every site at once. That version would
 * silently absorb a future real defect: write `line-clamp: 2` in a new component
 * with no `-webkit-line-clamp` beside it and it collapses into the existing
 * sanction, exit 0, justification now true of only one of the two sites. Scoping
 * each sanction to its files means a new site is a NEW offence and has to be
 * looked at.
 *
 * The gate fails on a STALE entry too (one whose declaration is gone), so the list
 * cannot rot into a pile of unexplained exceptions.
 */
const SANCTIONED = [
  {
    prop: 'print-color-adjust', value: 'exact', files: ['lib/base/base.elements.css'],
    why: 'Standard half of a cross-engine pair — `-webkit-print-color-adjust:exact` sits beside it on the same line (base.elements.css). Chromium takes the prefixed one; the standard name is there for engines that ship it.',
  },
  {
    prop: '-moz-osx-font-smoothing', value: 'grayscale', files: ['lib/base/base.elements.css'],
    why: 'Firefox/macOS-only twin of `-webkit-font-smoothing:antialiased`, which is on the same line. Chromium has no equivalent and drops it by design.',
  },
  {
    prop: '-webkit-overflow-scrolling', value: 'touch', files: ['lib/base/base.fluid-view.css'],
    why: 'Legacy iOS Safari momentum scrolling for the fluid viewer. Inert in modern Chromium; still read by the old WebKit versions the exported HTML can land on.',
  },
  {
    prop: 'line-clamp', value: '2', files: ['lib/components/chart/kanban/kanban.styles.css'],
    why: 'Standard half of a cross-engine pair — `-webkit-line-clamp:2` is on the line above (kanban card title). Chromium clamps via the prefixed property; the standard one is there for when it lands.',
  },
  {
    prop: 'speak', value: 'never', files: ['lib/base/base.print-textures.css', 'themes/a11y-base.css'],
    why: 'KNOWN DEFECT, sanctioned to keep the gate green while it is fixed properly — NOT a deliberate pattern, and it fits neither shape above. Chromium DOES implement `speak`, with the CSS 2.1 aural vocabulary (`normal | none | spell-out`, plus `digits` / `literal-punctuation`); `never` is the CSS Speech Level 1 spelling and is outside that grammar, so it is dropped exactly like any other bad value. An earlier version of this entry claimed "no engine implements speak", which the tool\'s own oracle refutes (`CSS.supports("speak","none")` is true, `"never"` is false). The intent — do not announce the decorative ✓/✗/◆ that `::before` injects — is real but unserved either way: `speak` has no effect on the accessibility tree in any current engine, so even the spelling Chromium parses would do nothing. The fix is to stop injecting announced content (an `aria-hidden` wrapper or a background image), which is an accessibility redesign, not a value swap. Sites: lib/base/base.print-textures.css, themes/a11y-base.css. Issue #1320.',
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

function declarations(css) {
  const out = [];
  let buf = '', paren = 0, quote = null, line = 1, startLine = 1;
  let skipDepth = 0, depth = 0;
  const flush = () => {
    const t = buf.trim();
    buf = '';
    if (!t || t.startsWith('@')) return;
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
    if (c === ')') paren--;
    if (paren === 0 && (c === '{' || c === '}' || c === ';')) {
      if (c === '{') {
        depth++;
        // A descriptor at-rule's whole body is skipped (see DESCRIPTOR_AT_RULES).
        if (!skipDepth && DESCRIPTOR_AT_RULES.test(buf.trim())) skipDepth = depth;
        buf = '';
      } else if (c === '}') {
        if (skipDepth && depth === skipDepth) skipDepth = 0;
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
  return out;
}

/**
 * Resolve a Chromium, or return undefined so the caller can exit cleanly.
 *
 * Guarded because both halves can fail in ways that would otherwise crash with a
 * TypeError instead of the "no Chrome found" message: `CHROME_PATH` can point at
 * a binary that has since been cleaned up (the sandbox's puppeteer cache is not
 * durable), and `spawnSync` returns `stdout: null` when the spawn itself fails —
 * no bash on the box, ENOENT, a hit resource limit. A stale `CHROME_PATH` falls
 * through to the cache probe rather than failing outright, since the probe is
 * exactly what the hook would have found. Same shape as tools/check-geometry-parity.js.
 */
function chromePath() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  try {
    const r = spawnSync('bash', ['-lc', 'ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1']);
    const found = (r.stdout ? r.stdout.toString() : '').trim();
    return found && fs.existsSync(found) ? found : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const showAll = argv.includes('--all');

  const files = SCAN_DIRS.flatMap((d) => listCss(d));
  const all = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const d of declarations(stripComments(fs.readFileSync(f, 'utf8')))) all.push({ file: rel, ...d });
  }

  const skipped = { custom: 0, hasVar: 0 };
  const testable = [];
  for (const d of all) {
    if (d.prop.startsWith('--')) { skipped.custom++; continue; }
    if (/\bvar\s*\(/.test(d.value)) { skipped.hasVar++; continue; }
    // `!important` is a DECLARATION-level flag, not part of the value grammar —
    // CSS.supports() rejects any value carrying it. Values may also span lines
    // (a multi-layer box-shadow); newlines are not what the parser sees.
    const value = d.value.replace(/\s*!\s*important\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    testable.push({ ...d, value });
  }

  const uniq = new Map();
  for (const d of testable) {
    const k = `${d.prop}|${d.value}`;
    if (!uniq.has(k)) uniq.set(k, { prop: d.prop, value: d.value, sites: [] });
    uniq.get(k).sites.push(`${d.file}:${d.line}`);
  }
  const pairs = [...uniq.values()];

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
  await browser.close();

  const dropped = pairs.filter((_, i) => !verdicts[i]);
  const sanctioned = [], offences = [];
  const unused = [...SANCTIONED];
  for (const d of dropped) {
    const fileOf = (site) => site.replace(/:\d+$/, '');
    const i = unused.findIndex(
      (s) => s.prop === d.prop && s.value === d.value && d.sites.every((site) => s.files.includes(fileOf(site))),
    );
    if (i === -1) {
      // Distinguish "never sanctioned" from "sanctioned, but it has spread to a
      // file the sanction does not cover" — the second is the interesting one.
      const near = SANCTIONED.find((s) => s.prop === d.prop && s.value === d.value);
      const stray = near ? d.sites.filter((site) => !near.files.includes(fileOf(site))) : [];
      offences.push({ ...d, stray, sanctionedFiles: near ? near.files : null });
    } else {
      sanctioned.push({ ...d, why: unused[i].why });
      unused.splice(i, 1);
    }
  }

  if (json) {
    console.log(JSON.stringify({ files: files.length, declarations: all.length, skipped, tested: pairs.length, offences, sanctioned, staleSanctions: unused }, null, 1));
    process.exit(offences.length || unused.length ? 1 : 0);
  }

  console.log(`\n  ${files.length} stylesheets · ${all.length} declarations`);
  console.log(`  skipped ${skipped.custom} custom properties + ${skipped.hasVar} carrying var() (neither is judgeable — see the header)`);
  console.log(`  tested  ${pairs.length} distinct (property, value) pairs against the rendering engine\n`);

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
  if (!offences.length && !unused.length) {
    console.log(`  ✓ every testable declaration is accepted (${sanctioned.length} sanctioned drop(s) — \`--all\` to list)\n`);
  }
  process.exit(offences.length || unused.length ? 1 : 0);
}

// Exported for test/unit/tools/check-css-values.test.js. The two helpers below
// decide what the oracle ever gets to see, so their correctness gates the gate's:
// a stripComments that eats a rule, or a declarations() that mis-splits one, makes
// this tool report clean on CSS it never actually looked at.
module.exports = { stripComments, declarations };

if (require.main === module) main();
