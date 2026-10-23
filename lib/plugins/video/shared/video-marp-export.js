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

const LINE = /^((?:\s*>)*\s*(?:(?:[-*+]|\d+[.)])\s+)?)`@video(\{.*\})`\s*$/;
// Every character that is Markdown or HTML punctuation in a label is escaped, so a title the engine prints as text stays text.
const escLabel = (s) => String(s).replace(/[\\`*_[\]<>&]/g, '\\$&');
// The destination cannot end the link early: parentheses, brackets, angle brackets and spaces are percent-encoded.
const escUrl = (u) => String(u).replace(/[()[\]<> \t]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/**
 * @param {string} markdown
 * @param {{ off?: boolean }} [opts] `off`: the video plugin is switched off, so the engine prints the record as code and so does the bundle
 * @returns {string}
 */
function withVideoLinks(markdown, opts = {}) {
  const src = String(markdown ?? '');
  if (opts.off || !src.includes('`@video{')) return src;
  const slot = compileSlot(SPEC);
  let fence = null;
  let prev = '';
  let prevInside = false;
  return src.split('\n').map((line) => {
    const step = fenceStep(line, fence);
    fence = step.state;
    const before = prev;
    const afterFence = prevInside; // the line above was a fence line: a closing fence leaves the next line a block of its own
    prev = line;
    prevInside = step.inside;
    if (step.inside) return line;
    const m = LINE.exec(line);
    if (!m) return line;
    // Only where the engine would draw it: a paragraph (or list item, or quote) of its own. Four spaces of indent is an indented code
    // block, and a bare record right under a line of text is that paragraph's continuation.
    const marker = /[-*+>]|\d+[.)]/.test(m[1]);
    if (!marker && /^( {4,}|\t)/.test(m[1])) return line;
    if (!marker && before.trim() !== '' && !afterFence) return line;
    const r = slot.read(m[2]);
    const p = r.ok ? detectProvider(String(r.value.url || '')) : null;
    if (!p) return line;
    const label = (r.value.title && String(r.value.title).trim()) || `Watch on ${p.label}`;
    return `${m[1]}[${escLabel(label)}](${escUrl(p.url)})`;
  }).join('\n');
}

module.exports = { withVideoLinks };
