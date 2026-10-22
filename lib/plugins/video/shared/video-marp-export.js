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

const LINE = /^((?:\s*>)*\s*(?:(?:[-*+]|\d+[.)])\s+)?)`@video(\{.*\})`\s*$/;
const escLabel = (s) => String(s).replace(/[[\]\\]/g, '\\$&');

/** @param {string} markdown @returns {string} */
function withVideoLinks(markdown) {
  const src = String(markdown ?? '');
  if (!src.includes('`@video{')) return src;
  const slot = compileSlot(SPEC);
  let fence = null;
  return src.split('\n').map((line) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) { fence = fence ? (f[1][0] === fence[0] && f[1].length >= fence.length ? null : fence) : f[1]; return line; }
    if (fence) return line;
    const m = LINE.exec(line);
    if (!m) return line;
    const r = slot.read(m[2]);
    const p = r.ok ? detectProvider(String(r.value.url || '')) : null;
    if (!p) return line;
    const label = (r.value.title && String(r.value.title).trim()) || `Watch on ${p.label}`;
    return `${m[1]}[${escLabel(label)}](${p.url})`;
  }).join('\n');
}

module.exports = { withVideoLinks };
