/**
 * The code-package DOOR's shared kernel (contract note §9): what the CLI's door
 * (lib/packages/code-door.js) and the Studio's (docs/src/lib/code-packages/) must do the same
 * way, so they cannot drift (HARD RULE #1). Pure string work, no DOM and no Node built-ins: ESM,
 * so the docs bundle imports it directly, and the CLI `require`s it (Node 22 loads ESM that way).
 *
 *   claimedSlides   which slides a package runs on — the chart dispatch's first-match rule
 *   spliced         a package's sanitized section put back: the engine's tag, the package's
 *                   classes and body, the engine's comments and styles
 *   withFailureNote the engine's slide, kept, with a visible note saying why the package did not draw it
 *   printableLine   a stranger's text flattened to one line safe for a terminal or a note
 *
 * The sanitizing and the address rule are the sanitizer's (lib/core/sanitize-slide-html.mjs with
 * lib/core/remote-ref.js `doorFilterAttr`), which both doors run in a page.
 */

import { splitSections } from '../core/split-sections.mjs';

/** The contract's limit per slide. */
export const SLIDE_MS = 2000;
/** The longest reason a note on a slide carries. */
export const NOTE_CHARS = 300;

/**
 * Every shipped component whose own transform draws its slides, from the generated package index
 * (lib/packages/packages.generated.json): the engine's claims, which come before any package's.
 * @param {{ packages: Array<{ type: string, name: string, code?: boolean }> }} index
 */
export function engineClaimsOf(index) {
  return Object.freeze(index.packages.filter((p) => p.type === 'component' && p.code).map((p) => p.name));
}

/** Text safe to print to a terminal: control characters (an ESC sequence in a file name) become `?`. */
export function printable(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
  return String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '?');
}

/**
 * A stranger's text as ONE printable line: `printable`, and also newlines, tabs, the Unicode line
 * and paragraph separators and the direction controls, each a `?`. A package's thrown message or
 * console line could otherwise start a line of its own that reads like ours ("approved", "OS
 * sandbox on"), or reverse the text around it (the red team).
 */
export function printableLine(s) {
  return printable(s).replace(/[\t\n\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Which slides a door runs: walk ONE ordered list, as the chart dispatch does, and take the first
 * name the section's classes hold. The list is the engine's claims (shipped components with a
 * transform: the engine already drew those slides), then the installed code packages by name. So
 * `bar tally` is a bar chart and `tally` never runs, and a slide naming two packages goes to the
 * first by name, never to both. Only TRANSFORM components claim: the engine stamps `content` on
 * ordinary sections and `content` is a shipped component, so a list of every shipped name claimed
 * every slide (the CLI door's first run).
 * @param {string} html  the engine's finished deck render
 * @param {{ packages: string[], engineClaims: Iterable<string> }} opts
 * @returns {Array<{ i: number, pkg: string, index: number, html: string }>}  `i` indexes splitSections' parts
 */
export function claimedSlides(html, { packages, engineClaims }) {
  const order = [...engineClaims, ...[...packages].sort()];
  const isPackage = new Set(packages);
  const out = [];
  let index = 0;
  splitSections(html).forEach((part, i) => {
    if (part.type !== 'section') return;
    const cls = new Set(String(part.cls || '').split(/\s+/).filter(Boolean));
    const first = order.find((n) => cls.has(n));
    if (first && isPackage.has(first)) out.push({ i, pkg: first, index, html: part.openTag + part.inner + part.close });
    index++;
  });
  return out;
}

/** Replace some of `html`'s top-level parts (by splitSections index) and join it back. */
export function replaceParts(html, replacements) {
  return splitSections(html)
    .map((p, i) => (replacements.has(i) ? replacements.get(i) : p.type === 'section' ? p.openTag + p.inner + p.close : p.text))
    .join('');
}

/**
 * What the engine put in a section that the sanitizer removes from a package's output: the
 * author's comments (speaker notes, captions) and the deck's `<style>` blocks, in order.
 */
const carriedOf = (section) => section.match(/<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi) || [];

/** The engine's section, kept, with a visible note saying why the package did not draw it. */
export function withFailureNote(section, pkg, why) {
  const name = escapeHtml(printableLine(pkg));
  const note = `<p data-package-error="${name}" role="note">The code package “${name}” did not draw this slide: ${escapeHtml(printableLine(String(why).slice(0, NOTE_CHARS)))}</p>`;
  return section.replace(/<\/section>\s*$/i, `${note}</section>`);
}

/**
 * Put a package's sanitized section in place of the engine's. The `<section>` TAG stays the
 * engine's: its id, slide attributes and style are what the export, the player and the notes
 * read, so a package may not rewrite them. The package gives only the class list (which kept
 * every class the engine gave; the sanitizer page checked) and the body; the engine's comments
 * and styles go back in after it.
 * @param {string} original  the section the package was handed
 * @param {string} clean     the sanitized output
 * @param {string[]} classes the output section's classes
 */
export function spliced(original, clean, classes) {
  const openOrig = /^<section\b[^>]*>/i.exec(original)?.[0];
  // Trimmed first: whitespace around the one section is not content (a template literal's newline
  // around the output crashed the first splice; the checker).
  const out = String(clean).trim();
  const openClean = /^<section\b[^>]*>/i.exec(out)?.[0];
  if (!openOrig || !openClean || !/<\/section>$/i.test(out)) throw new Error('not one <section>');
  const cls = classes.filter((c) => /^[A-Za-z0-9_-]+$/.test(c)).join(' ');
  const tag = /\sclass="[^"]*"/i.test(openOrig) ? openOrig.replace(/\sclass="[^"]*"/i, ` class="${cls}"`) : openOrig.replace(/^<section\b/i, `<section class="${cls}"`);
  const body = out.slice(openClean.length).replace(/<\/section>$/i, '');
  return `${tag}${body}${carriedOf(original).join('')}</section>`;
}
