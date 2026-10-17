/**
 * lib/export/export-scaffold.js — the export DOCUMENT's own stylesheet and front-matter `style:`
 * reader, ONE copy for both hosts (HARD RULE #1).
 *
 * The CLI (lattice.js) and the Studio's Webpage export (share-export.ts) each built the document
 * the player is packed from, and they disagreed: the CLI's deck <style> carried the Marp system
 * rules, the skip link and the deck's `style:` block, and the Studio's carried none of them, so the
 * same deck gave two different players (decisions/2026-10-16-player-as-library-audit.md §11.9).
 * Both now call `exportDeckStyleText`. Moved here verbatim from lattice.js, so the CLI's bytes do
 * not move.
 *
 * Requires nothing, on purpose: the docs dev server's CommonJS shim serves only a module that
 * requires nothing (docs/src/plugins/vite-cjs-lib-dev.mjs).
 */

// Pagination uses the native Marp mechanism: the section carries a
// `data-lattice-pagination="N"` attribute, and `section::after` consumes it
// as the pseudo-element content. All visual styling (font, color, position)
// lives in lattice.css on `section::after` — see the !important block there.
// We only need the `content` rule here so the page number actually renders.
const MARP_SYSTEM_CSS = `
/* Marp system styles — pagination content binding.
   Header/footer positioning + section::after typography live in lattice.css
   so both the CLI and the Marp VS Code preview share identical coordinates. */

section { position: relative; }

section[data-lattice-pagination]::after {
  content: attr(data-lattice-pagination);
}

/* Speaker-notes channel: a hidden, non-printing per-slide aside. Pinned off
   explicitly so a theme styling bare <aside> can never leak it into the PDF. */
aside.lattice-notes { display: none !important; }

/* Accessible-description channel: visually hidden (sr-only) so it never prints on
   the slide or lands in the rasterized PNG, but — unlike display:none — it stays
   in the accessibility tree for a screen reader (the WCAG SC 1.1.1 alternative). */
.lattice-description {
  position: absolute !important;
  width: 1px !important; height: 1px !important;
  padding: 0 !important; margin: -1px !important;
  overflow: hidden !important; clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important; border: 0 !important;
}
`;

/**
 * The deck <style> body of an export document, before `sanitizeStyleText` (the caller embeds it).
 *
 * @param {object} p
 * @param {number} p.w            slide width in px
 * @param {number} p.h            slide height in px
 * @param {string} p.deckCss      the engine's flat deck sheet (lib/export/cli-deck-sheet.js shape)
 * @param {string} [p.startMark]  the CLI's palette-sweep sentinels (lib/core/export-shell-marks.js); '' elsewhere
 * @param {string} [p.endMark]
 * @param {string} [p.globalCss]  the deck's front-matter `style:` CSS, already packed and pane-widened
 */
function exportDeckStyleText({ w, h, deckCss, startMark = '', endMark = '', globalCss = '' }) {
  return `@page { size: ${w}px ${h}px; margin: 0; }
body  { margin: 0; padding: 0; }
${startMark}
${deckCss}
${endMark}
section[data-lattice-slide] { width: ${w}px !important; height: ${h}px !important; }
${MARP_SYSTEM_CSS}
/* Skip link — the keyboard bypass for a deck that is otherwise a flat pile of
   slides (WCAG 2.4.1). Off-screen rather than hidden, so it stays in the tab
   order; revealed on focus because a sighted keyboard user has to SEE it. The
   rules live HERE, inline, so a missing stylesheet can never leave it rendering
   visibly. Hidden in print: the exported PDF has no tab order, and an
   off-screen absolute box must not influence pagination. */
.lat-skip-link{position:absolute;left:-9999px;top:0;z-index:9999;padding:10px 16px;background:var(--accent,#4338ca);color:var(--on-accent,#fff);font:600 14px/1.2 system-ui,sans-serif;text-decoration:none}
.lat-skip-link:focus{left:0}
@media print{.lat-skip-link{display:none}}
/* The deck landmark adds no box of its own — the slides keep their own geometry. */
main#deck{margin:0;padding:0;display:block}
/* …EXCEPT in the FLUID viewer, where interposing any element between <body> and the
   slides is NOT layout-neutral. base.fluid-view.css makes <body> a centered flex column
   and sizes each slide with min(100%, 100dvh * --fill-max-aspect). That percentage
   resolves against the slide's PARENT — so once <main> sits in between, body's
   align-items:center shrink-to-fits it, the percentage resolves against a
   content-derived width, and every slide collapses to ZERO WIDTH. The viewer
   self-activates on load, so a recipient double-clicking the exported .html saw a
   blank page.
   The ADR's §10-R4 argument for this being the one sanctioned wrap — "<main> has no UA
   margin and the theme CSS is section-scoped" — is about MARGINS and SPECIFICITY. It
   never considered CONTAINING BLOCKS, which is what "never wrap" (§2 reason 1)
   actually protects. A wrapper adds no box and still changes layout.
   Fix: make <main> transparent to the flex column — same axis, full width — so the
   slides resolve their percentage against the same box they did before. */
:root[data-lattice-view="fluid"] main#deck{display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;flex:1 0 auto}
${globalCss ? `\n/* Front-matter style: directive */\n${globalCss}\n` : ''}`;
}

function readGlobalStyle(fmText) {
  const inline = fmText.match(/^\s*style:\s*(["'])([\s\S]*?)\1\s*$/m);
  if (inline) return inline[2];
  // `(?=^\S|$(?![\s\S]))` — stop at the next top-level YAML key or at the
  // absolute end of the frontmatter string. JS regex has no `\Z` anchor,
  // so we spell end-of-input as `$` with a negative lookahead for any
  // remaining characters.
  const block = fmText.match(/^\s*style:\s*\|\s*\r?\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^ {2}/, '')) // strip the YAML indent (≥2 spaces)
      .join('\n')
      .trimEnd();
  }
  return '';
}

module.exports = { MARP_SYSTEM_CSS, exportDeckStyleText, readGlobalStyle };
