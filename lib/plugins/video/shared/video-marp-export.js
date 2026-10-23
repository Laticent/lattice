/**
 * lib/plugins/video/shared/video-marp-export.js — what an `@video{…}` record becomes in an Export-to-Marp bundle.
 *
 * Marp runs none of Lattice's markdown-it rules, and the runtime refuses to draw an `address` kind on the DOM (the
 * address comes only from the author's span at parse time, engineering/decisions/2026-10-16-media-plugins.md § 4.5), so a
 * record would print as a line of inline code. The bundle kernel rewrites the SOURCE instead: a record that stands alone on
 * its line becomes a plain Markdown link to the clip's watch address, labeled with the record's title (else "Watch on
 * <provider>"). The poster and the play badge are not drawn; lib/core/marp-fidelity.js says so in the bundle's README.
 * A record the engine would leave as code (an unknown host, an unreadable record, one inside running text or a fence)
 * is left as written.
 */
const { compileSlot } = require('../../../core/segno-spec.js');
const { detectProvider } = require('../../../core/video-providers.mjs');
const { SPEC } = require('../video.inline.js');
const { fenceStep } = require('../../../core/video-migrate.js');

// A record alone at the left margin, nothing else on its line. Quotes, list items and indented lines are left as code on purpose.
const LINE = /^`@video(\{[^\r\n]*\})`[ \t]*$/;
// Every character that is Markdown or HTML punctuation in a label is escaped, so a title the engine prints as text stays text.
const escLabel = (s) => String(s).replace(/[\\`*_~[\]<>&]/g, '\\$&');
// The destination cannot end the link early or change host: parentheses, brackets, angle brackets, spaces and backslashes are
// percent-encoded, and `&` is written `&amp;`, which Markdown reads back as exactly `&` (a bare `&sol;` would be decoded into a `/`).
const escUrl = (u) => String(u)
  .replace(/[()[\]<> \t\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
  .replace(/&/g, '&amp;');

/**
 * Rewrite only where the engine CERTAINLY draws the record, and leave every other record as the code the engine may print: a
 * record that is its own paragraph at the left margin (a blank line above and below, or the edge of the file), outside any fence.
 * Where a fence-looking run sits inside a quote, a list item or an indented block, the rest of the file is left alone, because
 * whether it opens a fence depends on how that container ends. A record left as code is the safe failure; a link where the engine
 * shows code is a divergence.
 * @param {string} markdown
 * @param {{ off?: boolean }} [opts] `off`: the video plugin is switched off, so the engine prints the record as code and so does the bundle
 * @returns {string}
 */
function withVideoLinks(markdown, opts = {}) {
  const src = String(markdown ?? '');
  if (opts.off || !src.includes('`@video{')) return src;
  const slot = compileSlot(SPEC);
  const lines = src.split('\n');
  let fence = null;
  let uncertain = false;
  return lines.map((line, i) => {
    const step = fenceStep(line, fence);
    fence = step.state;
    if (step.container) uncertain = true;
    if (step.inside || uncertain) return line;
    const m = LINE.exec(line);
    if (!m) return line;
    if (i > 0 && lines[i - 1].trim() !== '') return line;
    if (i + 1 < lines.length && lines[i + 1].trim() !== '') return line;
    const r = slot.read(m[1]);
    const p = r.ok ? detectProvider(String(r.value.url || '')) : null;
    if (!p) return line;
    const label = (r.value.title && String(r.value.title).trim()) || `Watch on ${p.label}`;
    return `[${escLabel(label)}](${escUrl(p.url)})`;
  }).join('\n');
}

module.exports = { withVideoLinks };
