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
const TITLE_ID = (n) => `lat-svgt-${n}`;
const DESC_ID = (n) => `lat-svgd-${n}`;

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

    const end = elementEnd(html, start, 'svg');
    if (end < 0) continue;
    const bodyStart = start + openTag.length;
    const body = html.slice(bodyStart, end);
    const t = firstDirectChild(body, 'title');
    if (!t) continue; // nothing to reference — this pass does not invent names

    n += 1;
    const tid = TITLE_ID(n);
    const d = firstDirectChild(body, 'desc');
    const did = d ? DESC_ID(n) : null;

    let newBody = body;
    // Splice ids in from the LATER offset first so the earlier index stays valid.
    const edits = [];
    if (d && !d.hasId) edits.push({ index: d.index, tag: d.tag, id: did, name: 'desc' });
    if (!t.hasId) edits.push({ index: t.index, tag: t.tag, id: tid, name: 'title' });
    edits.sort((a, b) => b.index - a.index);
    for (const e of edits) {
      const withId = e.tag.replace(new RegExp(`^<${e.name}`, 'i'), `<${e.name} id="${e.id}"`);
      newBody = newBody.slice(0, e.index) + withId + newBody.slice(e.index + e.tag.length);
    }
    // Reuse an id the kernel already set (radar's mini swatches do this), so we point at
    // the real node rather than a duplicate.
    const existingId = (tag) => tag.match(/\sid\s*=\s*["']([^"']+)["']/)?.[1];
    const realTid = (t.hasId && existingId(t.tag)) || tid;
    const realDid = d ? (d.hasId && existingId(d.tag)) || did : null;

    const ref = ` aria-labelledby="${realTid}"${realDid ? ` aria-describedby="${realDid}"` : ''}`;
    // APPENDED, not prepended. This codebase parses its own rendered HTML with regexes
    // in several places, and a number of them anchor on `<svg class="…"` as a prefix.
    // Inserting right after `<svg` reorders the attributes and silently breaks those
    // matchers (the piechart parity test caught it); appending before the `>` leaves
    // every existing attribute exactly where it was.
    const newOpen = `${openTag.slice(0, -1).replace(/\/$/, '')}${ref}>`;

    out += html.slice(cursor, start) + newOpen + newBody;
    cursor = end - '</svg>'.length;
    out += '</svg>';
    cursor = end;
    SVG_OPEN.lastIndex = end;
  }
  return n === 0 ? html : out + html.slice(cursor);
}

const CAPTION_ID = (n) => `lat-cap-${n}`;

/**
 * Associate an authored chart CAPTION with the graphic it describes.
 *
 * WHY NOT `<figure>`/`<figcaption>`, which the ADR's §16 planned. Measured on a real
 * render, the caption is a SIBLING of the chart wrapper, not a child — both sit
 * directly in `.cell-stage`:
 *
 *   <div class="matrix-grid-figure">…<svg …></div>
 *   <p class="chart-caption">…</p>
 *
 * Making that a `<figure>` therefore means INSERTING A WRAPPER around two siblings,
 * inside a flex cell — a new box in a layout whose height math is measured
 * (HARD RULE #20), and the exact thing "retag, don't wrap" exists to prevent. And it
 * would be for little: only 2 of 7 charts in the gallery carry a caption at all, so a
 * blanket conversion would add an announced "figure … figure end" boundary around five
 * graphics with nothing to associate — the rotor noise §3 forbids.
 *
 * `aria-describedby` achieves the ACTUAL goal — the caption is announced as the
 * graphic's description — with zero new boxes, zero layout risk, and only where a
 * caption exists. `aria-describedby` takes an id LIST, so the caption is appended to
 * the `<desc>` reference rather than replacing it: a reader gets the data summary and
 * then the author's so-what.
 *
 * Association is by DOCUMENT ORDER (the caption follows its chart), which is sound
 * precisely because this runs once over the assembled document.
 */
function associateCaptions(html) {
  if (!html || html.indexOf('chart-caption') === -1) return html;
  const CAP = /<p class="chart-caption"(?![^>]*\sid=)/g;
  let out = html;
  let n = 0;
  let m;
  // Walk captions in order; for each, attach to the nearest PRECEDING named graphic.
  while ((m = CAP.exec(out))) {
    const before = out.slice(0, m.index);
    const svgAt = before.lastIndexOf('<svg ');
    if (svgAt < 0) continue;
    const openEnd = out.indexOf('>', svgAt);
    const openTag = out.slice(svgAt, openEnd + 1);
    const dm = openTag.match(/\saria-describedby="([^"]*)"/);
    if (!dm) continue; // an unnamed graphic — nothing to extend
    n += 1;
    const cid = CAPTION_ID(n);
    const newOpen = openTag.replace(dm[0], ` aria-describedby="${dm[1]} ${cid}"`);
    const newCap = `<p class="chart-caption" id="${cid}"`;
    // Splice the LATER edit first so the earlier index stays valid.
    out = out.slice(0, m.index) + newCap + out.slice(m.index + m[0].length);
    out = out.slice(0, svgAt) + newOpen + out.slice(svgAt + openTag.length);
    CAP.lastIndex = m.index + newCap.length;
  }
  return out;
}

module.exports = { applyToHtml, associateCaptions, TITLE_ID, DESC_ID, CAPTION_ID };
