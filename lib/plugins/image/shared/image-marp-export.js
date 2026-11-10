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
const { readClassComment } = require('./image-migrate.js');

const LINE = /^`@image(\{[^\r\n]*\})`[ \t]*$/;
const SEPARATOR = /^---[ \t]*$/;
// Markdown punctuation in alt text and a title is escaped, so the words stay words.
const escText = (s) => String(s).replace(/[\\`*_~[\]<>&"]/g, '\\$&');
// The destination cannot end the link early: parentheses, angle brackets, spaces and backslashes are percent-encoded.
const escUrl = (u) => String(u).replace(/[()<> \t\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/**
 * @param {string} markdown
 * @param {{ off?: boolean }} [opts] `off`: the image plugin is switched off, so the engine prints the record as code and so does the bundle
 */
/** Markdown's picture alone on its line (not one already `![bg …]`): indent, alt, destination with its title. */
const ALIAS = /^( {0,3})!\[([^\]\n]*)\]\(([^)\n]+)\)[ \t]*$/;

function withImageMarkdown(markdown, opts = {}, ctx = undefined) {
  const src = String(markdown ?? '');
  if (opts.off || (!src.includes('`@image{') && !src.includes('!['))) return src;
  const slot = compileSlot(specFor(ctx.media));
  const lines = src.split('\n');
  // The front matter's own lines, and its deck-wide `class:` (a `bleed` or `image` there places every slide's picture).
  let start = 0;
  let deckClass = [];
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      start = end + 1;
      const c = lines.slice(1, end).find((l) => /^class[ \t]*:/.test(l));
      if (c) deckClass = c.replace(/^class[ \t]*:/, '').replace(/["'[\],]/g, ' ').trim().split(/\s+/);
    }
  }
  // The engine APPENDS the deck's `class:` to every slide's own, and drops a component name from it (lib/core/deck-class-register.js),
  // so a deck-wide `bleed` places every picture and a deck-wide `image` places none.
  const deckTokens = deckClass.filter((c) => c !== 'image' && c !== 'collage' && c !== 'video');
  // Each slide's classes: a `<!-- class: … -->` from here on, a `<!-- _class: … -->` for this slide only.
  const slideOf = [];
  let carried = [];
  let own = null;
  let slide = 0;
  const classesBySlide = [];
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const step = ctx.fenceStep(lines[i], fence);
    fence = step.state;
    if (!step.inside && SEPARATOR.test(lines[i])) {
      classesBySlide[slide] = own || carried;
      slide++;
      own = null;
    } else if (!step.inside) {
      const c = readClassComment(lines[i]);
      if (c) {
        if (c.local) own = c.words;
        else carried = c.words;
      }
    }
    slideOf[i] = slide;
  }
  classesBySlide[slide] = own || carried;

  // Is line i its OWN paragraph, as markdown-it reads it? The line above is blank, an ATX heading or a comment line (none of
  // them continues a paragraph), and the line below is blank, the end, a heading or a comment (each interrupts one). The engine
  // places `## Title` directly over `![x](y)`, so the export must too (inversion, F3).
  const ends = (l) => l === undefined || l.trim() === '' || /^ {0,3}#{1,6}(?:\s|$)/.test(l) || /^\s*<!--/.test(l);
  const alone = (i) => (i <= start || ends(lines[i - 1]) || /-->\s*$/.test(lines[i - 1])) && ends(lines[i + 1]);
  // The address the shortcut's destination names: `<…>` or the first word (a `"title"` may follow).
  const destOf = (d) => { const t = d.trim(); return t.startsWith('<') ? t.slice(1, t.indexOf('>') > 0 ? t.indexOf('>') : undefined) : t.split(/\s+/)[0]; };
  const isBgAlt = (alt) => /^bg(?:\s|$)/i.test(alt.trim());

  // The engine places the shortcut only when it is the slide's ONLY lone picture and the slide places no photo another way (a
  // `![bg]`, or a record): count per slide first (plugins.js `slidePictures`, `placesPhotoAlready`).
  const pictures = [];
  fence = null;
  for (let i = start; i < lines.length; i++) {
    const step = ctx.fenceStep(lines[i], fence);
    fence = step.state;
    if (step.inside) continue;
    if (/!\[\s*bg(?:\s|\])/i.test(lines[i]) || (LINE.test(lines[i]) && alone(i))) { pictures[slideOf[i]] = Infinity; continue; }
    const a = ALIAS.exec(lines[i]);
    if (!a || isBgAlt(a[2]) || !alone(i)) continue;
    pictures[slideOf[i]] = (pictures[slideOf[i]] || 0) + 1;
  }

  fence = null;
  let uncertain = false;
  return lines.map((line, i) => {
    if (i < start) return line;
    const step = ctx.fenceStep(line, fence);
    fence = step.state;
    if (step.container) uncertain = true;
    if (step.inside || uncertain) return line;
    const m = LINE.exec(line);
    const a = m ? null : ALIAS.exec(line);
    const alias = a && !isBgAlt(a[2]) ? a : null;
    if (!m && !alias) return line;
    if (!alone(i)) return line;
    if (alias) {
      // Markdown's picture is the record's shortcut: on a slide that places a picture the engine draws it as the panel, so Marp
      // gets `![bg]` with the destination exactly as written (the engine's own placement rule, plugins.js).
      const classes = [...(classesBySlide[slideOf[i]] || []), ...deckTokens];
      const placed = !classes.includes('collage') && (classes.includes('image') || classes.includes('bleed'));
      // The engine draws the shortcut through the record, so an address the record's allowlist refuses (`http:`) stays an
      // ordinary picture there, and here (inversion, F5).
      return placed && pictures[slideOf[i]] === 1 && ctx.media.addressOk(destOf(alias[3])) ? `${alias[1]}![bg](${alias[3]})` : line;
    }
    const r = slot.read(m[1]);
    // An address the scheme allowlist refuses stays code, as the engine leaves it (plugins.js `mediaWhere`).
    if (!r.ok || !ctx.media.addressOk(r.value.src)) return line;
    const url = escUrl(String(r.value.src).trim());
    const title = r.value.title ? String(r.value.title).trim() : '';
    const desc = r.value.description ? String(r.value.description).trim() : '';
    const classes = [...(classesBySlide[slideOf[i]] || []), ...deckTokens];
    // A collage packs every picture as a tile, the record's included (the engine's host table): never Marp's `![bg]` there.
    const placed = !classes.includes('collage') && (classes.includes('image') || classes.includes('bleed'));
    if (placed) return `![bg](${url}${desc ? ` "${escText(desc)}"` : ''})`;
    return `![${escText(title)}](${url}${desc ? ` "${escText(desc)}"` : ''})`;
  }).join('\n');
}

module.exports = { withImageMarkdown };
