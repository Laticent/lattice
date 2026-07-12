/**
 * lib/core/glossary-auto.mjs
 *
 * Auto-glossary: give the author acronym registry's `definition` field a surface (#920).
 * The `acronyms:` front-matter (#905) stores an optional one-sentence `definition` per term
 * that `resolve-captions.mjs` parses but nothing consumed — narration speaks only the
 * `expansion`. When a deck opts in with front-matter `glossary: auto`, this appends a
 * reference-appendix slide built from those definitions, reusing the shipped `glossary`
 * component (HARD RULE #15) — so it renders on EVERY surface (PDF/PPTX/HTML/Studio) by
 * construction, since it's a source transform → a normal slide, not per-surface UI.
 *
 * Design + the confirmed axes (surface = generated slide + manifest field; trigger =
 * front-matter `glossary: auto`): 2026-07-11-manifest-speech-contract.md §18.
 *
 * SHARED (HARD RULE #1): one transform, run at both render chokepoints — the CLI/export
 * builds `rawMd` through it, and the docs site runs it in `render-engine.ts renderMarkdown`
 * (the single point every docs render surface passes through). The append is IDEMPOTENT the
 * same way `bake-splits.js` is: it strips the `glossary:` trigger from the emitted source, so
 * the result is self-contained — a re-render or a `.html` round-trip renders the literal
 * glossary slide once and never regenerates it.
 *
 * Pure (no fs); reuses `parseNarrationFrontMatter` so the registry is parsed in exactly one
 * place. ESM to import that ESM parser cleanly; the CJS emulator `require()`s this (Node's
 * require-of-ESM, warning-free on the engine's Node baseline).
 */

import { parseNarrationFrontMatter } from './resolve-captions.mjs';

const FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/** The raw `glossary:` scalar from the front matter (lowercased), or null. A flat scalar
 *  read, matching the house "no multi-line front-matter values" assumption. */
function readFrontMatterGlossary(md) {
  if (typeof md !== 'string' || !md.length) return null;
  const m = md.match(FRONT_MATTER);
  if (!m) return null;
  const g = m[1].match(/^[ \t]*glossary:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m);
  return g ? g[1].trim().toLowerCase() : null;
}

/** Resolve the glossary mode → 'auto' | 'off'. Absent / unrecognized → 'off' (the default;
 *  no glossary generated, deck byte-identical). Only the explicit `glossary: auto` opts in. */
function resolveGlossaryMode(md) {
  return readFrontMatterGlossary(md) === 'auto' ? 'auto' : 'off';
}

/**
 * The registry entries that HAVE a definition, sorted alphabetically by term (case-insensitive
 * so `ARR` and `arr` sort together; the `glossary` component derives its A–Z range pill from the
 * first/last term). An expansion-only entry is omitted — there's nothing to define. Returns
 * `[{ term, definition }]`; the term→definition surface for both the generated slide and the
 * export manifest projection.
 */
function glossaryEntries(md) {
  const { acronyms } = parseNarrationFrontMatter(md);
  const out = [];
  for (const [term, entry] of acronyms) {
    if (entry && typeof entry.definition === 'string' && entry.definition.trim()) {
      out.push({ term, definition: entry.definition.trim() });
    }
  }
  out.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
  return out;
}

/**
 * Build the `glossary`-component slide markdown from entries: the `_class: glossary` directive,
 * a `## Glossary` heading, and the nested `- Term` / `  - Definition` list the component's
 * `glossaryListToTable` transform reshapes into a two-column table. A term/definition is emitted
 * verbatim (the component renders inline markdown); a stray newline in a definition is collapsed
 * so it can't break the one-line-per-item list grammar.
 */
function buildGlossarySlideMarkdown(entries) {
  const oneLine = (s) => String(s).replace(/\s*\r?\n\s*/g, ' ').trim();
  const lines = ['<!-- _class: glossary -->', '', '## Glossary', ''];
  for (const { term, definition } of entries) {
    lines.push(`- ${oneLine(term)}`);
    lines.push(`  - ${oneLine(definition)}`);
  }
  return lines.join('\n');
}

/** Remove the `glossary:` line from a front-matter block — the trigger is consumed, so the
 *  emitted source is self-contained and never regenerates (the bake-splits idempotency pattern). */
function stripGlossaryLine(fm) {
  return fm.replace(/^[ \t]*glossary:[^\n]*\r?\n?/m, '');
}

/**
 * Append the auto-glossary slide to a deck's source when it opts in with `glossary: auto` AND
 * the registry has ≥1 defined term. Returns the source UNCHANGED otherwise (no trigger, or no
 * definitions → a no-op, never an empty glossary). On append: the `glossary:` trigger is stripped
 * from the front matter and a `<!-- _class: glossary -->` slide is appended after a `---` break,
 * so the result is self-contained and idempotent. Pure.
 */
function appendAutoGlossary(md) {
  const src = typeof md === 'string' ? md : '';
  if (resolveGlossaryMode(src) !== 'auto') return src;
  const entries = glossaryEntries(src);
  if (!entries.length) return src;
  const slide = buildGlossarySlideMarkdown(entries);
  const fmMatch = src.match(FRONT_MATTER);
  let head = src;
  if (fmMatch) {
    const strippedFm = stripGlossaryLine(fmMatch[1]);
    head = `---\n${strippedFm.replace(/\r?\n$/, '')}\n---\n${src.slice(fmMatch[0].length)}`;
  }
  return `${head.replace(/\s+$/, '')}\n\n---\n\n${slide}\n`;
}

export {
  appendAutoGlossary,
  buildGlossarySlideMarkdown,
  glossaryEntries,
  readFrontMatterGlossary,
  resolveGlossaryMode,
};
export default { readFrontMatterGlossary, resolveGlossaryMode, glossaryEntries, buildGlossarySlideMarkdown, appendAutoGlossary };
