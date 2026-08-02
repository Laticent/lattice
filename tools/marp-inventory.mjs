#!/usr/bin/env node
/**
 * marp-inventory — classify every Marp reference in the repo by DISPOSITION.
 *
 * Two prior audits (`engineering/decisions/2026-07-09-marp-legacy-audit.md`,
 * `engineering/decisions/2026-07-10-marp-audit-doc-framing.md`) shipped
 * hand-written inventories that were stale within days, because a Marp
 * reference is created by ordinary work
 * — a comment, a compat note, a spec line — and nothing recounted them. This
 * tool is the recount: it walks the tracked tree and assigns every file that
 * mentions Marp one of eight dispositions, so "what Marp is still doing here"
 * is a command, not a memory.
 *
 * The dispositions answer the standing question directly — is this reference
 * relevant to the export target, or is it a candidate for removal/rewrite:
 *
 *   export      the one-way Export-to-Marp channel (bundle, fidelity ledger,
 *               the CLI/Studio export commands). KEEP — this is the product.
 *   interop     Marp/Marpit vocabulary Lattice BORROWED, plus the genuine
 *               boundary machinery (`--marp-slide-*` chrome tokens, the plain
 *               `:root` Marpit-scoper constraint). NOT a shared format — LFM is
 *               proprietary and ALREADY un-parseable by Marp (`_focus`,
 *               `_build`, `_lens`; 10 of 17 front-matter keys are ours).
 *               SHRINKS as an export-boundary lowering takes over the compat
 *               job — register §2 / §5b.
 *   provenance  "algorithm ported from @marp-team/marpit, not vendored"
 *               attribution in `lib/engine/*`. KEEP — the engine's citation.
 *   history     `engineering/decisions/**` and `CHANGELOG.md`. KEEP FROZEN —
 *               dated records are accurate about their own date.
 *   preview     the marp-vscode live-preview compatibility tax. CONTINGENT:
 *               removable only as a block, and only if the audit's §5(b) call
 *               (keep marp-vscode as a first-party preview surface, decided
 *               2026-07-10) is revisited. This is the largest single lever.
 *   rewrite     factually WRONG today — describes the owned engine as Marp, or
 *               cites a render path/gate that no longer exists.
 *   remove      references a deleted artifact; dead weight.
 *   generated   `dist/**`, `docs/public/**`, `*.generated.js`. Disposition
 *               follows the source; never hand-edit (HARD RULE #2).
 *
 * Usage:
 *   node tools/marp-inventory.mjs              summary + actionable list
 *   node tools/marp-inventory.mjs --full       every file, grouped by class
 *   node tools/marp-inventory.mjs --json       machine-readable
 *
 * A file's class is decided by, in order: the OVERRIDES table below (hand
 * verified, each with a reason), then path, then content signal. Anything the
 * signals cannot place lands in `interop` and is listed as UNTRIAGED in --full,
 * so new references surface instead of hiding in a bucket.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ARGS = new Set(process.argv.slice(2));
const WANT_FULL = ARGS.has('--full');
const WANT_JSON = ARGS.has('--json');

const CLASSES = [
  'export',
  'interop',
  'provenance',
  'history',
  'preview',
  'rewrite',
  'remove',
  'generated',
];

const BLURB = {
  export: 'KEEP — the Export-to-Marp channel. This is the product surface.',
  interop: 'SHRINKS — vocabulary LFM borrowed, plus real boundary machinery.',
  provenance: 'KEEP — porting attribution in the owned engine.',
  history: 'KEEP FROZEN — dated records, accurate as of their date.',
  preview: 'CONTINGENT — the marp-vscode preview tax; retires only as a block.',
  rewrite: 'REWRITE — factually wrong about what renders Lattice today.',
  remove: 'REMOVE — points at something that no longer exists.',
  generated: 'GENERATED — follows its source; never hand-edit (HARD RULE #2).',
};

/**
 * Hand-verified placements. Every entry carries the reason it outranks the
 * mechanical rules, so a future reader can re-check the call rather than
 * inherit it. Keyed by exact path.
 *
 * Files audited and CORRECTED on 2026-08-02 are pinned here to their true
 * post-fix class, so the table doubles as the record of what was checked —
 * re-firing a `rewrite` signal on one of these means something REGRESSED, not
 * that the original defect is back. See
 * engineering/decisions/2026-08-02-marp-reference-register.md §6.
 */
const OVERRIDES = {
  'lattice-emulator.js': [
    'interop',
    'Audited 2026-08-02. Its header called the OWNED CLI a "Marp-faithful HTML renderer" for "lattice.css (written for Marp)" and told end users to run Marp CLI instead — corrected. What remains is format-accurate: the Marpit-compatible HTML shape, the `style:` and `lang:` directives, and Marp-equivalent pagination chrome.',
  ],
  'docs/src/pages/drawing-board.astro': [
    'export',
    'Audited 2026-08-02. "The marp render engine bundle" corrected to name the Lattice engine. What remains is the Export-to-Marp menu wiring plus an accurate historical note about theme-set registration.',
  ],
  'design/design-principles.md': [
    'interop',
    'Audited 2026-08-02. Four errors corrected: `data-lattice-pagination` mis-attributed to Marp CLI TWICE (it is emitted by lib/engine/slides.js:219), the heading "Part 2: Marp Directives", and "the custom renderer (non-Marp CLI)". What remains is the `--marp-slide-*` token bridge and the scaffold `!important` note.',
  ],
  'design/forms.md': [
    'interop',
    'Audited 2026-08-02. "All three render paths (emulator, marp-cli plugins, runtime)" and the "cross-renderer parity gate" corrected and dated. The rest — how a Marp-rendered surface composes Form — is accurate.',
  ],
  'lib/core/resolve-finish.js': [
    'interop',
    'Audited 2026-08-02. "The three render paths" corrected to two. The remaining line states that Marpit has no native `finish:`, which is true.',
  ],
  'lib/engine/css.js': [
    'provenance',
    'Audited 2026-08-02. Attributed `data-lattice-pagination` to Marpit; the engine emits it (lib/engine/slides.js:219) and Marpit\'s own is `data-marpit-pagination`. Corrected. The path rule would also land this on `provenance` — pinned anyway so the audit is recorded, not inferred.',
  ],
  'examples/sketch.md': [
    'interop',
    'Audited 2026-08-02. Shipped slide content asserted "cross-renderer parity so the emulator, marp-cli, and runtime never drift" — corrected, PDF rebuilt. The remaining line is a true note about SVG filters and print scaling.',
  ],
  '.github/workflows/ci.yml': [
    'history',
    'Audited 2026-08-02. "The Marp/Puppeteer/emulator pipeline" corrected. What remains is the deliberate tombstone explaining why the engine-parity job is gone — worth more than silence.',
  ],
  'lib/base/base.tokens.css': [
    'interop',
    'Defines the `--marp-slide-*` chrome bridge tokens by their Marp-core names so a Marp-rendered surface picks up the palette. A Marp-vocabulary name in the public token API, deliberately.',
  ],
  'spec/LFM-1.0.md': [
    'interop',
    'The spec states Marpit compatibility as a format fact and already names the native re-implementation. Accurate.',
  ],
  'docs/src/content/docs/spec/lfm.md': ['interop', 'Docs-site copy of the LFM spec.'],
  '.claude/settings.json': [
    'export',
    'Allows `marp`/`npx marp`. NOTHING records why — the entries landed in an unrelated theming commit (c186442) with no annotation, and JSON carries no comments. Rendering an exported bundle to check it is the plausible purpose and the reason for this placement, but it is inference, not evidence.',
  ],
};

const PATH_RULES = [
  [/^engineering\/decisions\//, 'history'],
  [/^CHANGELOG\.md$/, 'history'],
  [/^dist\//, 'generated'],
  [/^docs\/public\//, 'generated'],
  [/\.generated\.js$/, 'generated'],
  [/^docs\/src\/lib\/cadenza\/dist\//, 'generated'],
  [/marp-bundle|marp-fidelity|export-marp|drawing-board-export|share-export/, 'export'],
  [/^lib\/engine\//, 'provenance'],
];

/** Content signals, most specific first, applied to a file's Marp-hit lines. */
const SIGNALS = [
  // Phantom-render-path tells only. "Marp-faithful" is NOT one — it is the
  // correct word for note semantics and directive handling that deliberately
  // match Marp's, which is interop.
  [
    /marp render engine|marp-cli render path client-side|three render paths|three renderers|Three-renderer|cross-renderer parity/i,
    'rewrite',
  ],
  [/marp-vscode|vscode preview|VS Code preview|markdown\.marp|marp-pre|chrome91/i, 'preview'],
  [/export.to.marp|export:marp|exportMarp|marp bundle|marp\.config|recipient/i, 'export'],
  [/ported|provenance|upstream|reference:/i, 'provenance'],
];

/**
 * The instrument and its report are ABOUT Marp references, not instances of
 * them: this file carries the phantom-phrase patterns as regex literals (so it
 * classifies itself `rewrite`), and the register quotes every defect verbatim
 * as evidence. Counting either inflates every total and manufactures a false
 * positive. Excluded by name, not by pattern, so nothing else hides here.
 */
const SELF = new Set([
  'tools/marp-inventory.mjs',
  'engineering/decisions/2026-08-02-marp-reference-register.md',
]);

/**
 * Phantom-render-path phrases. These describe a THIRD render path (marp-cli
 * plugins) and a cross-renderer parity gate, both retired in P4
 * (`engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md`).
 *
 * Scanned SEPARATELY from the Marp inventory, over every tracked text file,
 * because these sentences usually do NOT contain the word "marp" — so a scan
 * restricted to Marp-mentioning lines cannot see them. That was a real defect
 * in the first version of this tool: it reported "0 actionable" while 40 files
 * carried a live false claim, including four siblings of a file it did flag
 * (`lib/core/resolve-finish.js`, caught only because that one line happened to
 * say "Marpit"). Never narrow this scan to the Marp row set.
 */
const PHANTOM_RE = /three render paths|three renderers|three-renderer|cross-renderer parity/i;

// Dated records and the generated changelog describe the past accurately.
const PHANTOM_EXEMPT = /^(engineering\/decisions\/|CHANGELOG\.md$|dist\/|docs\/public\/)/;

// `git ls-files` prints paths relative to CWD, which would silently void every
// `^`-anchored path rule and every OVERRIDES key when run from a subdirectory.
// Anchor to the repo root so the output is identical from anywhere.
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const files = execFileSync('git', ['ls-files'], {
  encoding: 'utf8',
  maxBuffer: 64 << 20,
  cwd: ROOT,
})
  .split('\n')
  .filter(Boolean)
  .filter((f) => !SELF.has(f));

/**
 * Decide binary-ness by DECODABILITY, not by the presence of a NUL byte.
 * `lib/engine/themes.js` uses a literal NUL as a cache-key separator, and a
 * naive `includes(0)` test dropped that engine source from the inventory
 * entirely — silently, in the exact area the register claims to enumerate.
 */
function isBinary(buf) {
  const head = buf.subarray(0, 8000).toString('utf8');
  // U+FFFD only appears when the bytes were not valid UTF-8.
  return head.includes('�');
}

const rows = [];
const phantoms = [];
for (const file of files) {
  let buf;
  try {
    buf = readFileSync(`${ROOT}/${file}`);
  } catch {
    continue;
  }
  if (isBinary(buf)) continue;
  const text = buf.toString('utf8');

  if (PHANTOM_RE.test(text) && !PHANTOM_EXEMPT.test(file)) {
    const lines = [];
    text.split('\n').forEach((line, i) => {
      if (PHANTOM_RE.test(line)) lines.push({ line: i + 1, text: line.trim() });
    });
    phantoms.push({ file, lines });
  }

  if (!/marp/i.test(text)) continue;

  const hits = [];
  let frontMatter = 0;
  text.split('\n').forEach((line, i) => {
    if (!/marp/i.test(line)) return;
    if (/^marp:\s*true\s*$/.test(line)) {
      frontMatter++;
      return;
    }
    hits.push({ line: i + 1, text: line.trim() });
  });
  if (!hits.length && !frontMatter) continue;

  const [forced, why] = OVERRIDES[file] ?? [];
  const joined = hits.map((h) => h.text).join('\n');
  const byPath = PATH_RULES.find(([re]) => re.test(file))?.[1];
  const bySignal = SIGNALS.find(([re]) => re.test(joined))?.[1];

  // `marp: true` and nothing else. This is the deck-authoring convention that
  // `design/skills/deck.md` and `engineering/workflow.md` prescribe. It serves
  // BOTH surfaces — the VS Code preview activates on it, and
  // `docs/src/playground/deck-config.js:334` leads every exported block with it
  // "so an exported .md renders" through the recipient's marp-cli. Classified
  // `preview` because that is the surface it can be RETIRED with; it is not
  // free to delete, since the export path emits it too.
  const fmOnly = !hits.length;

  // A `rewrite`/`remove` signal OUTRANKS an override. Overrides pin a file's
  // resting class after an audit; they must never be able to hide fresh drift,
  // or the "a rewrite signal firing again means a regression" guarantee is
  // unreachable by construction — which it was, in the first version.
  //
  // It does NOT outrank `history`/`generated`, though: a dated decision record
  // QUOTING the old "three render paths" language is being accurate about its
  // own date, and a generated bundle inlines whatever its source says.
  const frozen = byPath === 'history' || byPath === 'generated';
  const drift = !frozen && (bySignal === 'rewrite' || bySignal === 'remove') ? bySignal : null;
  const cls = drift ?? forced ?? (byPath ?? (fmOnly ? 'preview' : (bySignal ?? 'interop')));

  rows.push({
    file,
    class: cls,
    reason: why ?? null,
    pinned: Boolean(forced),
    triaged: Boolean(drift ?? forced ?? byPath ?? bySignal ?? fmOnly),
    lines: hits.length,
    frontMatter,
    hits,
  });
}

rows.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

// NO process.exit() anywhere in this file. Node discards buffered stdout on
// exit() when stdout is a PIPE, which is exactly how a machine reader consumes
// `--json` — the first version truncated to one 64KB buffer (3% of the payload)
// and still exited 0. Guard the human report instead, and let the process end
// naturally so the writes flush.
if (WANT_JSON) {
  console.log(JSON.stringify({ generated: rows.length, rows, phantoms }, null, 2));
}

if (!WANT_JSON) {
  const tally = Object.fromEntries(CLASSES.map((c) => [c, { files: 0, lines: 0, fm: 0 }]));
  for (const r of rows) {
    const t = tally[r.class];
    t.files++;
    t.lines += r.lines;
    t.fm += r.frontMatter;
  }

  const totalLines = rows.reduce((a, r) => a + r.lines, 0);
  const totalFm = rows.reduce((a, r) => a + r.frontMatter, 0);

  console.log(`# Marp reference inventory\n`);
  console.log(
    `${rows.length} tracked files carry a Marp reference: ` +
      `${totalLines} prose/code lines + ${totalFm} \`marp: true\` front-matter keys.\n`,
  );
  console.log('| Disposition | Files | Lines | `marp: true` | Meaning |');
  console.log('|---|---:|---:|---:|---|');
  for (const c of CLASSES) {
    const t = tally[c];
    if (!t.files) continue;
    console.log(`| \`${c}\` | ${t.files} | ${t.lines} | ${t.fm || '—'} | ${BLURB[c]} |`);
  }

  console.log(
    '\n**Scope:** files containing the literal string `marp`. A sentence that is ' +
      'wrong about Marp WITHOUT naming it is invisible to that scan, which is what ' +
      'the separate phantom-path section below exists to catch. "0 actionable" ' +
      'means only "no Marp-mentioning file matches a drift signal".',
  );

  const actionable = rows.filter((r) => r.class === 'rewrite' || r.class === 'remove');
  console.log(`\n## Actionable — ${actionable.length} files\n`);
  for (const r of actionable) {
    console.log(`### \`${r.file}\` — **${r.class.toUpperCase()}**`);
    if (r.reason) console.log(`\n${r.reason}\n`);
    for (const h of r.hits) console.log(`  ${r.file}:${h.line}  ${h.text.slice(0, 150)}`);
    console.log('');
  }

  const phantomLines = phantoms.reduce((a, p) => a + p.lines.length, 0);
  console.log(
    `\n## Phantom render paths — ${phantoms.length} files, ${phantomLines} lines\n`,
  );
  console.log(
    'Claims of a THIRD render path or a cross-renderer parity gate, both retired\n' +
      'in P4. Scanned over every tracked text file, NOT just Marp-mentioning ones.\n' +
      'Dated decision records and the CHANGELOG are exempt.\n',
  );
  for (const p of phantoms) {
    for (const l of p.lines) console.log(`  ${p.file}:${l.line}  ${l.text.slice(0, 140)}`);
  }

  const untriaged = rows.filter((r) => !r.triaged);
  if (untriaged.length) {
    console.log(`\n## Untriaged — ${untriaged.length} files fell through to \`interop\`\n`);
    for (const r of untriaged) console.log(`  ${r.file} (${r.lines})`);
  }

  if (WANT_FULL) {
    for (const c of CLASSES) {
      const group = rows.filter((r) => r.class === c);
      if (!group.length) continue;
      console.log(`\n## \`${c}\` — ${group.length} files\n`);
      for (const r of group) {
        console.log(`  ${String(r.lines).padStart(4)}  ${r.file}${r.frontMatter ? '  (marp: true)' : ''}`);
      }
    }
  }
}
