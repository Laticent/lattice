'use strict';

/**
 * notes-core — the pure, browser-safe presenter-notes extractor.
 *
 * LFM treats a non-directive HTML comment on a slide as that slide's speaker
 * note (Marp-faithful). This module is the SINGLE SOURCE for *what counts as a
 * note* — the note/non-note boundary — which is the part HARD RULE #1 protects
 * from drift. It does NOT itself materialize notes; each render path surfaces
 * them through its own channel, and they only stay consistent if they agree on
 * the boundary. Where each path stands today:
 *
 *   - lattice-emulator.js     — uses this module to embed each note as a
 *                               per-page PDF text annotation and a hidden
 *                               `aside.lattice-notes` element in the HTML
 *                               sidecar. This is the only path that materializes
 *                               notes itself.
 *   - lib/engine            — does NOT post-process notes; the engine collects
 *                               the *same* comments natively (its exclusion set
 *                               is the one mirrored below), so a user who runs
 *                               `marp --pdf-notes` / exports PPTX gets notes with
 *                               an identical boundary. The shipped Lattice PDF is
 *                               produced by the emulator, not marp.
 *   - dist/lattice-runtime.js — the VS Code preview does not surface notes today
 *                               (future work); when it does, it MUST extract them
 *                               through this module so the boundary still agrees.
 *
 * Like lint-core, this is pure and fs-free so it runs identically in Node, a CI
 * gate, and the browser.
 *
 * It operates on engine-RENDERED slide HTML, where Marpit/lib-engine has already
 * consumed directive comments (`_class`, `paginate`, …). What survives is either
 * a genuine note or a tooling pragma (markdownlint / prettier / remark-lint).
 * The pragma set below is copied verbatim from Marpit's own comment plugin
 * (node_modules/@marp-team/marpit/lib/markdown/comment.js → magicCommentMatchers)
 * so this extractor excludes exactly what marp-core excludes; the parity test in
 * test/unit/authoring/notes-core.test.js locks the two together.
 */

// Verbatim from Marpit's comment plugin (magicCommentMatchers). Tested against
// the trimmed comment body. Kept in sync by the parity test in
// test/unit/authoring/notes-core.test.js.
const MAGIC_COMMENT_MATCHERS = [
  // Prettier
  /^prettier-ignore(-(start|end))?$/,
  // markdownlint
  /^markdownlint-((disable|enable).*|capture|restore)$/,
  // remark-lint (remark-message-control)
  /^lint (disable|enable|ignore).*$/,
];

// Matches one HTML comment, capturing its body. Mirrors Marpit's commentMatcher
// (tolerant of extra dashes). Constructed fresh per call site to avoid shared
// lastIndex state. The body is trimmed in JS (notesFromHtml) rather than with
// `\s*` inside the pattern: a `\s*` adjacent to the non-greedy `[\s\S]*?` makes
// matching quadratic on an unterminated `<!--` (catastrophic backtracking / a
// render-DoS on a malformed deck). This form is linear.
const COMMENT_SOURCE = '<!--+([\\s\\S]*?)--+>';

/**
 * Is this (trimmed) comment body a tooling pragma rather than a speaker note?
 * @param {string} body comment body, leading/trailing space already irrelevant
 * @returns {boolean}
 */
function isToolingComment(body) {
  const t = String(body == null ? '' : body).trim();
  return MAGIC_COMMENT_MATCHERS.some((re) => re.test(t));
}

// The accessible-description channel: a `<!-- describe: … -->` comment is the
// slide's WCAG SC 1.1.1 text alternative — an OBJECTIVE equivalent of what the
// slide shows, for someone who can't see it. It is NOT a speaker note (opposite
// register: notes are what you SAY, descriptions are what's THERE), and it must
// never be spoken or land in the presenter-notes field. So it is a CONSUMED
// structured comment: skipped by notesFromHtml, read by descriptionFromHtml, and
// (like notes) stripped from the rendered HTML by stripCommentNodes. It routes to
// its own sinks — PPTX image altText, HTML aria — never to addNotes.
// See engineering/decisions/2026-07-04-accessible-descriptions.md.
const DESCRIBE_MATCHER = /^describe\s*:/i;

/**
 * Is this (trimmed) comment body the slide's `describe:` accessibility
 * description (not a speaker note)?
 * @param {string} body
 * @returns {boolean}
 */
function isDescriptionComment(body) {
  return DESCRIBE_MATCHER.test(String(body == null ? '' : body).trim());
}

/**
 * Extract the speaker note for one slide from its rendered HTML.
 * Collects every surviving HTML comment, drops tooling pragmas AND the
 * accessibility-description comment (a different channel), trims, and joins
 * multiple comments with a blank line — matching Marpit, which records one entry
 * per comment per slide.
 * @param {string} sectionHtml rendered `<section>…</section>` HTML for a slide
 * @returns {string|null} the slide's note, or null when it has none
 */
function notesFromHtml(sectionHtml) {
  const re = new RegExp(COMMENT_SOURCE, 'g');
  const bodies = [];
  for (const m of String(sectionHtml == null ? '' : sectionHtml).matchAll(re)) {
    const body = m[1].trim();
    if (!body || isToolingComment(body) || isDescriptionComment(body)) continue;
    bodies.push(body);
  }
  return bodies.length ? bodies.join('\n\n') : null;
}

/**
 * Extract the accessibility description for one slide from its rendered HTML —
 * the `describe:` comment's body, prefix stripped. Multiple describe comments
 * join with a space (a slide's description is conceptually one string).
 * @param {string} sectionHtml rendered `<section>…</section>` HTML for a slide
 * @returns {string|null} the description, or null when the slide has none
 */
function descriptionFromHtml(sectionHtml) {
  const re = new RegExp(COMMENT_SOURCE, 'g');
  const parts = [];
  for (const m of String(sectionHtml == null ? '' : sectionHtml).matchAll(re)) {
    const body = m[1].trim();
    if (!isDescriptionComment(body)) continue;
    const text = body.replace(DESCRIBE_MATCHER, '').trim();
    if (text) parts.push(text);
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Per-slide accessibility descriptions, index-aligned with the input slides
 * (mirrors extractSlideNotes). `descriptions[i]` is the description for
 * `slides[i]` (or null).
 * @param {string[]|string} slidesHtml
 * @returns {(string|null)[]}
 */
function extractSlideDescriptions(slidesHtml) {
  const arr = Array.isArray(slidesHtml) ? slidesHtml : [slidesHtml];
  return arr.map(descriptionFromHtml);
}

/**
 * Extract per-slide notes from an array of rendered slide-HTML strings.
 * The result is index-aligned with the input, so `notes[i]` is the note for
 * `slides[i]` (or null). Pass the same array the renderer paginates from so the
 * indices never drift.
 * @param {string[]|string} slidesHtml
 * @returns {(string|null)[]}
 */
function extractSlideNotes(slidesHtml) {
  const arr = Array.isArray(slidesHtml) ? slidesHtml : [slidesHtml];
  return arr.map(notesFromHtml);
}

/**
 * Remove every HTML comment node from a slide's HTML. The note/pragma comments
 * are invisible authoring artifacts in the rendered output; once their text has
 * been lifted into the structured channel, stripping them keeps the note text
 * from appearing twice in the HTML sidecar.
 * @param {string} sectionHtml
 * @returns {string}
 */
function stripCommentNodes(sectionHtml) {
  return String(sectionHtml == null ? '' : sectionHtml).replace(
    new RegExp(COMMENT_SOURCE, 'g'),
    ''
  );
}

module.exports = {
  MAGIC_COMMENT_MATCHERS,
  isToolingComment,
  isDescriptionComment,
  notesFromHtml,
  extractSlideNotes,
  descriptionFromHtml,
  extractSlideDescriptions,
  stripCommentNodes,
};
