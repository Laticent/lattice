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
 * A `why` is mandatory: the gate fails on a STALE entry (one whose declaration is
 * gone), so the list cannot rot into a pile of unexplained exceptions.
 */
const SANCTIONED = [
  {
    prop: 'print-color-adjust', value: 'exact',
    why: 'Standard half of a cross-engine pair — `-webkit-print-color-adjust:exact` sits beside it on the same line (base.elements.css). Chromium takes the prefixed one; the standard name is there for engines that ship it.',
  },
  {
    prop: '-moz-osx-font-smoothing', value: 'grayscale',
    why: 'Firefox/macOS-only twin of `-webkit-font-smoothing:antialiased`, which is on the same line. Chromium has no equivalent and drops it by design.',
  },
  {
    prop: '-webkit-overflow-scrolling', value: 'touch',
    why: 'Legacy iOS Safari momentum scrolling for the fluid viewer. Inert in modern Chromium; still read by the old WebKit versions the exported HTML can land on.',
  },
  {
    prop: 'line-clamp', value: '2',
    why: 'Standard half of a cross-engine pair — `-webkit-line-clamp:2` is on the line above (kanban card title). Chromium clamps via the prefixed property; the standard one is there for when it lands.',
  },
  {
    prop: 'speak', value: 'never',
    why: 'CSS Speech Module intent — suppress announcement of the decorative status glyph injected by `::before` (a ✓/✗/◆ in the print + a11y texture sets). No engine implements `speak`, so it is inert everywhere today; kept as the recorded intent. NOTE: it does not achieve the accessibility goal on its own — assistive tech does not honor it, and the real fix is not to inject announced content. Tracked separately.',
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

// Blank comments out rather than deleting them, so reported line numbers stay true.
const stripComments = (css) => String(css || '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/**
 * Every `prop: value` declaration in a stylesheet, with its line.
 *
 * Walks characters tracking brace depth, paren depth and string state, so a `;`
 * inside `url(data:…)`, a quoted `content:` string, or a multi-argument
 * `color-mix(…)` never splits a declaration early. At-rule preludes (`@media …`)
 * are not declarations and are skipped; declarations INSIDE them are collected,
 * which is what we want — an invalid value is just as dead inside `@media print`.
 */
function declarations(css) {
  const out = [];
  let buf = '', paren = 0, quote = null, line = 1, startLine = 1;
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
    if (quote) { buf += c; if (c === quote && css[k - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '(') paren++;
    if (c === ')') paren--;
    if (paren === 0 && (c === '{' || c === '}' || c === ';')) {
      if (c === '{') buf = ''; else flush();
      startLine = line;
      continue;
    }
    if (!buf.trim()) startLine = line;
    buf += c;
  }
  return out;
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return spawnSync('bash', ['-lc', 'ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1'])
    .stdout.toString().trim() || undefined;
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
    const i = unused.findIndex((s) => s.prop === d.prop && s.value === d.value);
    if (i === -1) offences.push(d);
    else { sanctioned.push({ ...d, why: unused[i].why }); unused.splice(i, 1); }
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

  for (const s of unused) {
    console.log(`  ✗ STALE sanction — \`${s.prop}: ${s.value}\` is no longer in the CSS.`);
    console.log('    Remove its SANCTIONED entry in tools/check-css-values.js so the list stays honest.\n');
  }

  for (const o of offences) {
    console.log(`  ✗ ${o.prop}: ${o.value}`);
    for (const site of o.sites) console.log(`      ${site}`);
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

main();
