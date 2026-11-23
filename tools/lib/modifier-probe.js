/**
 * tools/lib/modifier-probe.js — the pure half of tools/check-modifier-effects.js: how a
 * component sample is read, and how it is topped up so every content surface is EXERCISED
 * before a surface is called inert.
 *
 * Split out so it can be tested without launching Chromium (the check renders every
 * component, about 200s).
 *
 * An EYEBROW is a lone inline-code line directly above the heading, and the renderer decides
 * it the same way: a code span above a chart body that parses as a bracketed list is the
 * chart's AXIS (lib/core/lift-bracket-span.js, which asks `parseBracketList`), anything else
 * is an eyebrow. The probe asks the same parser, so it cannot mistake an axis line for an
 * eyebrow and leave the eyebrow surface unexercised (which read as inert on gantt, radar,
 * quadrant, scatter, ep-curve and histogram).
 */

const { parseBracketList } = require('@laticent/segno/read');
const { readMetaField } = require('../../lib/core/meta-edit.mjs');
const { slideClassValue } = require('../../lib/core/class-entries.mjs');

/** A component sample, as `{ tokens, body }`: the class tokens it already carries and the slide below them. */
function splitSample(md, name) {
  const first = String(md || '').split(/\n---\s*\n/)[0];
  // The sample's class, a `_class` comment or a record (`@meta{layout=…}`), as the engine resolves it (`slideClassValue`);
  // the editor's reader (`readMetaField`) only finds the comment's span, so it comes out of the body whole.
  const value = slideClassValue(first);
  const cls = value ? readMetaField(first, 'class') : null;
  const tokens = value ? value.split(/\s+/).filter(Boolean) : [name];
  const body = cls?.commentSpan ? first.slice(0, cls.commentSpan[0]) + first.slice(cls.commentSpan[1]) : first;
  return { tokens: tokens[0] === name ? tokens.slice(1) : tokens, body: body.trim() };
}

/** Is this line an eyebrow — a lone code span the renderer would not lift as a bracketed construct? */
function isEyebrowLine(line) {
  const m = /^\s*`([^`]+)`\s*$/.exec(line);
  return Boolean(m) && parseBracketList(m[1]) == null;
}

/**
 * The first sample with canonical content for each content surface it lacks, so a
 * surface is only called inert after it was EXERCISED: an eyebrow line directly
 * above the first heading (the position the eyebrow CSS matches), a heading, and
 * a small table at the end. Returns null when the sample already has all three.
 */
function exercised(sample) {
  let body = sample.body;
  const lines = body.split('\n');
  const hasHeading = lines.some((l) => /^#{1,6}\s+\S/.test(l));
  const hasTable = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(body);
  const eyebrowAboveHeading = lines.some((l, i) => isEyebrowLine(l) && /^#{1,6}\s/.test(lines.slice(i + 1).find((x) => x.trim()) || ''));
  if (hasHeading && hasTable && eyebrowAboveHeading) return null;
  if (!hasHeading) body = `## Probe heading\n\n${body}`;
  if (!eyebrowAboveHeading) body = body.replace(/^(#{1,6}\s+\S)/m, '`PROBE · EYEBROW`\n\n$1');
  if (!hasTable) body = `${body}\n\n| Probe | Value |\n|---|---|\n| One | 1 |\n`;
  return { tokens: sample.tokens, body };
}

module.exports = { splitSample, isEyebrowLine, exercised };
