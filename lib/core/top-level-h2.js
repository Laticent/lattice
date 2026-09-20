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
  // KEEP SCANNING when the element match fails, rather than committing to the
  // first depth-0 `<h2` the walk reports. `findTopLevelTag` matches the tag name
  // case-INSENSITIVELY while this extraction is case-SENSITIVE, so a stray
  // `<H2>` is reported as a hit and then not extracted. Returning null there
  // deleted the masthead band on any deck containing uppercase raw HTML — the
  // band is gated on `Boolean(findTopLevelH2(...))` in masthead.transform.js, so
  // it failed silently, on every render path. Continuing the walk restores the
  // pre-existing behavior exactly: skip what cannot be extracted, find the real
  // lowercase heading.
  //
  // RESIDUAL, pre-existing and NOT introduced here: the DOM mirror's
  // `:scope > h2` IS case-insensitive, so on that input the runtime picks the
  // uppercase element and the engine picks the lowercase one. Both paths have
  // behaved that way since before this kernel existed; making the extraction
  // case-insensitive would change which heading every deck's masthead lifts, so
  // it is a deliberate decision rather than a drive-by.
  return findTopLevelTag(scope, 'h2', (start) => {
    const hm = scope.slice(start).match(/^<h2[^>]*>[\s\S]*?<\/h2>/);
    return hm ? { start, text: hm[0] } : null;
  });
}

/**
 * Find the first DIRECT-CHILD `<tag>` of `scope`.
 *
 * The same depth walk `findTopLevelH2` needs, exposed because "is there a
 * top-level `<ul>` here?" is the same question about a different tag — and
 * answering it with a bare `/<ul[\s>]/` is the depth-blind mistake one level
 * down: a list inside a blockquote or a card is not the section's own list.
 *
 * `accept` is called with the hit's offset and decides: a truthy return is the
 * result, `null` means "not this one, keep walking". Without it a caller that
 * rejects a hit loses the ones after it. Default: report the offset.
 *
 * @returns whatever `accept` returned, or `{ start }` by default, or `null`.
 */
function findTopLevelTag(scope, tagName, accept) {
  const want = String(tagName).toLowerCase();
  const src = maskInert(String(scope ?? ''));
  const take = accept || ((start) => ({ start }));
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(src))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0 && openName.toLowerCase() === want) {
      const got = take(m.index);
      if (got) return got;
    }
    depth++;
  }
  return null;
}

/**
 * Blank out spans whose contents are NOT markup, preserving length so every
 * offset the walk reports still indexes the original string.
 *
 * Comments and RAWTEXT elements hold tag-LIKE text that the browser never
 * parses as tags. Counting it broke the walk both ways: a commented-out
 * `<ul>` read as a real direct-child list (so a `topic` slide looked
 * overridden to the engine and not to the runtime — a HARD RULE #1 split), and
 * an unclosed tag inside a comment silently shifted depth for everything after
 * it. `<script>`/`<style>` are the same shape and are masked for the same
 * reason, which is the RAWTEXT hazard HARD RULE #22 documents one level up.
 */
function maskInert(html) {
  const blank = (m) => ' '.repeat(m.length);
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, blank)
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, blank)
    .replace(/<style\b[^>]*>[\s\S]*?(?:<\/style>|$)/gi, blank);
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
