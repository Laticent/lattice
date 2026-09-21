/**
 * track-spec — the `_track` directive's grammar, parsed once for every reader.
 *
 * A `topic` slide's sibling track is DERIVED from the deck by default
 * (`lib/transformers/topic-track.js`). `_track` is the OVERRIDE, and it is a
 * labelled directive rather than a markdown list:
 *
 *     <!-- _track: Cost to win | Lifetime value | [Payback] | The assumptions -->
 *
 * Pipe-separated labels, left to right; the one in SQUARE BRACKETS is the topic
 * this slide is on. The engine stamps the value as `data-track` on the section
 * (`APPLIED_DIRECTIVES`), so both render arms read one string and cannot
 * disagree about what the author wrote.
 *
 * ── WHY A DIRECTIVE AND NOT A LIST ──────────────────────────────────────────
 *
 * The override used to be a bare markdown `<ul>` on the slide, which made one
 * piece of markup carry two questions the engine had to INFER:
 *
 *   · *is this list the track, or is it content?* — answered by a depth walk
 *     that had to tell a section's own list from one inside a blockquote, a
 *     card, a comment, or an unclosed tag;
 *   · *which item is current?* — answered by "the item that is wholly bold",
 *     which needed the text of every `<li>`, the `<p>` a loose list adds, and a
 *     `class` attribute rewrite that had to survive `class='x'` and `class=x`.
 *
 * Roughly half the defects five review rounds found on #2245 were one of those
 * two questions answered differently by the string arm and the DOM arm. The
 * directive answers both by construction: a slide has a track override when it
 * carries `_track` and never otherwise, and the current item is the one the
 * author put brackets around. The kernel then EMITS the track for an override
 * exactly as it does for a derived one — same markup, same `class="on"` — so
 * there is no author markup left to mark up.
 *
 * ── WHAT THIS GRAMMAR DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * No escape. `|` always separates, and an item that is WHOLLY bracketed is
 * always the marker, so a label cannot contain a pipe and a label cannot BE
 * `[TBD]`. Both are recorded rather than solved: an escape is a second grammar
 * for a case no shipped deck has, and the failure is visible on the slide
 * (a split label, a lit column) rather than silent.
 *
 * Brackets INSIDE a label are untouched — `Cost [net]` is one plain label — so
 * the rule only fires on a label that opens and closes with them. An EMPTY one
 * (`[]`, `[ ]`) costs its column rather than printing brackets on the slide:
 * every other degenerate item is dropped the same way, so a slip in the
 * directive shortens the scale instead of rendering the syntax.
 *
 * Pure: a string in, plain data out. No DOM, no fs, no markdown-it — the linter
 * (`lib/authoring/lint-core.js`, HARD RULE #7) and both render arms share it.
 */

/** Collapse whitespace the way a rendered label reads it. */
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Parse a `_track` value.
 *
 * @param {string} spec  the directive's value (or a section's `data-track`)
 * @returns {{ labels: string[], current: number }}
 *   `current` is the index of the first bracketed label, or -1 when the author
 *   marked none. Empty labels are dropped, so a stray `| |` costs a column
 *   rather than an empty one.
 *
 * MARKING TWICE LIGHTS THE FIRST, and the later marks lose their brackets with
 * it. Rendering `[Payback]` verbatim on a column would put the author's marker
 * syntax on the slide — which is the one place it must never appear.
 */
function parseTrackSpec(spec) {
  const labels = [];
  let current = -1;
  for (const raw of String(spec ?? '').split('|')) {
    const item = tidy(raw);
    if (!item) continue;
    const marked = item.length >= 2 && item.startsWith('[') && item.endsWith(']');
    const label = marked ? tidy(item.slice(1, -1)) : item;
    if (!label) continue;
    if (marked && current === -1) current = labels.length;
    labels.push(label);
  }
  return { labels, current };
}

/** How many columns a track needs before it is a scale at all. */
const MIN_TRACK_LABELS = 2;

module.exports = { parseTrackSpec, MIN_TRACK_LABELS };
