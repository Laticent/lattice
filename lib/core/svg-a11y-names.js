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

function uniquePrefix(html) {
  let prefix = 'lat-svg';
  // A collision only matters if the document mentions the token at all; `id="…"` is the
  // dangerous form, but we test the bare token so a reference is enough to move us off.
  for (let guard = 0; guard < 32 && html.includes(prefix); guard += 1) prefix = `lat-x${guard}-svg`;
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
    if (opens === closes) return { index: m.index, tag: m[0], hasId: /\sid\s*=/.test(m[0]) };
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

    n += 1;
    const tid = TITLE_ID(prefix, n);
    const d = firstDirectChild(body, 'desc');
    const did = d ? DESC_ID(prefix, n) : null;

    let newBody = body;
    // Splice ids in from the LATER offset first so the earlier index stays valid.
    // A node that already carries an id gets OURS in addition — the reference must
    // resolve to this node, and we will not point at an id the source chose.
    const edits = [];
    if (d) edits.push({ index: d.index, tag: d.tag, id: did, name: 'desc', hadId: d.hasId });
    edits.push({ index: t.index, tag: t.tag, id: tid, name: 'title', hadId: t.hasId });
    edits.sort((a, b) => b.index - a.index);
    for (const e of edits) {
      const withId = e.hadId
        ? e.tag.replace(/\sid\s*=\s*["'][^"']*["']/, ` id="${e.id}"`)
        : e.tag.replace(new RegExp(`^<${e.name}`, 'i'), `<${e.name} id="${e.id}"`);
      newBody = newBody.slice(0, e.index) + withId + newBody.slice(e.index + e.tag.length);
    }
    // NEVER reuse an id found in the source. An earlier version did, "so we point at the
    // real node rather than a duplicate" — but grepping the engine shows NO kernel emits
    // a `<title id=…>`, so the only reachable input to that branch was AUTHOR HTML. It
    // existed solely to let authored content choose what we reference. A node that
    // already carries an id keeps it; we simply reference our own.

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
