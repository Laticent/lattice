/**
 * top-level-h2 — find a section's OWN title `<h2>`, never one nested inside its
 * content.
 *
 * ── WHY THIS IS A KERNEL AND NOT A REGEX ────────────────────────────────────
 *
 * The obvious `html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)` is DEPTH-BLIND: it
 * returns the first `<h2>` in the string, wherever it sits. A `<h2>` buried
 * inside a component's own card or panel (a QR card's `.qr-head > h2`, emitted
 * when a canvas component rebuilds its section before the masthead kernel runs)
 * is that component's in-card title, NOT the slide's title. The naive form lifts
 * it — the exact bug the wifi migration hit, recorded at the masthead kernel's
 * call site and pinned by `test/integration/parity/wifi-overflow-preserved.test.js`.
 *
 * This scan tracks element depth and only matches at depth 0, so it answers the
 * question every caller actually has: *what is THIS section's heading?*
 *
 * ── SHARED, NOT COPIED (HARD RULE #1, HARD RULE #15) ────────────────────────
 *
 * It lived inside `lib/forms/cell/masthead/masthead.transform.js` while it had
 * one caller. `lib/transformers/topic-track.js` is the second, so it moves here
 * rather than being cloned — a second copy is how the depth-blind form would
 * come back. Five other sites in the tree still hand-roll the naive regex
 * (`lib/core/premise.js`, `lib/core/split-envelope.js`, `lib/core/split-panels.js`
 * x2); they are pre-existing and off the path of the change that moved this, so
 * they are tracked rather than swept in (HARD RULE #18's off-path rule).
 *
 * String-level, deliberately: the engine path rewrites rendered HTML as a string
 * and has no DOM. A DOM caller wants `:scope > h2` and needs none of this.
 */

/** Elements with no closing tag — they must not open a depth level. */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

/**
 * The first DIRECT-CHILD `<h2>` of `scope`.
 *
 * @param {string} scope  a section's inner HTML
 * @returns {{ start: number, text: string } | null}
 *   `start` is the offset of `<h2` within `scope`; `text` is the whole element
 *   including its tags. `null` when the section has no top-level `<h2>` — which
 *   is a real answer, not a failure: a slide may legitimately have none.
 */
function findTopLevelH2(scope) {
  const hit = findTopLevelTag(scope, 'h2');
  if (!hit) return null;
  const hm = scope.slice(hit.start).match(/^<h2[^>]*>[\s\S]*?<\/h2>/);
  return hm ? { start: hit.start, text: hm[0] } : null;
}

/**
 * The offset of the first DIRECT-CHILD `<tag>` of `scope`, or `null`.
 *
 * The same depth walk `findTopLevelH2` needs, exposed because "is there a
 * top-level `<ul>` here?" is the same question about a different tag — and
 * answering it with a bare `/<ul[\s>]/` is the depth-blind mistake one level
 * down: a list inside a blockquote or a card is not the section's own list.
 */
function findTopLevelTag(scope, tagName) {
  const want = String(tagName).toLowerCase();
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(scope))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0 && openName.toLowerCase() === want) return { start: m.index };
    depth++;
  }
  return null;
}

/** Does `scope` have a direct-child `<tag>`? */
function hasTopLevelTag(scope, tagName) {
  return findTopLevelTag(scope, tagName) !== null;
}

/**
 * The TEXT of a section's own `<h2>`, tags stripped and whitespace collapsed —
 * what a caller wants when it needs the heading as a string rather than as
 * markup to move. Returns `''` when there is no top-level heading.
 *
 * Entities are left ENCODED. The one consumer today re-emits this into HTML, so
 * decoding here would double-encode on the way back out; a consumer that needs
 * plain text decodes at its own edge.
 */
function readTopLevelH2Text(scope) {
  const hit = findTopLevelH2(scope);
  if (!hit) return '';
  return hit.text
    .replace(/^<h2[^>]*>/, '')
    .replace(/<\/h2>$/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { VOID_TAGS, findTopLevelH2, findTopLevelTag, hasTopLevelTag, readTopLevelH2Text };
