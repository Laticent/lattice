/**
 * crosswalk — the permanent old→new token rename map for the universal token
 * system (engineering/decisions/2026-06-11-universal-token-system.md), plus the
 * two pure string transforms that rename a stylesheet between the two systems.
 *
 * STATUS: the canonical flip is COMPLETE (groups 1–5, ADR §11) — themes and the
 * engine now declare ONLY the new names, so the live source carries no legacy
 * names. This map is therefore no longer a live alias-era bridge; it is kept as:
 *   1. the documented historical SoT (mirrors the ADR §7 crosswalk table);
 *   2. a forward shim to migrate a *legacy-authored* deck (one a user pastes
 *      with old `--c1-light`/`--c-stroke`/… names) to the universal vocabulary;
 *   3. the basis for the Drawing-Board "Token system" toggle's legacy option,
 *      which the closeout inverts to a REVERSE (new→old) shim.
 *
 * Consumed by:
 *   - test/unit/tokens/crosswalk.test.js (mechanics of flip()/flipTheme())
 *   - (formerly docs/src/pages/drawing-board.astro, which required this at build time
 *     and shipped PAIRS to a client-side `flipTokens`; that route retired in the Studio
 *     succession, so this module has no docs-site consumer today)
 *
 * Excludes (never renamed): status (--pass/warn/fail stay the curated source;
 * --status-* alias to them) and the chart triad (--chart-cat-*, canonical since
 * phase 6). Sequential `--scale-*`→`--seq-*` and `--bg`/`--bg-alt`/`--border`:
 * --seq-* is canonical (group 1); bg/bg-alt/border were deliberately kept.
 *
 * Pure: no fs, no deps — bundles cleanly and runs in the browser.
 */

// ── The crosswalk: { old, new } pairs (the complete historical map) ───────────
const PAIRS = [
  // categorical (group 5): pale fill, deep mark, on-fill / on-mark ink
  ...Array.from({ length: 12 }, (_, i) => ({ old: `c${i + 1}-light`, new: `cat-${i + 1}-fill` })),
  ...Array.from({ length: 12 }, (_, i) => ({ old: `c${i + 1}-dark`, new: `cat-${i + 1}-mark` })),
  { old: 'c-ink-light', new: 'cat-on-fill' },
  { old: 'c-ink-dark', new: 'cat-on-mark' },

  // diagram-structural (group 2)
  { old: 'c-stroke', new: 'diagram-stroke' },
  { old: 'c-line', new: 'diagram-line' },
  { old: 'c-accent-warm', new: 'diagram-accent-warm' },

  // diagram lifecycle / annotation (group 3)
  { old: 'c-warm-light', new: 'diagram-active' },
  { old: 'c-warm-dark', new: 'diagram-active-mark' },
  { old: 'c-cool-light', new: 'diagram-done' },
  { old: 'c-cool-dark', new: 'diagram-done-mark' },
  { old: 'c-alarm-dark', new: 'diagram-critical-mark' },
  { old: 'c-alarm', new: 'diagram-critical' },
  { old: 'c-mark', new: 'diagram-today' },
  { old: 'c-note', new: 'diagram-note' },

  // surfaces / scheme (group 4)
  { old: 'bg-dark', new: 'surface-inverse' },
  { old: 'dark-bg-alt', new: 'scheme-dark-bg-alt' },
  { old: 'dark-bg', new: 'scheme-dark-bg' },
  { old: 'dark-border', new: 'scheme-dark-border' },
  { old: 'dark-text-heading', new: 'scheme-dark-text-heading' },
  { old: 'dark-text-body', new: 'scheme-dark-text-body' },
  { old: 'dark-text-display', new: 'scheme-dark-text-display' },
  { old: 'dark-text-secondary', new: 'scheme-dark-text-secondary' },
  { old: 'dark-text-label', new: 'scheme-dark-text-label' },
  { old: 'dark-text-muted', new: 'scheme-dark-text-muted' },

  // sequential ramp (group 1): --scale-50..900 → --seq-50..900
  ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => ({ old: `scale-${n}`, new: `seq-${n}` })),
];

// Longest old-name first so a literal-prefix scan never clips a longer token
// (belt-and-suspenders; the (?![\w-]) boundary already prevents it).
const ORDERED = [...PAIRS].sort((a, b) => b.old.length - a.old.length);

/** Escape a token name for use in a RegExp. */
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Flip a THEME stylesheet to new-canonical: rename every `--old` (definition
 * AND reference) to `--new`. The `(?![\w-])` boundary stops `--c1-light` from
 * touching `--c10-light`, or `--dark-bg` from touching `--dark-bg-alt`.
 */
function flipTheme(css) {
  let out = css;
  for (const { old, new: nu } of ORDERED) {
    out = out.replace(new RegExp(`--${esc(old)}(?![\\w-])`, 'g'), `--${nu}`);
  }
  return out;
}

/**
 * Flip ANY stylesheet (engine or theme) to the new-canonical system: rename
 * every old name to new (so every `var(--old)` consumer in mermaid.css /
 * component CSS and any derivation off an old name follow), then drop the
 * declarations that thereby became self-referential — the phase blocks'
 * forward aliases `--new: var(--old)` rename to `--new: var(--new)` and are
 * removed. The result reads the new names end-to-end and resolves identically
 * to the current system (asserted by test/unit/tokens/crosswalk.test.js).
 * Idempotent on already-new tokens (status, --chart-cat-*) — they aren't in the
 * crosswalk, so they're untouched.
 */
function flip(css) {
  return flipTheme(css).replace(/--([a-z0-9-]+)\s*:\s*var\(\s*--\1\s*\)\s*;?/gi, '');
}

module.exports = { PAIRS, flipTheme, flip };
