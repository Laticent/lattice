/**
 * Shared string helpers for the SVG chart transforms (quadrant, radar, …) —
 * the "same convention" toolkit those kernels used to each carry a private
 * copy of (the quadrant↔radar pair was the single biggest exact clone the
 * duplication scan found, 71 lines). One home, imported per kernel.
 *
 * NOTE the escape/strip variants here are the QUADRANT/RADAR flavor:
 *   - stripTags folds &nbsp; to a space (funnel/map's local variant folds
 *     &amp; instead — different post-processing, deliberately NOT merged;
 *     byte-level output compatibility beats a forced abstraction).
 * The list walkers (findOuterUL / splitTopLevelLI) are the <ul>-only
 * siblings of lib/core/html-lists.js's generic <ul>/<ol> walkers; they keep
 * their exact historical matching behavior for the transforms that use them.
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 *
 * The tail of this file (stripTrailingPills / spliceFirstList / readsHandBody)
 * is the SECTION-KERNEL toolkit: the three helpers every per-chart
 * `transformSection` reaches for. They lived in chart-family.js while the
 * per-chart builders did too; a kernel that now ships in its own folder cannot
 * import them from there without a require cycle (chart-family → the generated
 * registry → the kernel), so they live here, one level down, where both sides
 * can see them. They also ride into `ctx.utils` (chart-family.js) so a
 * folder-dropped kernel can take them off its argument instead of guessing a
 * relative path.
 */

// The canonical depth-aware list walker lives in lib/core — a core primitive
// must never import a component kernel, so the dependency runs this way only.
const { extractFirstList } = require('../../../core/html-lists');

function escHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stripTags(s) {
  // Fixed-point strip: removing a tag can splice a NEW tag together from the
  // surrounding text (`<scr<script>ipt>`), so repeat until stable (CodeQL
  // js/incomplete-multi-character-sanitization). On well-formed markdown-it
  // output one pass already reaches the fixed point, so this is
  // byte-identical for real decks. NOTE this is a label-text extractor, not
  // a security boundary — untrusted deck HTML is sanitized by
  // sanitizeSlideHtml/DOMPurify before any preview frame (HARD RULE #22),
  // and these labels pass through escHtml/escAttr again at the SVG emitters.
  let out = String(s);
  let prev;
  do { prev = out; out = out.replace(/<[^>]+>/g, ''); } while (out !== prev);
  return out.replace(/&nbsp;/g, ' ').trim();
}

// Plain TEXT out of a markdown-it fragment: tags off AND entities decoded.
//
// An SVG kernel takes text, not markup — the wrapping emitter escapes whatever
// it is handed — so skipping the decode double-escapes: markdown-it writes
// `Ops &amp; IT`, the emitter escapes the `&` again, and the chart paints the
// literal `Ops &amp; IT`. (The old HTML gantt interpolated the fragment into a
// `<div>`, where the entity simply rendered, which is why this only surfaced
// once the charts went SVG.)
//
// `&amp;` decodes LAST so `&amp;lt;` becomes `&lt;` — the author's literal
// text — rather than being re-decoded into `<`.
function plainText(s) {
  return stripTags(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function fmtNum(n) {
  return Number(Number(n).toFixed(2)).toString();
}

// ── Balanced-tag list extraction ───────────────────────────────────────────
// Depth-counting scans so a nested <ul> inside an item doesn't confuse the
// walker (a lazy regex stops at the first inner </ul>).

function findOuterUL(html) {
  const start = html.indexOf('<ul');
  if (start < 0) return null;
  const tagEnd = html.indexOf('>', start);
  if (tagEnd < 0) return null;
  let depth = 1, pos = tagEnd + 1;
  while (pos < html.length) {
    if (html.startsWith('<ul', pos) &&
        (html[pos + 3] === '>' || html[pos + 3] === ' ' || html[pos + 3] === '\t' || html[pos + 3] === '\n')) {
      const e = html.indexOf('>', pos);
      if (e < 0) return null;
      depth++; pos = e + 1;
    } else if (html.startsWith('</ul>', pos)) {
      depth--;
      if (depth === 0) return { start, end: pos + 5, inner: html.slice(tagEnd + 1, pos) };
      pos += 5;
    } else { pos++; }
  }
  return null;
}

function splitTopLevelLI(ulInner) {
  const lis = [];
  let pos = 0;
  while (pos < ulInner.length) {
    const liStart = ulInner.indexOf('<li', pos);
    if (liStart < 0) break;
    const liTagEnd = ulInner.indexOf('>', liStart);
    if (liTagEnd < 0) break;
    let ulDepth = 0, scan = liTagEnd + 1, liEnd = -1;
    while (scan < ulInner.length) {
      if (ulInner.startsWith('<ul', scan) &&
          (ulInner[scan + 3] === '>' || ulInner[scan + 3] === ' ' || ulInner[scan + 3] === '\t' || ulInner[scan + 3] === '\n')) {
        const e = ulInner.indexOf('>', scan);
        if (e < 0) break;
        ulDepth++; scan = e + 1;
      } else if (ulInner.startsWith('</ul>', scan)) {
        ulDepth--; scan += 5;
      } else if (ulInner.startsWith('</li>', scan) && ulDepth === 0) {
        liEnd = scan; break;
      } else { scan++; }
    }
    if (liEnd < 0) break;
    lis.push(ulInner.slice(liTagEnd + 1, liEnd));
    pos = liEnd + 5;
  }
  return lis;
}

// The family's STATUS vocabulary — the canonical `data-s` values a chart may
// stamp on a bar, a card or a key swatch, in the order a legend lists them.
// Shared, not kanban's: gantt reads it to tell a status pill from a date span
// and to order its status key. It lived in the kanban block of chart-family.js
// under a `KB_` prefix while both charts were in that one file, which read as a
// kanban-private list right up until the kernels moved apart and gantt could no
// longer see it. `.chart-status[data-s]` in chart-family.css is the paint side.
// FROZEN. It was module-private to chart-family.js and is now exported into every
// bundle; an unfrozen array that two kernels read is one `push` away from changing
// gantt's status-key order and kanban's status recognition process-wide.
const CHART_STATUS = Object.freeze([
  'on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred',
]);

// ── The section-kernel toolkit ─────────────────────────────────────────────
// What a per-chart `transformSection` needs from the family, and nothing else.

// Trailing inline-code pills come off the END of an item's lead text, innermost
// last: `Migrate API `60%` `at-risk`` yields ['60%', 'at-risk']. Returns the
// lead with the pills removed alongside them.
function stripTrailingPills(lead) {
  const pills = [];
  let s = lead;
  while (true) {
    const m = s.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
    if (!m) break;
    pills.unshift(m[2].trim());
    s = m[1];
  }
  return { leadStripped: s, pills };
}

// Replace the section's first list with the figure a builder makes from it.
// `build` returning null (or no list being present) leaves the html untouched,
// which is the kernels' pass-through signal.
function spliceFirstList(html, build) {
  // Depth-aware extraction — a naive non-greedy /<ul>…<\/ul>/ stops at an
  // item's NESTED close tag, truncating the outer list. Match by depth.
  const ext = extractFirstList(html);
  if (!ext) return html;
  const figure = build(ext);
  if (figure == null) return html;
  return html.slice(0, ext.start) + figure + html.slice(ext.end);
}

/**
 * Does this slide paint `--font-body` in the HAND face?
 *
 * NOT the same question as "does it carry `sketch`", and the difference is a
 * whole defect. `mode: sketch-clean` resolves to `sketch sketch-clean-body`
 * (`lib/core/resolve-mode.js`), and `base.sketch.css`'s `sketch-clean-body` rule
 * puts `--font-body` BACK to the clean stack while leaving `--font-display` and
 * `--font-label` on the hand. So a `sketch-clean` slide is hand-headed and
 * clean-bodied.
 *
 * That splits the chart labels by which token they name:
 *   · `.gantt-tick` is `--font-label` → hand on both `sketch` and `sketch-clean`,
 *     so its builder tests the bare `sketch` token and is correct to.
 *   · `.quadrant-label`, `.quadrant-cohort-label`, `.radar-sector-label` are
 *     `--font-body` → hand on `sketch` only.
 *
 * Copying the gantt's predicate to these three measured the hand while the CSS
 * painted the clean face, under-counting by up to 11% on `C`/`O`-heavy names
 * (`LOCO`, `CLOUD`) — an under-count being the direction that lets a line past
 * its box and hands the de-collision pass a box narrower than the glyphs. Caught
 * by the inversion lens on this diff; latent, because no shipped deck pairs
 * `sketch-clean` with a quadrant or radar, so the corpus renders identically
 * either way and proves nothing.
 *
 * The lesson generalizes: ask which TOKEN a rule names, never which mode looks
 * hand-drawn.
 */
function readsHandBody(classTokens) {
  return classTokens.includes('sketch') && !classTokens.includes('sketch-clean-body');
}

module.exports = {
  escHtml, escAttr, stripTags, plainText, fmtNum, findOuterUL, splitTopLevelLI,
  stripTrailingPills, spliceFirstList, readsHandBody, CHART_STATUS,
};
