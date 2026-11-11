/**
 * lib/plugins/image/shared/image-marp-export.js — what an `@image{…}` record becomes in an Export-to-Marp bundle (the bridge's
 * per-plugin translation, engineering/decisions/2026-10-15-bridges-and-two-hosts.md; media note §4.4, decision 2).
 *
 * Marp runs none of Lattice's markdown-it rules, and the runtime never draws an `address` kind on the DOM (§4.5), so a record would
 * print as a line of inline code. The bundle rewrites the SOURCE instead, into Marp's own spellings, which Marp and the bundled
 * runtime already place: on a slide whose layout places the picture (`image`, or a `bleed` slide) a record becomes `![bg](src)`,
 * which the bundle's source lift turns into the layout's panel (lib/core/bg-image-lift.js); anywhere else it becomes
 * `![title](src "description")`. The display words (frame, finish, tone, size) do not cross: Marp has no layer for them, and
 * lib/export/marp-fidelity.js says so in the bundle's README.
 *
 * The same narrowing as the video export (video-marp-export.js): only a record that is its own paragraph at the left margin,
 * outside any fence, is rewritten, and a fence-looking run inside a container switches the rewrite off for the rest of the file.
 * A record left as code is the safe failure.
 */
const { compileSlot } = require('@laticent/segno/read');
const { specFor } = require('../image.inline.js');

const LINE = /^`@image(\{[^\r\n]*\})`[ \t]*$/;
// Markdown punctuation in alt text and a title is escaped, so the words stay words.
const escText = (s) => String(s).replace(/[\\`*_~[\]<>&"]/g, '\\$&');
// The destination cannot end the link early: parentheses, angle brackets, spaces and backslashes are percent-encoded.
const escUrl = (u) => String(u).replace(/[()<> \t\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/**
 * @param {string} markdown
 * @param {{ off?: boolean, placement?: { classesOfLine: string[][], placedLines: Map<number, { src: string, title: string|null, lines: number }> } }} [opts] `off`: the image plugin
 *   is switched off, so the engine prints the record as code and so does the bundle. `placement`: the export host's reading of
 *   the deck (lib/export/picture-placement.js)
 */
/** Markdown's picture alone on its line (not one already `![bg …]`): indent, alt, destination with its title. */
const ALIAS = /^( {0,3})!\[([^\]\n]*)\]\(([^)\n]+)\)[ \t]*$/;

function withImageMarkdown(markdown, opts = {}, ctx = undefined) {
  const src = String(markdown ?? '');
  if (opts.off || (!src.includes('`@image{') && !src.includes('!['))) return src;
  const slot = compileSlot(specFor(ctx.media));
  const lines = src.split('\n');
  // Where the engine places each slide's picture, and each line's slide classes: read by the export host, which holds the parser
  // (lib/export/picture-placement.js, asking lib/core/placed-picture.mjs). Without it nothing is placed and a record is written
  // as a plain picture, the safe failure.
  const { classesOfLine = [], placedLines = new Map() } = opts.placement || {};
  const fmEnd = src.startsWith('---') ? lines.indexOf('---', 1) : -1;
  const start = fmEnd > 0 ? fmEnd + 1 : 0;

  // Is line i its OWN paragraph, as markdown-it reads it? The line above is blank, an ATX heading or a comment line (none of
  // them continues a paragraph), and the line below is blank, the end, a heading or a comment (each interrupts one). The engine
  // places `## Title` directly over `![x](y)`, so the export must too (inversion, F3).
  const ends = (l) => l === undefined || l.trim() === '' || /^ {0,3}#{1,6}(?:\s|$)/.test(l) || /^\s*<!--/.test(l);
  // The last line of a comment written over several lines ends its HTML block, as markdown-it closes a comment block on the
  // line that holds `-->` (a string check, not a regex: this reads a paragraph boundary and filters nothing).
  const alone = (i) => (i <= start || ends(lines[i - 1]) || lines[i - 1].trimEnd().endsWith('-->')) && ends(lines[i + 1]);

  let fence = null;
  let uncertain = false;
  return lines.map((line, i) => {
    if (i < start) return line;
    const step = ctx.fenceStep(line, fence);
    fence = step.state;
    if (step.container) uncertain = true;
    // Markdown's picture is the record's shortcut: where the engine draws it as the slide's panel, Marp gets `![bg]`. Which
    // picture that is, is the kernel's answer (lib/core/placed-picture.mjs), read from a real parse, so it needs none of the line
    // guesses below: the destination stays exactly as written when the line is the plain picture, and is written from the parse
    // when it is not (a title with parentheses, a reference picture, a CRLF line, a picture right under a setext heading).
    const placed = step.inside ? null : placedLines.get(i);
    if (placed) {
      // The bundle lifts `![bg](…)` into a raw `<div>` line, and an HTML block runs to the next blank line, so a line of text
      // right under it (`- a point`) would print as raw text: a blank line ends the block (the export comparison on #3132).
      const cr = line.endsWith('\r') ? '\r' : '';
      const end = lines[i + 1] !== undefined && lines[i + 1].trim() !== '' ? `\n${cr}` : '';
      const a = ALIAS.exec(line);
      if (a && !ctx.pictures.isMarpKeywordAlt(a[2])) return `${a[1]}![bg](${a[3]})${end}`;
      if (placed.lines !== 1) return line; // a picture over several lines stays as written, as before
      const indent = /^[ \t]*/.exec(line)[0];
      // The address alone: the bundle's lift reads `![bg](…)` up to the first `)` (lib/core/bg-directive.js `BG_RE`), so a title
      // holding a parenthesis would cut the address short, and a background draws no title anyway.
      return `${indent}![bg](${escUrl(placed.src)})${cr}${end}`;
    }
    if (step.inside || uncertain) return line;
    const m = LINE.exec(line);
    if (!m || !alone(i)) return line;
    const r = slot.read(m[1]);
    // An address the scheme allowlist refuses stays code, as the engine leaves it (plugins.js `mediaWhere`).
    if (!r.ok || !ctx.media.addressOk(r.value.src)) return line;
    const url = escUrl(String(r.value.src).trim());
    const title = r.value.title ? String(r.value.title).trim() : '';
    const desc = r.value.description ? String(r.value.description).trim() : '';
    // A collage packs every picture as a tile, the record's included (the engine's host table): never Marp's `![bg]` there.
    if (ctx.pictures.slidePlacesPicture(classesOfLine[i] || [])) return `![bg](${url}${desc ? ` "${escText(desc)}"` : ''})`;
    return `![${escText(title)}](${url}${desc ? ` "${escText(desc)}"` : ''})`;
  }).join('\n');
}

module.exports = { withImageMarkdown };
