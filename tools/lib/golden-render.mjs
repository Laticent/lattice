// FRESH RENDERS OF THE GOLDEN CORPUS — one implementation, for every tool that makes one.
//
// Moved verbatim out of `tools/regression-gate.mjs` so `tools/golden-diff.mjs` can render a
// golden the same way the gate (and build-galleries, which blesses) does, rather than a
// second copy drifting from the first (HARD RULE #15). The one change is that every
// function takes the repo ROOT, so golden-diff can render the BASE commit from a separate
// worktree with that commit's own engine (2026-10-06-goldens-bot-blessed.md §2.2).

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { injectDark } = require('../build-galleries.js');

// Tolerance mirrors engine-parity's: a per-channel delta within FUZZ is AA shimmer, not
// drift; a page FAILS only if the over-FUZZ pixel count exceeds FAIL_FRACTION of the page.
// The full history of these two numbers, and of the mermaid floor below, is in
// regression-gate.mjs beside the constants it re-exports.
export const FUZZ = '3%'; // ≈ channel delta 8 / 255, the engine-parity threshold
export const FAIL_FRACTION = 0.0005; // 0.05% of the page (≈ 260 px at 72dpi 960×540)
// Mermaid (mmdc SVG) anti-aliasing is not bit-identical across machine classes, so
// galleries and decks that carry it get a wider per-page floor.
export const FAIL_FRACTION_MERMAID = 0.01; // 1% — ~2× the observed cross-machine AA noise

// Galleries in the chart or diagram bucket are the only ones whose content is
// mmdc-rendered SVG, so they're the only ones that need the wider floor.
const MERMAID_BUCKET_RE = /\/components\/(chart|diagram)\//;
export function failFractionForGallery(galleryMd) {
  return MERMAID_BUCKET_RE.test(galleryMd) ? FAIL_FRACTION_MERMAID : FAIL_FRACTION;
}

// Mermaid is detected per DECK rather than by directory, because decks are not bucketed.
const MERMAID_FENCE_RE = /^[ \t]*(?:```|~~~)[ \t]*mermaid\b/m;
export function failFractionForDeck(md) {
  try {
    return MERMAID_FENCE_RE.test(readFileSync(md, 'utf8')) ? FAIL_FRACTION_MERMAID : FAIL_FRACTION;
  } catch {
    return FAIL_FRACTION;
  }
}

export const THEMES = ['light', 'dark'];

// Every *.gallery.md under <root>/lib — per-component galleries, per-bucket survey
// galleries, and the hand-authored ones outside the components tree. Each has a committed
// <base>.gallery.{light,dark}.pdf golden pair. Rooted at `lib`, not `lib/components`
// (#1279: lib/base/_logo's goldens went stale unwatched under the narrower walk).
export function galleryDecks(root) {
  const out = [];
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.gallery.md')) out.push(p);
    }
  })(join(root, 'lib'));
  return out.sort();
}

// The gallery's display name: the basename without .gallery.md. Matches the `--only` token
// build-galleries / build-bucket-galleries accept.
export function galleryName(galleryMd) {
  return basename(galleryMd).replace(/\.gallery\.md$/, '');
}

export function goldenForGallery(galleryMd, theme) {
  return galleryMd.replace(/\.gallery\.md$/, `.gallery.${theme}.pdf`);
}

// ── Fresh renders ─────────────────────────────────────────────────────────────
// A gallery renders the same way build-galleries blesses the golden: emulator +
// dist/lattice.css + indaco, dark via injectDark.
//
// CRITICAL: the emulator resolves a deck's relative asset paths (`![bg](sample-image.svg)`,
// logo files) against the OUTPUT path's directory, not the source markdown's. So the fresh
// render MUST be written into the gallery's own directory — exactly as build-galleries
// does — or every image/logo slide renders blank and false-fails. A `.regr-` dotfile keeps
// it out of the committed tree; the caller removes it via the returned cleanup list.
export function renderGallery(root, galleryMd, theme) {
  const emulator = join(root, 'lattice-emulator.js');
  const themeCss = join(root, 'dist', 'lattice.css');
  const dir = dirname(galleryMd);
  const name = galleryName(galleryMd);
  const outPdf = join(dir, `.regr-${name}.${theme}.pdf`);
  const cleanup = [outPdf, outPdf.replace(/\.pdf$/, '.html')];
  try {
    if (theme === 'light') {
      execFileSync(process.execPath, [emulator, galleryMd, themeCss, outPdf, 'indaco', '-q'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      const tmpMd = join(dir, `.regr-${name}.${theme}.md`);
      cleanup.push(tmpMd, tmpMd.replace(/\.md$/, '.html'));
      writeFileSync(tmpMd, injectDark(readFileSync(galleryMd, 'utf8')));
      execFileSync(process.execPath, [emulator, tmpMd, themeCss, outPdf, 'indaco', '-q'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
  } catch (err) {
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
    throw err;
  }
  // Drop the injected dark source + every .html sidecar now; keep the PDF for the caller
  // to diff, then remove via the returned cleanup list.
  for (const p of cleanup) if (p !== outPdf && /\.(md|html)$/.test(p)) { try { rmSync(p, { force: true }); } catch { /* ignore */ } }
  return { outPdf, cleanup };
}

// A deck golden's fresh render. Same asset-resolution constraint as above.
//
// The invocation MUST match the producers' exactly — `build-staged-pdfs.js` (the
// pre-commit hook) and `build-exemplar-pdfs.js` both run `[EMULATOR, src, out]` with no
// CSS path and no palette argument, so the deck's own `theme:` front matter decides.
// Passing a theme CSS / palette the way the gallery path does would override the deck's
// theme and false-fail every deck that names another one.
export function renderDeck(root, md) {
  const emulator = join(root, 'lattice-emulator.js');
  const outPdf = join(dirname(md), `.regr-${basename(md, '.md')}.pdf`);
  const cleanup = [outPdf, outPdf.replace(/\.pdf$/, '.html')];
  try {
    execFileSync(process.execPath, [emulator, md, outPdf, '-q'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
    throw err;
  }
  try { rmSync(outPdf.replace(/\.pdf$/, '.html'), { force: true }); } catch { /* ignore */ }
  return { outPdf, cleanup };
}
