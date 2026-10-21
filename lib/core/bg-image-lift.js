/**
 * lib/core/bg-image-lift.js — the SOURCE lift of `![bg]` to the image panel, for the Marp export only.
 *
 * Every render path lifts on the engine's own tokens now (lib/engine/background-image.js): the rule
 * reads the slide's resolved class, so the engine's slide boundaries and directives decide, with one
 * parse (followups.d/2739-p10). A Marp bundle still ships MARKDOWN, which Marp renders without that
 * rule, so the export rewrites the source and keeps this line walk (tools/export-marp.js,
 * docs/src/components/studio/export/deck-export.js). It lives apart from bg-image.js so the engine,
 * the playground bundle and the viewer runtime do not carry it.
 *
 * Known to disagree with the engine on a few shapes the walk does not model (a setext heading under
 * `split: headings`, `***` rules, a `---` inside `$$`, a directive indented as code); the measurement
 * is in followups.d/2739-p10's record, decisions/2026-10-16-player-as-library-audit.md §11.6.
 */

const { BG_RE } = require('./bg-directive');
const { bgDiv } = require('./bg-image');
const { deckClassTokensFromFrontMatter } = require('./deck-class-register');
const { readDirectiveComment, commentBodies } = require('./comment-directive');

// Class-aware lift for the shared engine: lift `![bg]` to the lattice-bg div ONLY
// inside `image`-class slides (per-slide `_class:`, a `class:` run, or front-matter `class:`), so a non-image full-bleed `![bg]` keeps the
// engine's marp-web section-background behavior. Splits on horizontal-rule slide
// separators (the body is already front-matter-stripped) and lifts per image
// slide. Idempotent: a slide whose `![bg]` is already lifted (the emulator
// pre-lifts) has no `![bg]` left, so this is a no-op there.
//
// The RUNNING form counts too: `<!-- class: image -->` (no underscore) is Marpit's global directive,
// in force from its slide onward until another `class:` replaces it, and a slide's own `_class:`
// overrides it for that slide (the engine's rule, lib/engine/slides.js). The CLI used to lift every
// `![bg]` (`liftBgImages`), so it got the running form right by accident; when it moved onto this
// function (2026-10-16, so a `![bg]` on a slide that is not `image` renders the same full-bleed
// background in both hosts), the running form had to be read here
// (decisions/2026-10-16-player-as-library-audit.md §11.6).
//
// Read as the engine reads it: a quoted value (`_class: "image"`) is unquoted, and a directive written
// inside a fenced code sample or an inline code span is not a directive at all. The checker found both
// with the first, regex-only cut; the second, in the running form, switched every later slide to
// `image`. (The linter's scanner, lib/core/class-directive-scan.mjs, answers the same question, but
// the playground build keeps the engine off the linter's boundary parser, so this is a line walk.)
// Each comment is parsed by the engine's own grammar (lib/core/comment-directive.js), asked about
// the one key this question needs; this file owns only the walk that finds the comments.
const SLIDE_SEPARATOR = /^---[ \t]*$/;
const CLASS_ONLY = { known: new Set(['class']) };
const classDirectivesIn = (text) => commentBodies(text).map((b) => readDirectiveComment(`<!--${b}-->`, CLASS_ONLY)).filter(Boolean);
const classHasImage = (payload) => payload.replace(/^["']|["']$/g, '').split(/\s+/).includes('image');
function liftImageBgImages(md, baseDir, samplesUrl, assetUrls) {
  if (typeof md !== 'string' || md.indexOf('![bg') === -1) return md;
  const lines = md.split('\n');
  // Pass 1: which lines open a slide, and each slide's spot / running class, outside code.
  const slideOf = [];
  const spot = [];
  const runningAt = [];
  let slide = 0;
  let fence = null;
  // An HTML comment still open from an earlier line. Its lines are one directive, as the engine
  // reads `<!--\n_class: image\n-->`, and a `---` inside it is not a slide break.
  let comment = null;
  const scan = (text) => {
    for (const d of classDirectivesIn(text)) {
      if (d.spot) spot[slide] = d.value;
      else runningAt[slide] = d.value;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (comment !== null) {
      comment += `\n${line}`;
      slideOf.push(slide);
      if (line.includes('-->')) {
        // markdown-it ends the block at this line, and Marpit reads it as ONE comment that runs to
        // the first `-->`: only a directive that opens it counts, not one that appears inside.
        const d = readDirectiveComment(comment.slice(0, comment.indexOf('-->') + 3), CLASS_ONLY);
        if (d) {
          if (d.spot) spot[slide] = d.value;
          else runningAt[slide] = d.value;
        }
        comment = null;
      }
      continue;
    }
    const f = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^[ \t]{0,3}[`~]+[ \t]*$/.test(line)) fence = null;
      slideOf.push(slide);
      continue;
    }
    if (f) {
      fence = f[1];
      slideOf.push(slide);
      continue;
    }
    if (SLIDE_SEPARATOR.test(line)) slide++;
    slideOf.push(slide);
    const text = line.replace(/`[^`]*`/g, '');
    // Only a `<!--` that opens the line starts an HTML block in markdown-it; one in the middle of
    // prose is text, and the slides after it still split.
    if (/^[ \t]{0,3}<!--/.test(text) && !text.includes('-->')) comment = text;
    else scan(text);
  }
  // A front-matter `class:` starts the run, but only the tokens the engine itself admits
  // (lib/core/deck-class-register.js), and only from a block that closes. The register refuses a
  // component name such as `image` as a deck class, so the engine never stamps it; lifting on it
  // would draw an empty panel on a slide that is not `image`.
  let fmClass = '';
  if (SLIDE_SEPARATOR.test(lines[0] || '')) {
    const close = lines.findIndex((l, i) => i > 0 && SLIDE_SEPARATOR.test(l));
    if (close !== -1) fmClass = deckClassTokensFromFrontMatter(lines.slice(1, close).join('\n')).join(' ');
  }
  // Pass 2: a running class holds from its slide on; a spot class wins on its own slide.
  const isImage = [];
  let running = fmClass;
  for (let k = 0; k <= slide; k++) {
    if (runningAt[k] !== undefined) running = runningAt[k];
    isImage[k] = classHasImage(spot[k] !== undefined ? spot[k] : running);
  }
  return lines.map((line, i) => (line.indexOf('![bg') !== -1 && isImage[slideOf[i]] ? line.replace(BG_RE, (_w, kw, url) => bgDiv(kw, url, baseDir, samplesUrl, assetUrls)) : line)).join('\n');
}

module.exports = { liftImageBgImages };
