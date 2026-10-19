/**
 * lib/core/bg-lift.js — the class-aware `![bg]` lift, split from bg-image.js.
 *
 * It reads a deck's slides with the engine's own markdown-it boundaries (lib/core/slide-class-spans.js), so it
 * carries the boundary parser with it. bg-image.js also ships in the viewer runtime (lib/runtime/index.js),
 * which never lifts: kept there, the lift put markdown-it into every exported player (+23.7KB gz, caught by
 * docs/scripts/check-route-budget.mjs on #2776). Pure: no fs, no DOM.
 */

const { BG_RE, bgDiv } = require('./bg-image');
const { deckClassTokensFromFrontMatter } = require('./deck-class-register');
const { slideClassSpans } = require('./slide-class-spans');
const { FRONT_MATTER } = require('./boundary-parser');

// Class-aware lift for the shared engine: lift `![bg]` to the lattice-bg div ONLY
// inside `image`-class slides (per-slide `_class:`, a `class:` run, or front-matter `class:`), so a non-image full-bleed `![bg]` keeps the
// engine's marp-web section-background behavior. Idempotent: a slide whose `![bg]` is already lifted (the emulator
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
// WHICH SLIDE a line is on, and its class, come from the engine's own boundaries
// (lib/core/slide-class-spans.js): every thematic-break form, a setext underline read as a heading, and the
// default `split: headings` divider. This was a line walk that modeled each of those by hand, and three rounds
// of a differential check against the engine kept finding cases it got wrong; the worst was a setext `h2` that
// `split: headings` turns into a slide boundary, which put the picture on the wrong slide. Only a `![bg]` in
// prose is lifted (an `inline` token, or an HTML block that is not a comment, where the lift always worked): one in a
// fence, an indented code block or an HTML comment is quoted text.
// `frontMatter` is the deck's front matter when `md` is a body without it: the split mode is read there, as the
// engine reads it from `env.markdown`.
const classHasImage = (payload) => payload.replace(/^["']|["']$/g, '').split(/\s+/).includes('image');
function liftImageBgImages(md, baseDir, samplesUrl, assetUrls, frontMatter = '') {
  if (typeof md !== 'string' || md.indexOf('![bg') === -1) return md;
  // A caller that hands its front matter separately has a body, and a body may itself open with a `---` block
  // that is a slide, not front matter. Only a caller that hands none gets `md` read for its own.
  const prefix = typeof frontMatter === 'string' ? frontMatter : '';
  const full = prefix + md;
  const { spans, tokens, lineOffset } = slideClassSpans(full, { panes: false });
  // A front-matter `class:` starts the run, but only the tokens the engine itself admits
  // (lib/core/deck-class-register.js), and only from a block that closes. The register refuses a
  // component name such as `image` as a deck class, so the engine never stamps it; lifting on it
  // would draw an empty panel on a slide that is not `image`.
  const fm = full.slice(full.charCodeAt(0) === 0xfeff ? 1 : 0).match(FRONT_MATTER);
  const fmClass = fm ? deckClassTokensFromFrontMatter(fm[0].replace(/^---\r?\n?|\r?\n?---(?:\r?\n)?$/g, '')).join(' ') : '';
  const lineEnd = (k) => (k + 1 < lineOffset.length ? lineOffset[k + 1] : full.length);
  const edits = [];
  for (const t of tokens) {
    const prose = t.type === 'inline' || (t.type === 'html_block' && !/^[ \t]*<!--/.test(t.content));
    if (!prose || !Array.isArray(t.map) || t.content.indexOf('![bg') === -1) continue;
    for (let k = t.map[0]; k < t.map[1] && k < lineOffset.length; k++) {
      const start = lineOffset[k];
      const end = lineEnd(k);
      const line = full.slice(start, end);
      if (line.indexOf('![bg') === -1) continue;
      const span = spans.find((x) => start >= x.start && start < x.end);
      if (!classHasImage(span?.slideClass || fmClass)) continue;
      edits.push([start, end, line.replace(BG_RE, (_w, kw, url) => bgDiv(kw, url, baseDir, samplesUrl, assetUrls))]);
    }
  }
  if (!edits.length) return md;
  let out = '';
  let at = 0;
  for (const [start, end, text] of edits.sort((x, y) => x[0] - y[0])) {
    if (start < at) continue;
    out += full.slice(at, start) + text;
    at = end;
  }
  return (out + full.slice(at)).slice(prefix.length);
}

module.exports = { liftImageBgImages };
