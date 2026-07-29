/**
 * svg-a11y-names — make every named chart graphic RELIABLY announced.
 *
 * THE PROBLEM. A chart SVG names itself the obvious way:
 *
 *   <svg role="img"><title>Radar chart</title><desc>Key — …</desc>…</svg>
 *
 * Per spec that is a correct accessible name. In practice it is the least reliable
 * form in the whole accname stack: VoiceOver/Safari and older JAWS drop a bare child
 * `<title>` on an `<svg>`, so the graphic announces as an unnamed image. The
 * semantic-HTML ADR flagged this in §14 and then shipped four MORE instances of it in
 * §17.9 — naming the charts that had no name at all, using the mechanism the same
 * document calls unreliable. This closes that gap.
 *
 * THE DURABLE FORM is the id-referenced one, which every AT resolves:
 *
 *   <svg role="img" aria-labelledby="lat-t1" aria-describedby="lat-d1">
 *     <title id="lat-t1">Radar chart</title><desc id="lat-d1">Key — …</desc>…
 *
 * WHY THIS IS A DOCUMENT-LEVEL PASS AND NOT EIGHT LOCAL EDITS. `aria-labelledby`
 * refers to an id, and an id must be unique in the DOCUMENT. The chart kernels are
 * per-slide, stateless, and shared across three render paths, so none of them can mint
 * a document-unique id on its own — a per-kernel counter would collide the moment two
 * charts of different types share a deck, and would renumber differently per path.
 * Running once over the assembled document is the only place the uniqueness invariant
 * actually holds, and it means the eight kernels stay ignorant of it (HARD RULE #1:
 * one transform, one home).
 *
 * IDEMPOTENT and CONSERVATIVE:
 *   · an `<svg>` that already carries `aria-labelledby` / `aria-label` is left alone —
 *     an authored or upstream name (mermaid's `accTitle:`) always wins;
 *   · a `<title>`/`<desc>` that already has an `id` keeps it;
 *   · only the FIRST `<title>`/`<desc>` of each `<svg>` is referenced, and only when it
 *     is a direct child — a `<title>` nested in a `<path>` is a tooltip, not a name
 *     (the map's per-region `<title>`s are exactly that, and must not be promoted);
 *   · an `<svg>` with no `<title>` is untouched: this pass makes existing names
 *     reliable, it does not invent names.
 *
 * Pure string-in / string-out, so every render path shares it and nothing needs a DOM.
 */

// Ids are deterministic and ordinal (`lat-svgt-1`, `lat-svgd-1`, …) so the same source
// yields the same bytes on every path and in every run — a hash would be stable too but
// unreadable in a diff, and export goldens are diffed by humans.
//
// THE PREFIX IS NOT ASSUMED FREE. An earlier version minted these blind, and any element
// in the deck declaring `id="lat-svgt-1"` then STOLE the first chart's accessible name —
// `aria-labelledby` resolves to whichever node owns the id, and an author's `<span
// id="lat-svgt-1" hidden>` wins by being first. That matters well beyond author error:
// the Studio renders untrusted shared / AI-generated markdown (HARD RULE #22, #616), and
// the shared sanitizer preserves `id` and `aria-*` verbatim — so untrusted content could
// dictate what a screen reader says a chart is, with a pixel-identical render. Found by
// the red team, on a real Chrome accessibility tree.
//
// `uniquePrefix` therefore probes the assembled document and lengthens the prefix until
// nothing matches it. Cost is one regex test per attempt on a string we already hold.
const TITLE_ID = (p, n) => `${p}t-${n}`;
const DESC_ID = (p, n) => `${p}d-${n}`;

/**
 * Decode NUMERIC character references. Complete for its class — `&#DDD;` and `&#xHH;` are
 * the whole syntax — which matters, because a partial decoder is the same defect as a
 * partial sanitizer.
 */
function decodeNumericRefs(text) {
  return text.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_m, hex, dec) =>
    String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
}

/** Every `id="…"` / `id='…'` VALUE in the document, exactly as authored. */
const ID_ATTR = /\sid\s*=\s*("([^"]*)"|'([^']*)')/gi;

function uniquePrefix(html) {
  // THE GUARD MUST REASON ABOUT THE PARSE, NOT THE SERIALIZATION. Two versions of this
  // have now been broken by the same misconception, each demonstrated on a real Chrome
  // accessibility tree with the chart announcing an attacker's string:
  //
  //   1. The loop tested the PREVIOUS candidate and bailed at a fixed count, so the last
  //      prefix it assigned was returned unchecked — 32 decoy tokens plus a squat on the
  //      33rd defeated it. Fixed by making the loop condition the invariant.
  //   2. `html.includes('lat-svg')` is a test on the TEXT. An attacker writes
  //      `id="lat&#x2d;svgt-1"`, which contains no literal `lat-svg` but PARSES to exactly
  //      the id we are about to mint — and wins by being first in tree order. The Studio's
  //      sanitizer then re-serializes it to a literal, so it survives that too.
  //
  // So the probe now runs over the decoded id space. Numeric references decode completely;
  // a NAMED reference inside an id value is not decoded here and is treated as hostile —
  // this engine emits no entity-encoded ids, so the only source is authored content, and
  // declining to name a graphic is always safer than naming it something an author chose.
  let ids = '';
  ID_ATTR.lastIndex = 0;
  let m;
  while ((m = ID_ATTR.exec(html))) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    const decoded = decodeNumericRefs(raw);
    if (decoded.includes('&')) return null; // an id we cannot resolve — do not compete with it
    ids += ` ${decoded}`;
  }
  // Test BOTH: the decoded id space (what `getElementById` will see) and the raw text (a
  // bare mention is still enough to move us off, which costs nothing).
  const taken = (candidate) => html.includes(candidate) || ids.includes(candidate);
  let prefix = 'lat-svg';
  for (let guard = 0; taken(prefix); guard += 1) {
    if (guard >= 64) return null; // give up rather than return a colliding prefix
    prefix = `lat-x${guard}-svg`;
  }
  return prefix;
}

/** The `<svg …>` opening tag, treating quoted attribute values as opaque. */
const SVG_OPEN = /<svg\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;

/**
 * Find the end of the element that starts at `open` in `html`, honoring nesting.
 * Returns the index just past its close tag, or -1.
 */
function elementEnd(html, openIdx, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}\\s*>`, 'gi');
  re.lastIndex = openIdx;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth += 1;
    }
  }
  return -1;
}

/**
 * The first DIRECT child `<title>` / `<desc>` of an svg body — i.e. one that is not
 * nested inside another element. A `<title>` inside a `<path>` is a per-shape tooltip
 * (the map emits one per region); promoting it to the chart's name would rename the
 * whole graphic after whichever shape happened to be first.
 */
function firstDirectChild(body, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  let m;
  while ((m = re.exec(body))) {
    // Depth check: count unclosed non-void elements before this point.
    const before = body.slice(0, m.index);
    const opens = (before.match(/<(?!\/)([a-zA-Z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/g) || [])
      .filter((t) => !t.endsWith('/>')).length;
    const closes = (before.match(/<\/[a-zA-Z][\w-]*\s*>/g) || []).length;
    // Case-INSENSITIVE: HTML attribute names are, and `<title ID="author-owned">` slipped
    // past a case-sensitive probe straight into the splice, emitting a duplicate `id` whose
    // first value wins — destroying the author's id and dangling every reference to it.
    if (opens === closes) return { index: m.index, tag: m[0], hasId: /\sid\s*=/i.test(m[0]) };
  }
  return null;
}

/**
 * Rewrite every `role="img"` chart `<svg>` in `html` to reference its own
 * `<title>`/`<desc>` by id. Returns the html unchanged when there is nothing to do.
 */
function applyToHtml(html) {
  if (!html || html.indexOf('<svg') === -1) return html;
  let out = '';
  let cursor = 0;
  let n = 0;
  const prefix = uniquePrefix(html);
  if (!prefix) return html; // no free id namespace — leave the document exactly as it is
  SVG_OPEN.lastIndex = 0;
  let open;
  while ((open = SVG_OPEN.exec(html))) {
    const openTag = open[0];
    const start = open.index;
    // Already named by something authoritative (an author's aria-label, mermaid's own
    // aria-labelledby) — never override.
    if (/\saria-label(?:ledby)?\s*=/.test(openTag)) continue;
    // Only NAMED graphics. An svg with no role is decorative-or-unknown; giving it a
    // name here would be inventing one, which §17.5 is explicit about not doing.
    if (!/\srole\s*=\s*["']img["']/.test(openTag)) continue;

    // A self-closing `<svg …/>` has no children, so it has no `<title>` to reference —
    // and rewriting it is actively harmful: stripping the `/` turns it into an OPEN tag
    // and the next sibling gets re-parented INTO the graphic. In HTML5 foreign content
    // `<svg/>` legitimately self-closes, so this is a real DOM change, not a cosmetic
    // one. Verified by the red team against a real parse.
    if (/\/\s*>$/.test(openTag)) continue;
    const end = elementEnd(html, start, 'svg');
    if (end < 0) continue;
    const bodyStart = start + openTag.length;
    // `elementEnd` returns the index PAST `</svg>`, so the body must stop short of it.
    // Slicing to `end` swept the closing tag into `body` and the re-emit then appended a
    // second one — malformed `</svg></svg>`. It survived every test because browsers and
    // jsdom silently drop a stray unmatched close and the pixels are identical; only a
    // string-level assertion sees it. Caught by a static analyser flagging the dead
    // `cursor` write that the same confusion left behind.
    const closeLen = html.slice(0, end).match(/<\/svg\s*>$/)?.[0].length ?? '</svg>'.length;
    const body = html.slice(bodyStart, end - closeLen);
    const closeTag = html.slice(end - closeLen, end);
    const t = firstDirectChild(body, 'title');
    if (!t) continue; // nothing to reference — this pass does not invent names

    // AN AUTHOR'S `id` IS UNTOUCHABLE, and that leaves us only one honest move: skip.
    //
    // Three options exist for a `<title id="author-chosen">`, and two are defects.
    // (1) REFERENCE it — rejected, and rightly: it lets authored content (in the Studio,
    //     UNTRUSTED content — HARD RULE #22) choose what a chart is announced as.
    // (2) REPLACE it — what this code did, contradicting the two comments below that
    //     claimed the node "keeps it". An element has exactly one id, so overwriting it
    //     silently breaks every reference elsewhere in the document: an
    //     `<button aria-labelledby="author-chosen">` loses its accessible name outright.
    //     Reproduced; found by the red team.
    // (3) LEAVE THE GRAPHIC ALONE — the only option that neither trusts author input nor
    //     destroys it. The cost is that this one graphic keeps the bare-`<title>` naming
    //     §14 calls unreliable, which is exactly the state it was already in. No engine
    //     kernel emits `<title id=…>`, so this can only be reached from author HTML.
    if (t.hasId) continue;

    n += 1;
    const tid = TITLE_ID(prefix, n);
    const d = firstDirectChild(body, 'desc');
    // Same rule for the description, applied more finely: an author-owned `<desc id>` costs
    // only the `aria-describedby`, not the name, so keep the name and drop the reference.
    const did = d && !d.hasId ? DESC_ID(prefix, n) : null;

    let newBody = body;
    // Splice ids in from the LATER offset first so the earlier index stays valid.
    const edits = [];
    if (did) edits.push({ index: d.index, tag: d.tag, id: did, name: 'desc' });
    edits.push({ index: t.index, tag: t.tag, id: tid, name: 'title' });
    edits.sort((a, b) => b.index - a.index);
    for (const e of edits) {
      const withId = e.tag.replace(new RegExp(`^<${e.name}`, 'i'), `<${e.name} id="${e.id}"`);
      newBody = newBody.slice(0, e.index) + withId + newBody.slice(e.index + e.tag.length);
    }

    const ref = ` aria-labelledby="${tid}"${did ? ` aria-describedby="${did}"` : ''}`;
    // APPENDED, not prepended. This codebase parses its own rendered HTML with regexes
    // in several places, and a number of them anchor on `<svg class="…"` as a prefix.
    // Inserting right after `<svg` reorders the attributes and silently breaks those
    // matchers (the piechart parity test caught it); appending before the `>` leaves
    // every existing attribute exactly where it was.
    const newOpen = `${openTag.slice(0, -1).replace(/\/$/, '')}${ref}>`;

    out += html.slice(cursor, start) + newOpen + newBody + closeTag;
    cursor = end;
    SVG_OPEN.lastIndex = end;
  }
  return n === 0 ? html : out + html.slice(cursor);
}

module.exports = { applyToHtml, TITLE_ID, DESC_ID };
