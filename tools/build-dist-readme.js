#!/usr/bin/env node
/**
 * Generate dist/README.md — the index for the distribution folder.
 *
 * dist/ holds the shipped, committed build artifacts: the CSS bundles, the
 * runtime bundle, the bundled emulator CLI, and the canonical component
 * reference. This README is itself one of those artifacts — a map of what
 * the folder contains and how each file is consumed — generated so it can
 * never drift from reality.
 *
 * It scans dist/ for the files actually present and renders a table from a
 * known description map. A file with no description entry still appears (so
 * the README never silently omits something that ships) with a placeholder
 * note — that surfaces as a visible TODO and, under --check, as drift that
 * fails CI until a description is added here.
 *
 * Byte sizes are intentionally omitted: they'd make every unrelated CSS or
 * doc edit churn this file. The README tracks STRUCTURE (what ships, why),
 * not content bytes.
 *
 * Flags:
 *   --check    Generate in memory and diff against the committed
 *              dist/README.md. Exits 1 on drift. CI / build:check gate.
 *   --silent   Suppress the success log line (implied by --check).
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const DIST     = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, 'README.md');

const argv   = process.argv.slice(2);
const check  = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// Keyed by dist-relative POSIX path. `consume` is the public entry point or
// a short note on how the file is used.
const DESCRIPTIONS = {
  'lattice.css': {
    purpose: 'Engine bundle — the palette-blind layout system (layouts + modifiers, no colour tokens).',
    consume: '`@slidewright/lattice/css`',
  },
  'lattice.min.css': {
    purpose: 'Minified `lattice.css` — same engine, comments/whitespace stripped (Marp `@theme`/`@size` directives preserved). Production / CDN drop-in.',
    consume: '`@slidewright/lattice/css/min`',
  },
  'lattice-default.css': {
    purpose: 'Zero-config drop-in: the engine flattened together with the default palette (cuoio), `@import` resolved at build time. Browser-droppable.',
    consume: '`@slidewright/lattice/default`',
  },
  'lattice-default.min.css': {
    purpose: 'Minified `lattice-default.css` — the zero-config themed drop-in, compressed. The leanest single-file `<link>` for browser use.',
    consume: '`@slidewright/lattice/default/min`',
  },
  'lattice-emoji.css': {
    purpose: 'Opt-in full-offline colour emoji `@font-face` (Noto Color Emoji). Link after `lattice.css`; run `npm run fonts:emoji` to vendor the font (excluded from the npm tarball, ~25 MB). Without it, emoji fall back to the installed system font.',
    consume: '`@slidewright/lattice/dist/lattice-emoji.css` (opt-in, not in `exports`)',
  },
  'lattice-runtime.js': {
    purpose: 'Browser runtime transforms (chart-family, structure post-processing) — powers the web export, the marp-vscode preview, and (bundled) the Export-to-Marp zip\'s full-fidelity HTML route. esbuild IIFE.',
    consume: '`@slidewright/lattice/runtime`',
  },
  'lattice-runtime.min.js': {
    purpose: 'Minified `lattice-runtime.js` — no inline source map. Production / CDN runtime drop-in.',
    consume: '`@slidewright/lattice/runtime/min`',
  },
  'lattice-emulator.js': {
    purpose: 'Lattice\'s own engine, bundled as a CLI — renders PDF, PPTX, and PNG directly (no Marp involved); the local engine graph inlined, node_modules deps left external. This is the package `bin` and `main`.',
    consume: '`lattice` bin / `@slidewright/lattice`',
  },
  'lattice-emulator.min.js': {
    purpose: 'Minified `lattice-emulator.js` — the same CLI bundle compressed, shebang + executable bit preserved. Leaner install footprint; the bin/main stays the unminified file.',
    consume: '`@slidewright/lattice/min`',
  },
  'docs/components.json': {
    purpose: 'Machine-readable component catalog (axes, tags, slots, skeletons, when/anti/related) — the JSON an agent or tool loads to pick a component.',
    consume: 'load as JSON / `@slidewright/lattice/dist/docs/components.json`',
  },
  'docs/components.md': {
    purpose: 'Canonical single-file component reference (plain Markdown): every component\'s slots, variants, when/why, anti-patterns. The browsable edition — live previews + an in-browser editor — is the docs-site component pages.',
    consume: 'read directly / link from docs',
  },
};

/** dist-relative POSIX paths of every file under dist/, except README.md. */
function listDistFiles(dir, base = DIST) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listDistFiles(abs, base));
    } else {
      const rel = path.relative(base, abs).split(path.sep).join('/');
      if (rel !== 'README.md') out.push(rel);
    }
  }
  return out.sort();
}

function render() {
  const files = listDistFiles(DIST);
  const rows = files.map((rel) => {
    const d = DESCRIPTIONS[rel];
    const purpose = d ? d.purpose : '**TODO: describe this artifact in tools/build-dist-readme.js.**';
    const consume = d ? d.consume : '—';
    return `| \`${rel}\` | ${purpose} | ${consume} |`;
  });

  return `<!-- Auto-generated by tools/build-dist-readme.js — DO NOT EDIT.
     Regenerate: npm run dist-readme:build (part of npm run build). -->

# \`dist/\` — Lattice distribution artifacts

This folder holds the **generated, committed** build outputs that Lattice
ships. They are produced by \`npm run build\` (each behind the ownership
gate) and verified fresh by \`npm run build:check\`. **Do not hand-edit
anything in this folder** — including this README; edit the generators in
\`tools/\` instead.

What decks and consumers actually load lives here: the README's jsdelivr / raw
URLs point into \`dist/\`, and the package \`exports\` map most named subpaths to these
files. See the repo \`README.md\` for the full entry-point table.

| File | Purpose | Consume via |
|---|---|---|
${rows.join('\n')}

> Regression-baseline PDFs and \`*.gallery.md\` files are **not** part of the
> distribution — they stay in git but are excluded from the npm tarball. See
> the \`files\` allowlist in \`package.json\`.
`;
}

function main() {
  const content = render();

  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== content) {
      console.error('✗ dist/README.md is stale relative to dist/ contents');
      console.error('  Run: npm run dist-readme:build');
      console.error('  Bypass (last resort): git commit --no-verify');
      process.exit(1);
    }
    process.exit(0);
  }

  fs.writeFileSync(OUT_FILE, content);
  if (!silent) console.log(`[build-dist-readme] ${path.relative(ROOT, OUT_FILE)}`);
}

main();
