/**
 * State chart — kernel for the `state-chart` chart-family member.
 *
 * ARCHITECTURE: browser-measured layout (Option 1).
 *
 * Build time (this module, pure string transform) emits only:
 *   - HTML state nodes (a centered column the BROWSER sizes to their
 *     content — any label, any script, any font, wraps naturally),
 *   - the transition list serialised as a `data-sc-transitions` JSON attr,
 *   - an empty <svg class="state-chart-edges"> overlay.
 * No geometry is computed at build time, because a string transform can't
 * measure text. Guessing glyph widths (the old charPx approach) could not
 * withstand arbitrary user content.
 *
 * Browser (installStateChartLayout, self-contained so it can be serialised
 * via .toString() into the emulator's bootstrap script AND imported by the
 * runtime bundle) measures each laid-out node with getBoundingClientRect
 * and draws the edges + markers into the SVG overlay. Real measurement →
 * robust to content we've never seen.
 *
 * Render-path wiring (three-renderer parity):
 *   - lattice-emulator.js  emits `<script>${STATE_CHART_BROWSER_JS}</script>`;
 *                          puppeteer runs it on DOMContentLoaded before the
 *                          PDF print (same pre-render-then-PDF flow as
 *                          function-plot).
 *   - lib/engine            the owned engine render path.
 *   - lib/runtime/index.js calls installStateChartLayout(document) for the
 *                          marp-vscode preview (+ ResizeObserver/fonts.ready).
 *
 * Authoring (numbered list of states, nested bullets are transitions):
 *
 *   <!-- _class: state-chart -->
 *   `Submission lifecycle`
 *   ## Document approval flow.
 *   1. Draft `start`
 *      - `submit => 2`
 *      - `discard => 6`
 *   2. Submitted `on-track`
 *      - `review => 3`
 *   3. In Review
 *      - `approve => 4`
 *      - `reject => 1`
 *      - `revise => self`
 *   …
 *
 * Variants: default (SVG canvas), `inline` (HTML chips, no SVG),
 * `horizontal` (HTML chips, row flow). `dark` composes via CSS.
 */

// Shared per-mark detail substrate (generalized from the pie; the chart-family
// detail-reveal). state-chart is a Tier-2 member: each STATE node is a mark, and
// a non-transition (prose) bullet authored under a state becomes its reveal
// detail. See engineering/decisions/2026-06-20-chart-detail-reveal-family.md and
// mark-detail.js. No circular dep — mark-detail imports only lib/core walkers.
const markDetail = require('../_chart-family/mark-detail');
const { plainText } = require('../_chart-family/transform-utils');

// Two orthogonal axes expressed as modifier classes:
//   direction:    lr (left-to-right) — default is tb (top-to-bottom)
//   presentation: inline (HTML chips, no SVG) — default is the SVG canvas
// `horizontal` is a backwards-compatible alias for `lr inline`.
const STATE_CHART_VARIANTS = ['lr', 'inline', 'curved'];

const STATUS_KEYWORDS = new Set([
  'on-track', 'done', 'live',
  'at-risk', 'warn', 'pilot',
  'blocked', 'fail',
  'decision',
  'deferred',
]);

const STATE_ATTR_KEYWORDS = new Set(['start', 'end']);

// ── `:::token` — the author-facing tint channel ───────────────────────────────
// An author names a THEME TOKEN, never a color: `:::state-fail-hue` resolves to
// `var(--state-fail-hue)`. That is what keeps the channel palette-blind (HARD
// RULE #3) — there is no syntax here that can express `#c0392b`, so a tinted deck
// still re-themes with the palette instead of pinning one theme's values.
//
// The shape is validated STRICTLY, and that is a security boundary rather than a
// nicety. The value reaches `svg.innerHTML` through the browser pass (the sink
// HARD RULE #22 polices) and is interpolated into a `var(--…)` reference, so a
// name carrying a quote, a paren, a semicolon or a `)` could close the function
// and inject. `^[a-z][a-z0-9-]*$` admits exactly the token vocabulary and nothing
// that can escape either context — no dot, no slash, no space, no `--` prefix
// (the engine adds it, so an author cannot reach `--x); …`).
//
// EXISTENCE is deliberately NOT checked here. This module is the pure, fs-free
// string transform (HARD RULE #1/#7); it cannot read `base.tokens.css` to learn
// which tokens a theme declares, and hard-coding a list beside 188 declarations
// is the per-token list `lib/tokens/contracts.js` explains goes stale on the
// first token nobody remembers to add. A well-formed name for a token that does
// not exist resolves to nothing and the element keeps its inherited paint — the
// deck degrades, it does not break. Naming the typo is `lint:deck`'s job, which
// is the coaching posture HARD RULE #29 settled: we warn, we coach.
const TINT_TOKEN_RE = /^[a-z][a-z0-9-]*$/;

// Splits a trailing `:::a` or `:::a/b` off a chunk of authored text.
// Two slots, because the ask is two channels: the MARK's color and, for a
// transition, its edge-label background. `:::pass/surface-raised` reads left to
// right as "paint the edge with pass, sit its label on surface-raised".
// A malformed or over-long spec is dropped whole rather than half-applied — a
// half-read tint is harder to debug than none.
function stripTint(text) {
  const m = String(text).match(/^([\s\S]*?)\s*:::([^\s:]+)\s*$/);
  if (!m) return { rest: String(text), tint: null, labelBg: null };
  const parts = m[2].split('/');
  if (parts.length > 2) return { rest: String(text), tint: null, labelBg: null };
  const [tint, labelBg] = parts;
  if (!TINT_TOKEN_RE.test(tint)) return { rest: String(text), tint: null, labelBg: null };
  if (labelBg != null && !TINT_TOKEN_RE.test(labelBg)) return { rest: String(text), tint: null, labelBg: null };
  return { rest: m[1].trim(), tint, labelBg: labelBg || null };
}

function escHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── List walking (depth-aware) ───────────────────────────────────────────

function findOuterList(html, tag) {
  const start = html.indexOf('<' + tag);
  if (start < 0) return null;
  const openEnd = html.indexOf('>', start);
  if (openEnd < 0) return null;
  let depth = 1, i = openEnd + 1;
  while (i < html.length) {
    if (html.startsWith('<' + tag, i) &&
        (html.charCodeAt(i + tag.length + 1) === 0x3e /* '>' */ ||
         /\s/.test(html.charAt(i + tag.length + 1)))) {
      depth++;
      i = html.indexOf('>', i) + 1;
      if (i === 0) return null;
      continue;
    }
    if (html.startsWith('</' + tag + '>', i)) {
      depth--;
      if (depth === 0) {
        return { inner: html.slice(openEnd + 1, i), start, end: i + tag.length + 3 };
      }
      i += tag.length + 3;
      continue;
    }
    i++;
  }
  return null;
}

function splitTopLevelLis(inner) {
  const items = [];
  let depth = 0, liStart = -1, i = 0;
  const liOpen = (idx) => {
    if (!inner.startsWith('<li', idx)) return -1;
    const next = inner.charCodeAt(idx + 3);
    if (next === 0x3e /* '>' */ || next === 0x20 /* ' ' */ || next === 0x09) {
      const close = inner.indexOf('>', idx);
      return close < 0 ? -1 : close + 1;
    }
    return -1;
  };
  while (i < inner.length) {
    const after = liOpen(i);
    if (after > 0) {
      if (depth === 0) liStart = after;
      depth++;
      i = after;
      continue;
    }
    if (inner.startsWith('</li>', i)) {
      depth--;
      if (depth === 0 && liStart !== -1) {
        items.push(inner.slice(liStart, i));
        liStart = -1;
      }
      i += 5;
      continue;
    }
    i++;
  }
  return items;
}

function stripTrailingPills(lead) {
  const pills = [];
  let s = lead;
  while (true) {
    const m = s.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
    if (!m) break;
    pills.unshift(m[2].trim());
    s = m[1];
  }
  return { leadStripped: s.trim(), pills };
}

// ── Transition token parsing ─────────────────────────────────────────────
// Event label is any run of characters up to the `=>` arrow (CJK, accents,
// punctuation — not just ASCII); `[^=]` stops before the arrow's first `=`.
const TRANSITION_RE = /^\s*([^=]*?)\s*=>\s*(\d+|self)\s*$/;

function decodeEntities(s) {
  return String(s)
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseTransitionToken(text) {
  const decoded = decodeEntities(text);
  const m = decoded.match(TRANSITION_RE);
  if (!m) return null;
  const event = m[1].trim();
  const target = m[2] === 'self' ? 'self' : parseInt(m[2], 10);
  return { event, to: target };
}

// ── State parsing ────────────────────────────────────────────────────────

function parseStateLi(liInner, index) {
  const nestedIdx = liInner.search(/<ul[^>]*>/);
  let lead = nestedIdx >= 0 ? liInner.slice(0, nestedIdx) : liInner;
  const nested = nestedIdx >= 0 ? liInner.slice(nestedIdx) : '';
  lead = lead.replace(/<\/?p>/g, '').trim();

  // `:::token` comes off FIRST. stripTrailingPills anchors each pill to the end
  // of the string, so a trailing tint would block the walk and every status pill
  // would be silently swallowed into the label.
  const { rest: leadNoTint, tint: stateTint } = stripTint(lead);
  lead = leadNoTint;

  const { leadStripped, pills } = stripTrailingPills(lead);
  let isStart = false, isTerminal = false, status = null;
  const unknownPills = [];
  for (const p of pills) {
    if (p === 'start') isStart = true;
    else if (p === 'end') isTerminal = true;
    else if (STATUS_KEYWORDS.has(p)) status = p;
    else unknownPills.push(p);
  }

  let label = leadStripped;
  if (unknownPills.length) {
    label = (label ? label + ' ' : '') +
      unknownPills.map(p => `<code>${escHtml(p)}</code>`).join(' ');
  }

  const transitions = [];
  const annotations = [];
  const detail = [];   // non-transition prose bullets → the per-node reveal detail
  if (nested) {
    const nestedOuter = findOuterList(nested, 'ul');
    if (nestedOuter) {
      const lis = splitTopLevelLis(nestedOuter.inner);
      for (const itemInner of lis) {
        const itemTrim = itemInner.replace(/<\/?p>/g, '').trim();
        // The "sole content is one inline-code token" rule now admits ONE
        // trailing `:::tint` (or `:::tint/label-bg`). Everything else still
        // falls through to detail prose, so the transition/detail split stays
        // the mechanical test the docs describe. Backward compatible by
        // construction: no `:::` means the group is undefined and nothing changes.
        const codeOnly = itemTrim.match(/^<code>([^<]+)<\/code>(?:\s*:::([^\s:<]+))?$/);
        if (codeOnly) {
          const t = parseTransitionToken(codeOnly[1]);
          if (t) {
            if (codeOnly[2]) {
              // Re-use the one grammar rather than a second regex here: feed
              // stripTint a synthetic `x:::spec` so malformed specs are rejected
              // by exactly the rule that rejects them on a state.
              const { tint, labelBg } = stripTint('x:::' + decodeEntities(codeOnly[2]));
              if (tint) t.tint = tint;
              if (labelBg) t.labelBg = labelBg;
            }
            transitions.push(t); continue;
          }
        }
        // Not a transition → a prose bullet. Previously dropped on the floor;
        // now captured as the state's reveal detail (the popover payload). It
        // renders nothing on the slide face (an inert <template>), so a deck
        // that authors no prose bullet is byte-identical.
        detail.push(itemTrim);
      }
    }
  }

  // Conditional, for the same reason the transition record is: an untinted deck's
  // model must stay byte-identical, so the invariant a test can assert is
  // "nothing changed", not "nothing that matters changed".
  return {
    index, label, status, isStart, isTerminal, transitions, annotations, detail,
    ...(stateTint ? { tint: stateTint } : null),
  };
}

function parseStateChart(olInner) {
  const liItems = splitTopLevelLis(olInner);
  if (!liItems.length) return null;

  const states = liItems.map((inner, i) => parseStateLi(inner, i + 1));

  const transitions = [];
  for (const state of states) {
    for (const t of state.transitions) {
      const to = t.to === 'self' ? state.index : t.to;
      if (to < 1 || to > states.length) {
        state.annotations.push(
          `<code>${escHtml(t.event ? `${t.event} => ${t.to}` : `=> ${t.to}`)}</code> (unresolved)`
        );
        continue;
      }
      // Tint keys are added ONLY when authored. This object is JSON-serialised
      // into `data-sc-transitions`, so an unconditional `tint: undefined` would
      // still be absent from JSON but a `tint: null` would not — and every
      // untinted deck's markup (all six shipped galleries) must stay
      // byte-identical or the committed PDFs churn for nothing.
      transitions.push({
        from: state.index,
        to,
        event: t.event || '',
        isSelf: state.index === to,
        ...(t.tint ? { tint: t.tint } : null),
        ...(t.labelBg ? { labelBg: t.labelBg } : null),
      });
    }
    delete state.transitions;
  }

  const anyExplicitStart = states.some(s => s.isStart);
  if (!anyExplicitStart && states[0]) states[0].isStart = true;

  const anyExplicitEnd = states.some(s => s.isTerminal);
  if (!anyExplicitEnd) {
    const hasOutgoing = new Set(transitions.map(t => t.from));
    for (const s of states) {
      if (!hasOutgoing.has(s.index)) s.isTerminal = true;
    }
  }

  return { states, transitions };
}

// ── Split-list reassembly ────────────────────────────────────────────────
// markdown-it splits a numbered list the moment a marker goes two-digit: `10. `
// starts its text at column 4, so the author's 3-space nested-transition indent
// (correct for `1.`–`9.`) no longer reaches under item 10. markdown-it ejects
// item 10's transition <ul> as a sibling and restarts every later state as its
// own `<ol start="N">`. A naive "first <ol>" read then silently drops every state
// past 9 plus their edges — and because state-chart addresses states by POSITION
// and points at targets by number, that tail loss is invisible corruption, not a
// graceful cap. So indentation must NOT decide which states survive: reassemble
// the consecutive run of leaked `<ol start>` / orphan `<ul>` siblings back into
// one logical list before parsing. Any state count then works at any indentation.
// See engineering/decisions/2026-07-16-state-chart-self-scale.md §Follow-ups.
function extractStateList(html) {
  const first = findOuterList(html, 'ol');
  if (!first) return null;
  const lis = splitTopLevelLis(first.inner);
  let end = first.end;
  const isOpen = (tag, i) =>
    html.startsWith('<' + tag, i) &&
    (html.charCodeAt(i + tag.length + 1) === 0x3e /* '>' */ ||
      /\s/.test(html.charAt(i + tag.length + 1)));
  for (;;) {
    let p = end;
    while (p < html.length && /\s/.test(html[p])) p++;
    if (isOpen('ul', p)) {
      // A leaked transition list belongs to the last accumulated state (it was
      // nested under it before the split ejected it). Fold it back in whole; the
      // markdown here is raw <li> content, so a plain re-wrap round-trips.
      const frag = findOuterList(html.slice(p), 'ul');
      if (!frag || !lis.length) break;
      lis[lis.length - 1] += html.slice(p, p + frag.end);
      end = p + frag.end;
      continue;
    }
    if (isOpen('ol', p)) {
      // A resumed `<ol start="N">` is markdown-it's split signature. A plain
      // fresh `<ol>` (no start=) is a genuinely separate list — stop before it,
      // so an unrelated trailing list is never swallowed into the machine.
      const gt = html.indexOf('>', p);
      if (gt < 0 || !/\sstart\s*=/.test(html.slice(p, gt + 1))) break;
      const frag = findOuterList(html.slice(p), 'ol');
      if (!frag) break;
      for (const li of splitTopLevelLis(frag.inner)) lis.push(li);
      end = p + frag.end;
      continue;
    }
    break;
  }
  if (!lis.length) return null;
  const inner = lis.map((x) => `<li>${x}</li>`).join('');
  return { inner, start: first.start, end };
}

// ── Build-time HTML emission ─────────────────────────────────────────────
// Default variant: HTML node column (browser-sized) + transitions JSON +
// empty SVG overlay. The browser pass fills the SVG. inline/horizontal:
// HTML chips, no SVG (the fallback presentations).

/**
 * The top-right index badge: a numeral that IS the state's identifier (edges route
 * by it, `byFrom.get(s.index)`) plus, when present, a status encoded ONLY as color.
 *
 * Two ARIA defects this replaces, both silent:
 *   · `aria-label` sat on a BARE `<span>`, whose implicit role is `generic` — and ARIA
 *     says a label on a generic role is IGNORED. So the status reached no assistive
 *     technology at all, while being conveyed to sighted users by hue alone (WCAG
 *     1.4.1). Adding `role="img"` is what makes the label apply.
 *   · A status-LESS badge was `aria-hidden="true"`, which hid the state's identifier
 *     — not decoration, the thing the transitions reference.
 *
 * The label carries BOTH facts, because a bare `aria-label="on-track"` would REPLACE
 * the visible numeral rather than add to it, trading one fact for the other.
 */
function stateIndexBadge(s) {
  const tone = s.status ? ` data-s="${escAttr(s.status)}"` : '';
  const name = s.status ? `State ${s.index}, ${s.status}` : `State ${s.index}`;
  return `<span class="state-index"${tone} role="img" aria-label="${escAttr(name)}">${s.index}</span>`;
}

function renderHtmlNode(s) {
  const kindAttr = s.isStart ? ' data-kind="start"' : (s.isTerminal ? ' data-kind="terminal"' : '');
  // Stamp the status tone onto the node itself so the kanban-style tile wash +
  // accent stripe can be driven in CSS without :has() (banned in the Marp
  // preview Chromium). Mirrors the child dot's data-s; same tone map.
  const toneAttr = s.status ? ` data-s="${escAttr(s.status)}"` : '';
  // `:::token` rides the measuring <li>, because the SVG pass reads the node's
  // paint off the element it measures (nodeShape's `el`) rather than off the
  // model — same channel data-mark and data-s already use. escAttr is belt and
  // braces: TINT_TOKEN_RE has already refused anything with a quote in it.
  const tintAttr = s.tint ? ` data-tint="${escAttr(s.tint)}"` : '';
  // Status is folded INTO the top-right index badge: the numeral is the state's
  // ID, its color is the status (decoded by the legend below). No separate
  // pill or inline dot — a state machine shows flow, and one corner badge keeps
  // both the ref and the status without widening the node. A status-less node
  // keeps a quiet plain numeral. Mirrors journey's glyph-in-a-colored-disc.
  const indexEl = stateIndexBadge(s);
  const labelEl = `<span class="state-label">${s.label}</span>`;
  // data-mark (0-based, aligned with the detail-template index) + an invisible
  // data-label/data-value the reveal layer reads as the popover title source.
  //
  // The <li> KEEPS its mark even after the layout pass copies it onto the
  // painted rect. Stripping it here was tried and is wrong twice over: draw()
  // re-runs (fonts.ready, resize), so the second pass would read a null mark and
  // paint rects with no mark at all — and the <li> is also the only mark left if
  // the pass never runs. So a state is addressable by BOTH nodes, and the reveal
  // layer tolerates a mixed HTML/SVG mark set (see liftVec's getBBox guard).
  // Attributes don't paint → the rendered chart stays byte-identical.
  const markAttr = markAttrs(s);
  return `<li class="state-node" data-index="${s.index}"${markAttr}${kindAttr}${toneAttr}${tintAttr}>` +
    indexEl + labelEl +
    `</li>`;
}

// The per-node mark attributes (shared by the SVG-canvas and inline variants).
function markAttrs(s) {
  const plain = plainLabel(s.label);
  return ` data-mark="${s.index - 1}" data-label="${escAttr(plain)}"` +
    (s.status ? ` data-value="${escAttr(s.status)}"` : '');
}

// Per-state mark descriptors for the shared detail substrate (mark-detail.js):
// label/value as the popover title source, detail = the state's prose bullets as
// <li> items. detailPayload/detailNote emit nothing when no state carries detail.
function stateMarks(model) {
  return model.states.map(s => ({
    label: plainLabel(s.label),
    valueRaw: s.status || '',
    detail: s.detail?.length ? s.detail.map(d => `<li>${d}</li>`).join('') : '',
  }));
}

// Distinct statuses in first-appearance order → a journey-style legend band that
// decodes the node dots. Returns '' when no state carries a status.
function buildStatusLegend(model) {
  const seen = [];
  for (const s of model.states) {
    if (s.status && !seen.includes(s.status)) seen.push(s.status);
  }
  if (!seen.length) return '';
  const items = seen.map((st) =>
    `<li class="state-legend-item" data-s="${escAttr(st)}">` +
    `<span class="state-dot" data-s="${escAttr(st)}" aria-hidden="true"></span>` +
    `<span class="state-legend-label">${escHtml(st)}</span></li>`
  ).join('');
  return `<ol class="state-legend">${items}</ol>`;
}

function buildDefault(model, dir, style) {
  const nodes = model.states.map(renderHtmlNode).join('');
  // Serialise the transition list for the browser pass.
  const data = escAttr(JSON.stringify(model.transitions));
  const d = dir === 'lr' ? 'lr' : 'tb';
  const styleAttr = style === 'curved' ? ' data-sc-style="curved"' : '';
  // Detail payload rides OUTSIDE the figure (a sibling) — the reveal layer's
  // chart root is the figure, and an inert <template data-mark> inside it would
  // be miscounted as a mark. The note comment (static-PDF fallback) trails all.
  const marks = stateMarks(model);
  // `.state-chart-scale` is the NATURAL-SIZE geometry box (nodes + edge overlay);
  // the outer `.state-chart-figure` is a flex viewport that fills the available
  // stage height (so a caption keeps its space, no longer clipped). draw()
  // measures against the scale box and letterbox-scales it to fit the viewport.
  // There is NO floor on the scale — the decision note records a floor as considered
  // and REJECTED, and this comment claimed one for two rounds after that; an
  // overstuffed machine simply gets cramped, and probeFigureLegibility's type floor
  // is the channel that reports it. See 2026-07-16-state-chart-self-scale.md.
  return `<div class="state-chart-figure" data-variant="default" data-sc-dir="${d}"${styleAttr} data-states="${model.states.length}" data-transitions="${model.transitions.length}" data-sc-transitions="${data}">` +
    `<div class="state-chart-scale">` +
    `<ol class="state-nodes">${nodes}</ol>` +
    `<svg class="state-chart-edges" role="img" xmlns="http://www.w3.org/2000/svg">` +
      `<title>State chart</title>${stateChartDesc(model)}</svg>` +
    `</div>` +
    `</div>` + markDetail.detailPayload(marks) + buildStatusLegend(model) + markDetail.detailNote(marks);
}

function renderInline(model, dir) {
  const d = dir === 'lr' ? 'lr' : 'tb';
  const byFrom = new Map();
  for (const t of model.transitions) {
    if (!byFrom.has(t.from)) byFrom.set(t.from, []);
    byFrom.get(t.from).push(t);
  }
  const items = model.states.map(s => {
    const kindAttr = s.isStart ? ' data-kind="start"' : (s.isTerminal ? ' data-kind="terminal"' : '');
    const toneAttr = s.status ? ` data-s="${escAttr(s.status)}"` : '';
    // The inline variant stays HTML — the SVG pass never paints over it — so the
    // tint goes on as a custom property the stylesheet reads, not as the
    // `data-tint` the pass consumes on the default variant. Both channels come
    // from the same parsed `s.tint`, so `:::` behaves the same in either variant.
    const tintAttr = s.tint ? ` style="--fill-hue:var(--${s.tint})"` : '';
    // Status folded into the index badge (same as the SVG node) — no inline dot.
    const indexEl = stateIndexBadge(s);
    const labelEl = `<span class="state-label">${s.label}</span>`;
    const outgoing = byFrom.get(s.index) || [];
    const chips = outgoing.map(t => {
      const dir = t.isSelf ? 'self' : (t.to > t.from ? 'forward' : 'back');
      const evt = t.event ? `<span class="state-chip-event">${escHtml(t.event)}</span>` : '';
      const dest = t.isSelf ? '↺' : `→ ${t.to}`;
      return `<span class="state-chip" data-dir="${dir}">${evt}<span class="state-chip-arrow">${dest}</span></span>`;
    }).join('');
    const chipsEl = chips ? `<span class="state-transitions">${chips}</span>` : '';
    return `<li class="state-node-row" data-index="${s.index}"${markAttrs(s)}${kindAttr}${toneAttr}${tintAttr}>` +
      labelEl + indexEl + chipsEl +
      `</li>`;
  }).join('');
  // Detail payload rides OUTSIDE the figure (a sibling) so it is not a
  // descendant of the reveal layer's chart root (the figure) — otherwise the
  // inert <template data-mark> nodes would be miscounted as marks. The note
  // comment trails everything (the static-PDF fallback). See mark-detail.js.
  const marks = stateMarks(model);
  // `.state-chart-scale` is the same natural-size geometry box the default variant
  // uses. It is what makes the row column OUT OF FLOW, so its natural height can no
  // longer flow into the figure's flex basis, and what gives fitOnly() something to
  // letterbox — before this the rows sat in flow and a tall machine was simply sheared
  // by `.chart-body`'s clip (#1360).
  return `<div class="state-chart-figure" data-variant="inline" data-sc-dir="${d}" data-states="${model.states.length}" data-transitions="${model.transitions.length}"><div class="state-chart-scale"><ol class="state-rows">${items}</ol></div></div>` +
    markDetail.detailPayload(marks) + buildStatusLegend(model) + markDetail.detailNote(marks);
}

// Build entry. `opts` is the slide's class-token array (chart-family passes
// it through). Two orthogonal axes: presentation (inline chips vs SVG) and
// direction (lr vs tb, mirroring Mermaid). `horizontal` is kept as a
// backwards-compatible alias for `lr inline`.
//
// `orientation` is the deck-wide stamp ('portrait' | 'square' | undefined for
// landscape). A horizontal (`lr`) machine can't fit a tall/narrow box — 4–6
// nodes in a row overrun and clip (a static PDF can't scroll) — so on a portrait
// deck the direction is forced back to the vertical default (`tb`). The flip
// happens HERE, not in CSS, because the browser edge-router keys off
// `data-sc-dir`: CSS and the router must agree or the arrows desync from the
// nodes. The vertical default is already the box's natural fit ("graceful
// center + fill" — 2026-06-19-chart-adaptive-sizing.md §10).
function buildStateChart(model, opts, orientation) {
  const tokens = Array.isArray(opts) ? opts : (typeof opts === 'string' ? [opts] : []);
  const portrait = orientation === 'portrait';
  const inline = tokens.includes('inline') || tokens.includes('horizontal');
  const dir = (!portrait && (tokens.includes('lr') || tokens.includes('horizontal'))) ? 'lr' : 'tb';
  const style = tokens.includes('curved') ? 'curved' : 'orthogonal';
  return inline ? renderInline(model, dir) : buildDefault(model, dir, style);
}

// ── Eyebrow helper (parity with radar / quadrant) ────────────────────────

function matchEyebrowText(sectionHtml) {
  const m = sectionHtml.match(/<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>/);
  return m ? m[1].trim() : '';
}

// ── Browser-measured layout (self-contained) ─────────────────────────────
// Runs in a browser (puppeteer for PDF, marp-vscode webview for preview).
// MUST be fully self-contained — no references to module scope — so it can
// be serialised with .toString() for the emulator's bootstrap script.
//
// It measures each laid-out node with getBoundingClientRect (real text
// metrics, any content) and draws the edges + markers into the SVG overlay.
/**
 * The diagram's accessible DESCRIPTION.
 *
 * The states used to be an `<ol>` of real `<li>` text, which is what a screen
 * reader read. Once the layout pass paints them into the overlay it hides that
 * column (`visibility:hidden`, which also removes it from the accessibility
 * tree), so without this the state NAMES would exist only inside an image and
 * a reader would hear the status legend and nothing else. Re-enumerating the
 * machine here keeps the content available — and adds the transitions, which
 * the `<li>` list never exposed. Same technique the keyed charts use for their
 * key (svg-legend.js buildDesc).
 */
// The shared fixed-point strip + entity decode (HARD RULE #15). A single-pass
// `<[^>]*>` here was both a fourth private copy and a CodeQL
// js/incomplete-multi-character-sanitization high — removing a tag can splice a
// new one out of the text around it, so one pass is not a fixed point. And the
// decode matters: markdown-it writes `Ops &amp; IT`, so without it the <desc>
// would carry the entity text and escHtml would re-escape it to `&amp;amp;`.
const plainLabel = (v) => plainText(v == null ? '' : v);

function stateChartDesc(model) {
  const byIndex = new Map(model.states.map((st) => [st.index, plainLabel(st.label)]));
  const states = model.states
    .map((st) => {
      const kind = st.isStart ? ' (start)' : st.isTerminal ? ' (end)' : '';
      const status = st.status ? `, ${st.status}` : '';
      return `${st.index}. ${plainLabel(st.label)}${kind}${status}`;
    })
    .join('; ');
  const moves = (model.transitions || [])
    .map((t) => {
      const to = byIndex.get(t.to);
      if (!to) return '';
      const on = t.event ? `on ${plainLabel(t.event)}, ` : '';
      return `${on}${byIndex.get(t.from) || t.from} to ${to}`;
    })
    .filter(Boolean)
    .join('; ');
  const parts = [];
  if (states) parts.push(`States — ${states}`);
  if (moves) parts.push(`Transitions — ${moves}`);
  return parts.length ? `<desc>${escHtml(parts.join('. '))}</desc>` : '';
}

function installStateChartLayout(rootDoc) {
  const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  // Geometry constants, in px at the HD baseline (1cqi = 12.8px). The node
  // LAYOUT is cqi (state-chart.styles.css), so at a larger render the measured
  // node boxes grow — but this JS draws edges/markers in px and would pin them
  // small. Each figure rescales G by S = (its section's px-per-cqi) / 12.8
  // (=1 at HD, ~3 at 4K) in draw(), so the whole diagram scales as one unit.
  // The loose layout pads (gap floors, TB label extent/margin, curve reserve)
  // live here too so the single rescale covers them.
  const G_BASE = {
    arrow: 7,        // arrowhead tip-to-base length
    gap: 5,          // gap between arrow tip and node boundary
    laneStep: 26,    // x-distance between edge lanes
    laneBase: 30,    // x-distance from node edge to first lane peak
    selfPeak: 30,    // x-distance from node-right to self-loop apex
    selfHalf: 12,    // y-offset of self-loop top/bottom from row center
    startR: 6,       // start-marker filled disc radius
    termOuter: 10,   // terminal-marker outer ring
    termInner: 5,    // terminal-marker inner disc
    markerGap: 40,   // distance from node edge to marker center
    pad8: 8,         // curve-apex label-clearance pad
    extentTb: 16,    // TB labeled-edge gap extent (label crosses, fixed)
    labelMargin: 9,  // half-air each side of a gap-driving label
    gapFloorTb: 34,  // min node gap, TB
    gapFloorLr: 56,  // min node gap, LR
  };
  // Working copy, rescaled per figure in draw(). S is stashed for the few
  // call-sites that need the raw factor (the label-measure font).
  const G = Object.assign({ S: 1 }, G_BASE);

  // The host's visual scale for the CURRENT figure — 1 unless something above the
  // section applies a CSS transform, which the docs filmstrip does to every slide.
  // `getBoundingClientRect()` reports the VISUAL box, while the geometry constants
  // in G (and `readFontPx`, and the stamped `--_sec-1cqi`) are LAYOUT px, so the
  // two must not be mixed: at a 0.543-scaled pane a node measured 0.543× its real
  // size and the routing was computed against full-size constants. Set once per
  // figure in draw(); read by every rect consumer through rectL() below.
  let VIS = 1;
  // A getBoundingClientRect() normalized back to layout px. Returns a plain object
  // (DOMRect is read-only) with only the fields this file uses.
  function rectL(el) {
    const r = el.getBoundingClientRect();
    if (VIS === 1) return r;
    return {
      left: r.left / VIS, top: r.top / VIS, right: r.right / VIS, bottom: r.bottom / VIS,
      width: r.width / VIS, height: r.height / VIS,
    };
  }

  // The visual scale the host applies ON TOP of the layout box, so every rect read
  // through rectL() can be normalized back to layout px. Shared by draw() and
  // fitOnly() — both measure through rectL, so both must set it, and a fit computed
  // against an unnormalized rect collapses k to VIS itself (see the note in draw()).
  function readVis(sec) {
    VIS = 1;
    if (sec && typeof sec.getBoundingClientRect === 'function' && typeof sec.offsetWidth === 'number' && sec.offsetWidth > 0) {
      const kr = sec.getBoundingClientRect().width / sec.offsetWidth;
      if (kr > 0 && kr < 100 && Math.abs(kr - 1) > 0.005) VIS = kr;
    }
  }

  // Letterbox the natural-size scale box into the figure viewport. Split out of
  // draw() so the two callers cannot drift: draw() passes the rect it already
  // measured (so the default variant is untouched), and fitOnly() measures its own.
  // BOTH sides of the ratio must be in layout px — `natRect` comes from rectL, so
  // `view` does too.
  function applyFit(fig, geo, natRect, maxK) {
    if (geo === fig || typeof fig.getBoundingClientRect !== 'function') return;
    const view = rectL(fig);
    if (!(view.width > 0 && view.height > 0 && natRect.width > 0 && natRect.height > 0)) return;
    let k = Math.min(view.height / natRect.height, view.width / natRect.width);
    if (typeof maxK === 'number' && k > maxK) k = maxK;
    geo.style.transformOrigin = 'center center';
    // Keep the absolute-centering translate; append the fit scale (scales about the
    // box center, so the diagram stays centered in the viewport).
    const fitted = Math.abs(k - 1) >= 0.005;
    geo.style.transform = 'translate(-50%, -50%)' + (fitted ? ' scale(' + k.toFixed(4) + ')' : '');
    // Declare the factor so probeFigureLegibility can judge a box it cannot otherwise
    // see. A letterboxed box never overflows — it shrank instead — so the geometric
    // probe is blind to it by construction, and for the INLINE variant there is no
    // `<svg viewBox>` for the figure arm to key on either. Without this a dense inline
    // machine shrinks past the type floor in silence (measured: 3.42px against 7.2px).
    // Removed rather than set to 1 when the fit is a no-op, so the attribute's presence
    // always means "this box was scaled".
    if (fitted) geo.setAttribute('data-fit-k', k.toFixed(4));
    else geo.removeAttribute('data-fit-k');
  }

  // The INLINE variant renders chips rather than an SVG overlay, so it carries no
  // `data-sc-transitions` and draw() never visits it — which left it as the one
  // presentation with no fit at all: `ol.state-rows` sat in flow at natural height
  // inside a figure that flex-fills a fixed stage, and `.chart-body`'s clip sheared
  // the tail (#1360: six states, 434px of rows in a 358px figure, 52px gone with the
  // sixth label). It has the same scale box now, so it takes the same letterbox.
  // Nothing else about draw() applies here — there are no edges to route.
  function fitOnly(fig) {
    const geo = fig.querySelector('.state-chart-scale');
    if (!geo) return;
    // Same reveal guard as draw(): while the docs Drawing Board tilts the figure,
    // getBoundingClientRect returns the foreshortened rects and the fit would be junk.
    if (typeof getComputedStyle === 'function') {
      let t;
      try { t = getComputedStyle(fig).transform; } catch (_e) { t = 'none'; }
      if (t && t !== 'none') return;
    }
    readVis(typeof fig.closest === 'function' ? fig.closest('section') : null);
    // Reset to bare centering BEFORE measuring, or the fit compounds on itself.
    geo.style.transform = 'translate(-50%, -50%)';
    // SHRINK ONLY (maxK = 1), and stated here rather than left implicit, because it
    // is the one place this variant should NOT match the default. The default draws a
    // diagram and grows it to own the stage; `inline` is the compact presentation —
    // its own gallery slide is captioned "the chart sits beside its prose" — so
    // letterboxing a 3-row machine UP to fill the stage would render chips at heading
    // size and contradict the variant's whole reason to exist.
    //
    // Nothing here caps the shrink direction: an over-tall machine scales down until it
    // fits. What reports a scale that went too far is probeFigureLegibility — but ONLY
    // because `applyFit` stamps `data-fit-k`. This variant emits no `<svg viewBox>`, so
    // the probe's figure arm cannot see it; without that stamp a dense inline machine
    // shrinks past the type floor in total silence, which is a worse failure than the
    // shear this fix removed. The stamp is load-bearing, not diagnostic.

    applyFit(fig, geo, rectL(geo), 1);
  }


  // ── Node shapes, drawn into the SAME overlay as the edges ─────────────────
  // The state-chart lays its nodes out as HTML on purpose: a string transform
  // cannot measure text, so the BROWSER sizes each node to its real content
  // (any label, any script, any font). That is why this file exists at all.
  //
  // But it left the chart half-HTML/half-SVG, which is exactly what chart
  // motion cannot animate: chartToScene addresses nodes inside the first <svg>,
  // and the state nodes were <li>s outside it. So rather than go back to
  // guessing glyph widths at build time — the charPx approach this architecture
  // was written to replace — the nodes are PAINTED into the overlay from the
  // boxes we just measured. Real metrics, one SVG, every mark animatable.
  //
  // The HTML column stays in the layout (it is the measuring harness, and the
  // gap math above depends on it) but is hidden once the SVG is drawn.
  function labelLines(labelEl) {
    // The line breaks the browser ACTUALLY made, not an estimate: wrap each word
    // in a probe span and group the probes by their top edge. The label's own
    // markup is restored immediately afterwards.
    const text = String(labelEl.textContent || '').trim();
    if (!text) return [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return [text];
    if (typeof labelEl.getBoundingClientRect !== 'function') return [text];
    const saved = labelEl.innerHTML;
    labelEl.innerHTML = words
      .map((w) => '<span data-scw>' + escText(w) + '</span>')
      .join(' ');
    const probes = labelEl.querySelectorAll('[data-scw]');
    const lines = [];
    let top = null;
    for (let i = 0; i < probes.length; i++) {
      const t = Math.round(probes[i].getBoundingClientRect().top);
      if (top === null || Math.abs(t - top) > 1) { lines.push([]); top = t; }
      lines[lines.length - 1].push(probes[i].textContent);
    }
    labelEl.innerHTML = saved;
    return lines.length ? lines.map((a) => a.join(' ')) : [text];
  }

  // Unique per figure — two state-charts in one document must not share a def id
  // (the first would win for both, the SVG duplicate-id trap the pie/radar defs
  // also guard against).
  let scGradSeq = 0;
  let gradId = 'sc-node-fill-0';
  let tintGradIds = Object.create(null);
  // A gradient PER DISTINCT TINT, not one gradient reading a custom property.
  // That shape is forced: an SVG gradient stop resolves `var()` against the
  // <linearGradient> element's own computed style, NOT against the rect that
  // references it — so `--fill-hue` set on the node cannot reach these stops.
  // The set is bounded by the machine's distinct `:::` tints (typically 0-3),
  // and an untinted figure emits exactly the one gradient it always did, with
  // the same id, so its markup is unchanged.
  function nodeFillDefs(tints) {
    gradId = 'sc-node-fill-' + (++scGradSeq);
    const stop = (hue, pos, l, d) =>
      '<stop offset="' + pos + '" style="stop-color:light-dark(' +
        'color-mix(in oklab, var(' + hue + ') var(' + l + '), var(--bg)),' +
        'color-mix(in oklab, var(' + hue + ') var(' + d + '), black))"/>';
    const ramp = (id, hue) =>
      '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        stop(hue, '0%', '--chart-fill-top-l', '--chart-fill-top-d') +
        stop(hue, '100%', '--chart-fill-bottom-l', '--chart-fill-bottom-d') +
      '</linearGradient>';
    tintGradIds = Object.create(null);
    let out = ramp(gradId, '--muted-mark');
    let i = 0;
    for (const t of (tints || [])) {
      const id = gradId + '-t' + (++i);
      tintGradIds[t] = id;
      out += ramp(id, '--' + t);
    }
    return '<defs>' + out + '</defs>';
  }

  function nodeShape(n, el, figRect) {
    const kind = el.getAttribute('data-kind') || '';
    const mark = el.getAttribute('data-mark');
    // The node's inner spans are read through optional lookups: the routing
    // test-harness drives draw() with lightweight node stubs that expose only
    // the attributes and a box, so a missing querySelector must degrade to
    // "rect but no text", never throw and take the whole diagram down.
    const q = typeof el.querySelector === 'function' ? (sel) => el.querySelector(sel) : () => null;
    const idxEl = q('.state-index');
    const labEl = q('.state-label');
    const rx = Math.min(n.h / 2, 10 * G.S);
    // The node tile carries the CANONICAL CHART FILL — the same top-to-bottom
    // hue-into-canvas gradient the kanban card, progress bar and gantt bar use.
    // SVG `fill` cannot take a CSS gradient, so it references the inline
    // <linearGradient> emitted with this figure. Painting it flat instead
    // (an earlier cut) visibly flattened every node against the rest of the
    // family, so the gradient is not decoration — it is the shared language.
    // `:::token` on the state. The rect points at that tint's gradient, and
    // `--fill-hue` is set inline so the stroke's color-mix (which DOES resolve
    // against this element) tracks the same hue instead of staying muted.
    const tint = typeof el.getAttribute === 'function' ? el.getAttribute('data-tint') : null;
    const useGrad = (tint && tintGradIds[tint]) || gradId;
    let out = '<rect class="state-node-shape" data-index="' + n.index + '"' +
      (mark != null ? ' data-mark="' + escText(mark) + '"' : '') +
      (kind ? ' data-kind="' + escText(kind) + '"' : '') +
      (tint ? ' style="--fill-hue:var(--' + tint + ')"' : '') +
      ' data-anima-role="region"' +
      ' x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) +
      '" width="' + n.w.toFixed(1) + '" height="' + n.h.toFixed(1) +
      '" rx="' + rx.toFixed(1) + '" fill="url(#' + useGrad + ')"/>' +
      // The leading accent edge — the HTML card's `border-left:
      // var(--chart-fill-accent) solid var(--fill-ink)`. SVG has no per-side
      // stroke, so it is a narrow rect at the node's left edge.
      '<rect class="state-node-accent" aria-hidden="true"' +
      (kind ? ' data-kind="' + escText(kind) + '"' : '') +
      ' x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) +
      '" width="' + Math.min((kind === 'start' ? 4.5 : 2.5) * G.S, n.w).toFixed(1) +
      '" height="' + n.h.toFixed(1) +
      '" rx="' + Math.min(1.25 * G.S, rx).toFixed(1) + '"/>';
    // Terminal nodes wear an offset ring — the HTML card's `outline` +
    // `outline-offset`, which SVG has no equivalent for, so it is a second rect.
    if (kind === 'terminal') {
      const o = 2.2 * G.S;
      out += '<rect class="state-node-ring" aria-hidden="true"' +
        ' x="' + (n.x - o).toFixed(1) + '" y="' + (n.y - o).toFixed(1) +
        '" width="' + (n.w + o * 2).toFixed(1) + '" height="' + (n.h + o * 2).toFixed(1) +
        '" rx="' + (rx + o).toFixed(1) + '"/>';
    }

    // Index badge — painted at the measured position of its own span, so the
    // badge sits exactly where CSS put it rather than at a guessed inset.
    // How far dagre moved this node from where the browser measured it. Zero on
    // every un-re-ranked machine, so the painted output is unchanged there.
    const ddx = n.x - (n.mx != null ? n.mx : n.x);
    const ddy = n.y - (n.my != null ? n.my : n.y);

    if (idxEl) {
      const ir = rectL(idxEl);
      const st = idxEl.getAttribute('data-s');
      const cx = ir.left - figRect.left + ir.width / 2 + ddx;
      const cy = ir.top - figRect.top + ir.height / 2 + ddy;
      const r = Math.max(ir.width, ir.height) / 2;
      if (st) {
        out += '<circle class="state-index-disc" data-s="' + escText(st) + '" cx="' + cx.toFixed(1) +
          '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
      }
      out += '<text class="state-index-t"' + (st ? ' data-s="' + escText(st) + '"' : '') +
        ' x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) +
        '" text-anchor="middle" dominant-baseline="central" font-size="' +
        readFontPx(idxEl).toFixed(1) + '">' + escText(idxEl.textContent) + '</text>';
    }

    // Label — one <tspan> per line the browser actually produced, centered on
    // the label's measured box so a 2-line label stays optically centered.
    if (labEl) {
      const lines = labelLines(labEl);
      const lr = rectL(labEl);
      const fs = readFontPx(labEl);
      const lh = lines.length > 1 ? lr.height / lines.length : lr.height;
      const cx = lr.left - figRect.left + lr.width / 2 + ddx;
      const first = lr.top - figRect.top + lh / 2 + ddy;
      const tspans = lines.map((ln, i) =>
        '<tspan x="' + cx.toFixed(1) + '" y="' + (first + i * lh).toFixed(1) + '">' +
        escText(ln) + '</tspan>').join('');
      out += '<text class="state-label-t" text-anchor="middle" dominant-baseline="central" ' +
        'font-size="' + fs.toFixed(1) + '">' + tspans + '</text>';
    }
    return out;
  }

  function readFontPx(el) {
    try {
      const view = el.ownerDocument?.defaultView ||
        (typeof window !== 'undefined' ? window : null);
      if (!view || typeof view.getComputedStyle !== 'function') return 12;
      const v = parseFloat(view.getComputedStyle(el).fontSize);
      return Number.isFinite(v) && v > 0 ? v : 12;
    } catch { return 12; }
  }

  function arrowhead(x, y, angleDeg, dir) {
    const s = G.arrow;
    const rad = angleDeg * Math.PI / 180;
    const c = Math.cos(rad), si = Math.sin(rad);
    const bcx = x - c * s, bcy = y - si * s;
    const px = -si, py = c, hw = s * 0.5;
    const p = x.toFixed(1) + ',' + y.toFixed(1) + ' ' +
            (bcx + px * hw).toFixed(1) + ',' + (bcy + py * hw).toFixed(1) + ' ' +
            (bcx - px * hw).toFixed(1) + ',' + (bcy - py * hw).toFixed(1);
    return '<polygon class="state-edge-arrow" data-anima-role="bar" data-dir="' + dir + '" points="' + p + '"/>';
  }

  // Escapes for BOTH text and attribute position. The quote matters: nodeShape
  // interpolates node attributes (data-mark / data-kind / data-s)
  // into a string that is then assigned via `svg.innerHTML`, inside the preview
  // frame — the exact sink HARD RULE #22 exists to police. Those values are
  // constrained upstream today (status is a closed keyword set, kind is a
  // literal, mark is numeric), so this is not exploitable; it is safe by an
  // invariant nothing enforces, which is not a property worth relying on in a
  // file whose whole job is turning author content into markup.
  function escText(t) {
    return String(t).replace(/[&<>"']/g, (ch) => (
      ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;'
        : ch === '"' ? '&quot;' : '&#39;'));
  }

  function edgeLabel(x, y, event, dir, anchor) {
    return '<text class="state-edge-label" data-dir="' + dir + '" x="' + x.toFixed(1) +
      '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || 'middle') +
      '" dominant-baseline="middle">' + escText(event) + '</text>';
  }

  // Measures rendered label width in px, matching the .state-edge-label rule
  // (0.859375cqi, = 11px at HD; resolves the LABEL VOICE from the figure).
  // Scaled by S so the canvas measure tracks the cqi-rendered label at any
  // resolution. One shared canvas context; returns 0 for empty events.
  //
  // READS --font-label, THE SAME TOKEN THE CSS NAMES. It used to read
  // --font-mono, which was correct only while `.state-edge-label` also named
  // mono. When the label-voice sweep moved that rule to --font-label the two
  // silently diverged: off sketch nothing changed (--font-label defaults to
  // var(--font-mono)), but under `sketch` the packer allocated JetBrains Mono
  // clearance for labels rendered in the wider hand sans, so `assignBows` could
  // seat two edge labels close enough to touch. Reading the rendered token is
  // what makes the measure follow the CSS instead of shadowing it.
  function makeLabelW(fig, S) {
    let ctx = null;
    const fs = (11 * (S || 1)).toFixed(2);
    let font = fs + 'px monospace';
    try {
      const face = (getComputedStyle(fig).getPropertyValue('--font-label') || '').trim();
      if (face) font = fs + 'px ' + face;
      const c = doc.createElement('canvas');
      ctx = c.getContext('2d');
      ctx.font = font;
    } catch { ctx = null; }
    return (s) => {
      if (!s) return 0;
      if (ctx) return ctx.measureText(s).width;
      return String(s).length * 6.6 * (S || 1);
    };
  }

  // Geometry-aware bow packing. Each non-adjacent edge must clear (a) the
  // WIDEST node across its [lo..hi] span and (b) every inner edge already
  // placed on the same side whose rows it overlaps — including that edge's
  // label, which is horizontal text and so consumes cross-axis width. We
  // sort by span ascending (innermost first) and carry a per-row frontier
  // of the outermost extent consumed so far; each edge bows G.laneBase past
  // the deeper of its node-clearance and that frontier, then publishes its
  // own outer extent (curve apex + label half-width) back to the frontier.
  // Sets t._peak (the control-point cross coordinate) per edge. Forward
  // skips and back-edges pack independently (opposite gutters).
  function assignBows(transitions, dir, labelW) {
    [true, false].forEach((max) => {
      // Pack each gutter independently. `max` = the max-gutter side (TB right
      // / LR bottom); the other is the min gutter. gutterMax routes forward
      // skips, back-edges, and convergence edges to the right side.
      const list = [];
      transitions.forEach((t) => {
        if (t.isSelf || t.to === t.from + 1) return;
        if (gutterMax(t, dir) !== max) return;
        list.push({ t, lo: Math.min(t.from, t.to), hi: Math.max(t.from, t.to), span: Math.abs(t.to - t.from) });
      });
      list.sort((a, b) => a.span - b.span || a.lo - b.lo);
      const frontier = {};
      list.forEach((it) => {
        const t = it.t;
        const nodeClear = (dir === 'lr' ? (max ? t._maxB : t._minT) : (max ? t._maxR : t._minL)) + (max ? G.gap : -G.gap);
        let front = max ? -Infinity : Infinity;
        for (let r = it.lo; r <= it.hi; r++) {
          if (frontier[r] == null) continue;
          front = max ? Math.max(front, frontier[r]) : Math.min(front, frontier[r]);
        }
        const base = max ? Math.max(nodeClear, front) : Math.min(nodeClear, front);
        const peak = base + (max ? G.laneBase : -G.laneBase);
        t._peak = peak;
        // The curve apex sits exactly at peak and its label centers there, so
        // the outer extent is peak plus the label half-width (overhang) and a
        // pad. The next outer edge clears that.
        const half = labelW(t.event || '') / 2;
        const reserve = (half > 0 ? half : 0) + G.pad8;
        const outer = peak + (max ? reserve : -reserve);
        for (let r = it.lo; r <= it.hi; r++) frontier[r] = outer;
      });
    });
  }

  // ── Markers ──
  // TB: start disc sits above the first node (arrow down in); terminal ring
  // below the last (arrow down out). LR transposes: start to the left
  // (arrow right in), terminal to the right (arrow right out).
  function startMarker(n, dir) {
    if (dir === 'lr') {
      const cy = n.y + n.h / 2;
      const discCx = n.x - G.markerGap;
      const lineStart = discCx + G.startR;
      const tipX = n.x - G.gap;
      const lineEnd = tipX - G.arrow;
      return '<g class="state-marker" data-kind="start">' +
        '<circle class="state-marker-disc" cx="' + discCx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + G.startR + '"/>' +
        '<path class="state-marker-line" d="M ' + lineStart.toFixed(1) + ' ' + cy.toFixed(1) + ' L ' + lineEnd.toFixed(1) + ' ' + cy.toFixed(1) + '"/>' +
        arrowhead(tipX, cy, 0, 'start') + '</g>';
    }
    const cx = n.x + n.w / 2;
    const discCy = n.y - G.markerGap;
    const lineStart = discCy + G.startR;
    const tipY = n.y - G.gap;
    const lineEnd = tipY - G.arrow;
    return '<g class="state-marker" data-kind="start">' +
      '<circle class="state-marker-disc" cx="' + cx + '" cy="' + discCy.toFixed(1) + '" r="' + G.startR + '"/>' +
      '<path class="state-marker-line" d="M ' + cx + ' ' + lineStart.toFixed(1) + ' L ' + cx + ' ' + lineEnd.toFixed(1) + '"/>' +
      arrowhead(cx, tipY, 90, 'start') + '</g>';
  }

  // Single final pseudo-state: just the double ring at the synthetic node's
  // center. The converging edges from each sink provide the connectors.
  function finalRing(n) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    return '<g class="state-marker" data-kind="terminal">' +
      '<circle class="state-marker-ring" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + G.termOuter + '"/>' +
      '<circle class="state-marker-disc" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + G.termInner + '"/>' + '</g>';
  }

  // Which gutter an edge routes through (max side = TB right / LR bottom).
  // assignGutters precomputes t._gutterMax via a uniform load-balancing pass
  // (no edge-type rules); this reads it, falling back to the natural side
  // (TB forward → right, back → left; LR transposed) if unset.
  function gutterMax(t, dir) {
    if (t._gutterMax != null) return t._gutterMax;
    return dir === 'lr' ? t.to < t.from : t.to > t.from;
  }

  // Uniform gutter assignment: minimize CROSSINGS. Two edges in the same
  // gutter cross when their row-spans interleave (overlap with neither
  // containing the other). Each edge is placed (longest first) in the gutter
  // where it interleaves with fewer already-placed edges; direction (natural
  // side) breaks ties. No per-type rules — interleaving fans (e.g. a hub's
  // outgoing skips vs the convergence join) separate onto opposite gutters
  // emergently, because that's the zero-crossing arrangement.
  function assignGutters(transitions, dir) {
    const ge = transitions.filter((t) => !t.isSelf && t.to !== t.from + 1);
    const lo = (t) => Math.min(t.from, t.to), hi = (t) => Math.max(t.from, t.to);
    const interleave = (a, b) =>
      (lo(a) < lo(b) && lo(b) < hi(a) && hi(a) < hi(b)) ||
      (lo(b) < lo(a) && lo(a) < hi(b) && hi(b) < hi(a));
    const order = ge.slice().sort((a, b) =>
      (hi(b) - lo(b)) - (hi(a) - lo(a)) || (a.from - b.from) || (a.to - b.to));
    const placed = [[], []]; // [min-gutter, max-gutter]
    order.forEach((t) => {
      const natMax = dir === 'lr' ? t.to < t.from : t.to > t.from;
      const confMax = placed[1].reduce((c, o) => c + (interleave(t, o) ? 1 : 0), 0);
      const confMin = placed[0].reduce((c, o) => c + (interleave(t, o) ? 1 : 0), 0);
      const useMax = confMax !== confMin ? confMax < confMin : natMax;
      t._gutterMax = useMax;
      placed[useMax ? 1 : 0].push(t);
    });
  }

  // ── Ports ──
  // Each gutter-side face exposes 5 fixed anchor slots at (i+1)/6 of the
  // edge. A skip/back edge picks one slot per endpoint: a lone connection
  // takes the middle (s2); when several edges share a face they spread
  // evenly across the 5 slots, ordered by the OTHER endpoint's flow
  // position so the arcs fan out without crossing. fwd = max-gutter face,
  // back = min-gutter face (see gutterMax). Sets fromOff / toOff (the
  // along-face coordinate: TB y, LR x). The adjacent spine stays centered.
  function assignPorts(transitions, byIndex, dir) {
    const reg = {};
    const R = (idx) => (reg[idx] || (reg[idx] = { fwd: [], back: [] }));
    const selfs = [];
    transitions.forEach((t) => {
      const from = byIndex[t.from], to = byIndex[t.to];
      if (!from || !to) return;
      if (t.isSelf) { selfs.push(t); return; }
      if (t.to === t.from + 1) return;            // adjacent spine, no gutter slot
      const key = gutterMax(t, dir) ? 'fwd' : 'back';
      R(t.from)[key].push({ t, role: 'from', other: t.to });
      R(t.to)[key].push({ t, role: 'to', other: t.from });
    });
    // Self-loops are CORNER loops, not slot edges: they route on the emptier
    // side face (ties → conventional: right for TB, bottom for LR) and wrap
    // the corner between that face and the trail face. They keep their own
    // fixed anchors, so they don't consume a skip/back slot — just tag side.
    selfs.forEach((t) => {
      const r = R(t.from);
      const useBack = r.fwd.length === r.back.length ? dir === 'lr' : r.back.length < r.fwd.length;
      t._selfSide = dir === 'lr' ? (useBack ? 'bottom' : 'top') : (useBack ? 'left' : 'right');
    });
    const flowOf = (idx) => { const n = byIndex[idx]; return dir === 'lr' ? n.x + n.w / 2 : n.y + n.h / 2; };
    Object.keys(reg).forEach((idx) => {
      const n = byIndex[idx];
      if (!n) return;
      const lo = dir === 'lr' ? n.x : n.y;
      const ext = dir === 'lr' ? n.w : n.h;
      ['fwd', 'back'].forEach((kind) => {
        const list = reg[idx][kind];
        if (!list.length) return;
        // Slot order, direction-aware to avoid crossings on a shared face:
        // edges whose OTHER endpoint is on the trailing side of this node take
        // the top slots, leading-side edges the bottom. Within each group the
        // farthest endpoint sits nearest the middle (descending), so the
        // deeper arc never crosses the shallower one. (All-same-direction
        // faces — router/ten-step/wizard — reduce to plain descending.)
        const self = flowOf(+idx);
        list.sort((a, b) => {
          const fa = flowOf(a.other), fb = flowOf(b.other);
          const aUp = fa < self, bUp = fb < self;
          if (aUp !== bUp) return aUp ? -1 : 1;
          return fb - fa;
        });
        const N = list.length;
        list.forEach((item, k) => {
          let frac;
          if (N === 1) frac = 0.5;                       // lone connection → middle slot
          else if (N <= 5) frac = (Math.round(k * 4 / (N - 1)) + 1) / 6;  // even across the 5 slots
          else frac = (k + 1) / (N + 1);                 // overflow → subdivide finer
          const off = lo + frac * ext;
          if (item.role === 'from') item.t.fromOff = off; else item.t.toOff = off;
        });
      });
    });
  }

  // ── Edges ──
  // TB flows down the center; adjacent steps run straight bottom→top.
  // Skip/back edges attach to the gutter-side faces — forward skips on the
  // RIGHT face (arrow points left into it), backs on the LEFT face (arrow
  // points right) — and a single cubic bows out to the gutter peak. The
  // attachment point along the face comes from the 5-slot picker
  // (fromOff/toOff). Self-loops stay on the right. LR is the 90° transpose:
  // forward skips arc over the TOP face, backs under the BOTTOM.
  function edgeTB(t, from, to, ev, style) {
    if (t.isSelf) {
      // Corner loop: tail on the TOP edge, head on the side edge, wrapping the
      // top corner. Right side T5→R1, left side T1→R1's mirror (T1→L1).
      const P = G.selfPeak;
      const ty = from.y - G.gap;                 // tail exits above the top edge
      const hy = from.y + from.h / 6;            // head near the top of the side edge (slot 1)
      if (t._selfSide === 'left') {
        const tx = from.x + from.w / 6;          // T1
        const tip = from.x - G.gap;              // arrow tip just left of left edge
        const hx = tip - G.arrow;                // curve end (base)
        const d = 'M ' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
          ' C ' + tx.toFixed(1) + ' ' + (ty - P).toFixed(1) + ', ' + (hx - P).toFixed(1) + ' ' + hy.toFixed(1) + ', ' + hx.toFixed(1) + ' ' + hy.toFixed(1);
        return '<path class="state-edge" data-anima-role="bar" data-dir="self" data-self="true" d="' + d + '"/>' +
          arrowhead(tip, hy, 0, 'self') +
          (ev ? edgeLabel(from.x - P * 0.7, ty - P * 0.2, ev, 'self', 'middle') : '');
      }
      const tx = from.x + from.w * 5 / 6;        // T5
      const tip = from.x + from.w + G.gap;       // arrow tip just right of right edge
      const hx = tip + G.arrow;                  // curve end (base)
      const d = 'M ' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
        ' C ' + tx.toFixed(1) + ' ' + (ty - P).toFixed(1) + ', ' + (hx + P).toFixed(1) + ' ' + hy.toFixed(1) + ', ' + hx.toFixed(1) + ' ' + hy.toFixed(1);
      return '<path class="state-edge" data-anima-role="bar" data-dir="self" data-self="true" d="' + d + '"/>' +
        arrowhead(tip, hy, 180, 'self') +
        (ev ? edgeLabel(from.x + from.w + P * 0.7, ty - P * 0.2, ev, 'self', 'middle') : '');
    }
    if (t.to === t.from + 1) {
      const x = from.x + from.w / 2;
      const ys = from.y + from.h + G.gap;
      const tip = to.y - G.gap;
      const ye = tip - G.arrow;
      return '<path class="state-edge" data-anima-role="bar" data-dir="forward" d="M ' + x.toFixed(1) + ' ' + ys.toFixed(1) + ' L ' + x.toFixed(1) + ' ' + ye.toFixed(1) + '"/>' +
        arrowhead(x, tip, 90, 'forward') +
        (ev ? edgeLabel(x, (ys + tip) / 2, ev, 'forward', 'middle') : '');
    }
    // Skip/back bow. Endpoint y comes from the 5-slot picker. Two styles:
    // ORTHOGONAL (default) — round out to peak, run STRAIGHT down the gutter
    // at peak (every intermediate node cleared by construction), round back
    // in. CURVED — a single cubic bow; its peak is boosted to _peakCurved so
    // the reduced reach still clears the widest node (capped). Back-edges
    // mirror on the left.
    const yi = t.fromOff != null ? t.fromOff : from.y + from.h / 2;
    const yj = t.toOff != null ? t.toOff : to.y + to.h / 2;
    const dir = yj >= yi ? 1 : -1;
    const r = Math.max(2, Math.min(Math.abs(yj - yi) / 2 - 1, 16));
    const track = (px, sx, ex) =>
      'M ' + sx.toFixed(1) + ' ' + yi.toFixed(1) +
      ' C ' + px.toFixed(1) + ' ' + yi.toFixed(1) + ', ' + px.toFixed(1) + ' ' + yi.toFixed(1) + ', ' + px.toFixed(1) + ' ' + (yi + dir * r).toFixed(1) +
      ' L ' + px.toFixed(1) + ' ' + (yj - dir * r).toFixed(1) +
      ' C ' + px.toFixed(1) + ' ' + yj.toFixed(1) + ', ' + px.toFixed(1) + ' ' + yj.toFixed(1) + ', ' + ex.toFixed(1) + ' ' + yj.toFixed(1);
    const curve = (px, sx, ex) =>
      'M ' + sx.toFixed(1) + ' ' + yi.toFixed(1) + ' C ' + px.toFixed(1) + ' ' + yi.toFixed(1) + ', ' + px.toFixed(1) + ' ' + yj.toFixed(1) + ', ' + ex.toFixed(1) + ' ' + yj.toFixed(1);
    const my = (yi + yj) / 2;
    // Dash style follows DIRECTION (back-edge dashes), not gutter — an edge
    // relocated to balance load keeps its true style.
    const ddir = t.to > t.from ? 'forward' : 'back';
    if (gutterMax(t, 'tb')) {
      const xs = from.x + from.w + G.gap;
      const tipx = to.x + to.w + G.gap;
      const xe = tipx + G.arrow;
      const peak = t._peak != null ? t._peak : (t._maxR != null ? t._maxR : Math.max(from.x + from.w, to.x + to.w)) + G.gap + G.laneBase;
      if (style === 'curved') {
        const pk = Math.min(Math.max(peak, t._peakCurved != null ? t._peakCurved : peak), peak + 260);
        return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + curve(pk, xs, xe) + '"/>' +
          arrowhead(tipx, yj, 180, ddir) +
          (ev ? edgeLabel(0.75 * pk + 0.125 * (xs + xe), my, ev, ddir, 'middle') : '');
      }
      return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + track(peak, xs, xe) + '"/>' +
        arrowhead(tipx, yj, 180, ddir) +
        (ev ? edgeLabel(peak, my, ev, ddir, 'middle') : '');
    }
    const bxs = from.x - G.gap;
    const btipx = to.x - G.gap;
    const bxe = btipx - G.arrow;
    const bpeak = t._peak != null ? t._peak : (t._minL != null ? t._minL : Math.min(from.x, to.x)) - G.gap - G.laneBase;
    if (style === 'curved') {
      const pk = Math.max(Math.min(bpeak, t._peakCurved != null ? t._peakCurved : bpeak), bpeak - 260);
      return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + curve(pk, bxs, bxe) + '"/>' +
        arrowhead(btipx, yj, 0, ddir) +
        (ev ? edgeLabel(0.75 * pk + 0.125 * (bxs + bxe), my, ev, ddir, 'middle') : '');
    }
    return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + track(bpeak, bxs, bxe) + '"/>' +
      arrowhead(btipx, yj, 0, ddir) +
      (ev ? edgeLabel(bpeak, my, ev, ddir, 'middle') : '');
  }

  function edgeLR(t, from, to, ev, style) {
    if (t.isSelf) {
      // Corner loop (LR transpose): tail on the LEFT edge, head on the gutter
      // edge (bottom or top), wrapping the left corner.
      const P = G.selfPeak;
      const tx = from.x - G.gap;                 // tail exits left of the left edge
      const hx = from.x + from.w / 6;            // head near the left of the gutter edge
      if (t._selfSide === 'top') {
        const ty = from.y + from.h / 6;          // L1
        const tip = from.y - G.gap;              // arrow tip just above the top edge
        const hy = tip - G.arrow;
        const d = 'M ' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
          ' C ' + (tx - P).toFixed(1) + ' ' + ty.toFixed(1) + ', ' + hx.toFixed(1) + ' ' + (hy - P).toFixed(1) + ', ' + hx.toFixed(1) + ' ' + hy.toFixed(1);
        return '<path class="state-edge" data-anima-role="bar" data-dir="self" data-self="true" d="' + d + '"/>' +
          arrowhead(hx, tip, 90, 'self') +
          (ev ? edgeLabel(tx - P * 0.2, from.y - P * 0.7, ev, 'self', 'middle') : '');
      }
      const ty = from.y + from.h * 5 / 6;        // L5
      const tip = from.y + from.h + G.gap;       // arrow tip just below the bottom edge
      const hy = tip + G.arrow;
      const d = 'M ' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
        ' C ' + (tx - P).toFixed(1) + ' ' + ty.toFixed(1) + ', ' + hx.toFixed(1) + ' ' + (hy + P).toFixed(1) + ', ' + hx.toFixed(1) + ' ' + hy.toFixed(1);
      return '<path class="state-edge" data-anima-role="bar" data-dir="self" data-self="true" d="' + d + '"/>' +
        arrowhead(hx, tip, 270, 'self') +
        (ev ? edgeLabel(tx - P * 0.2, from.y + from.h + P * 0.7, ev, 'self', 'middle') : '');
    }
    if (t.to === t.from + 1) {
      const y = from.y + from.h / 2;
      const xs = from.x + from.w + G.gap;
      const tip = to.x - G.gap;
      const xe = tip - G.arrow;
      return '<path class="state-edge" data-anima-role="bar" data-dir="forward" d="M ' + xs.toFixed(1) + ' ' + y.toFixed(1) + ' L ' + xe.toFixed(1) + ' ' + y.toFixed(1) + '"/>' +
        arrowhead(tip, y, 0, 'forward') +
        (ev ? edgeLabel((xs + tip) / 2, y, ev, 'forward', 'middle') : '');
    }
    // Side-face racetrack (LR transpose). Forward skips leave the left node's
    // TOP face, round up to the gutter peak, run STRAIGHT across at peak (so
    // intermediate nodes are cleared), then round down into the right node's
    // top face (arrow down). Back-edges mirror under the bottom.
    const xi = t.fromOff != null ? t.fromOff : from.x + from.w / 2;
    const xj = t.toOff != null ? t.toOff : to.x + to.w / 2;
    const dir = xj >= xi ? 1 : -1;
    const r = Math.max(2, Math.min(Math.abs(xj - xi) / 2 - 1, 16));
    const track = (py, sy, ey) =>
      'M ' + xi.toFixed(1) + ' ' + sy.toFixed(1) +
      ' C ' + xi.toFixed(1) + ' ' + py.toFixed(1) + ', ' + xi.toFixed(1) + ' ' + py.toFixed(1) + ', ' + (xi + dir * r).toFixed(1) + ' ' + py.toFixed(1) +
      ' L ' + (xj - dir * r).toFixed(1) + ' ' + py.toFixed(1) +
      ' C ' + xj.toFixed(1) + ' ' + py.toFixed(1) + ', ' + xj.toFixed(1) + ' ' + py.toFixed(1) + ', ' + xj.toFixed(1) + ' ' + ey.toFixed(1);
    const curve = (py, sy, ey) =>
      'M ' + xi.toFixed(1) + ' ' + sy.toFixed(1) + ' C ' + xi.toFixed(1) + ' ' + py.toFixed(1) + ', ' + xj.toFixed(1) + ' ' + py.toFixed(1) + ', ' + xj.toFixed(1) + ' ' + ey.toFixed(1);
    const mx = (xi + xj) / 2;
    const ddir = t.to > t.from ? 'forward' : 'back';
    if (!gutterMax(t, 'lr')) {
      const ys = from.y - G.gap;
      const tipy = to.y - G.gap;
      const ye = tipy - G.arrow;
      const peak = t._peak != null ? t._peak : (t._minT != null ? t._minT : Math.min(from.y, to.y)) - G.gap - G.laneBase;
      if (style === 'curved') {
        const pk = Math.max(Math.min(peak, t._peakCurved != null ? t._peakCurved : peak), peak - 260);
        return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + curve(pk, ys, ye) + '"/>' +
          arrowhead(xj, tipy, 90, ddir) +
          (ev ? edgeLabel(mx, 0.75 * pk + 0.125 * (ys + ye), ev, ddir, 'middle') : '');
      }
      return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + track(peak, ys, ye) + '"/>' +
        arrowhead(xj, tipy, 90, ddir) +
        (ev ? edgeLabel(mx, peak, ev, ddir, 'middle') : '');
    }
    const bys = from.y + from.h + G.gap;
    const btipy = to.y + to.h + G.gap;
    const bye = btipy + G.arrow;
    const bpeak = t._peak != null ? t._peak : (t._maxB != null ? t._maxB : Math.max(from.y + from.h, to.y + to.h)) + G.gap + G.laneBase;
    if (style === 'curved') {
      const pk = Math.min(Math.max(bpeak, t._peakCurved != null ? t._peakCurved : bpeak), bpeak + 260);
      return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + curve(pk, bys, bye) + '"/>' +
        arrowhead(xj, btipy, 270, ddir) +
        (ev ? edgeLabel(mx, 0.75 * pk + 0.125 * (bys + bye), ev, ddir, 'middle') : '');
    }
    return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + track(bpeak, bys, bye) + '"/>' +
      arrowhead(xj, btipy, 270, ddir) +
      (ev ? edgeLabel(mx, bpeak, ev, ddir, 'middle') : '');
  }

  // A dagre-routed edge: the polyline dagre produced, trimmed to the target's
  // border so the arrowhead sits ON the box rather than under it, with the label
  // at the polyline's midpoint.
  function edgeDagre(t, from, to, ev) {
    const pts = t._pts.slice();
    // dagre routes CENTRE to CENTRE, so the polyline's last point sits inside the
    // target box where an arrowhead would be hidden by the node's own fill. Clip
    // it to the border.
    //
    // This is a genuine walk BACK, not a look at the final segment: an earlier
    // cut ended every branch of the loop in `break`, so it examined one segment
    // and stopped — correct only while dagre's last vertex happened to land near
    // the border, and wrong for any route that ends deep inside the box.
    const cx = to.x + to.w / 2, cy = to.y + to.h / 2;
    const hw = to.w / 2 + G.gap * 0.15, hh = to.h / 2 + G.gap * 0.15;
    const inside = (q) => Math.abs(q.x - cx) <= hw && Math.abs(q.y - cy) <= hh;

    // The last vertex that is OUTSIDE the box. Everything after it is inside and
    // gets dropped; the border crossing is interpolated on the segment leaving it.
    let out = -1;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (!inside(pts[i])) { out = i; break; }
    }
    let tip;
    if (out < 0) {
      // The whole route lies inside the target — degenerate, but reachable for
      // overlapping boxes. Aim at the centre and keep the line rather than
      // emitting a NaN path.
      tip = { x: cx, y: cy };
      pts.length = Math.max(1, pts.length - 1);
    } else if (out === pts.length - 1) {
      tip = pts[out];                    // already ends outside; nothing to clip
    } else {
      const a = pts[out], b = pts[out + 1];
      // Bisect for the crossing: monotone in u because `a` is outside and `b` is
      // inside, so 24 halvings put the tip within a fraction of a pixel.
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (inside({ x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid })) hi = mid;
        else lo = mid;
      }
      tip = { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
      pts.length = out + 1;
    }
    pts.push(tip);

    const prev = pts.length > 1 ? pts[pts.length - 2] : { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180 / Math.PI;
    const ddir = t.to > t.from ? 'forward' : 'back';
    const d = 'M ' + pts.map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' L ');
    const mid = pts[Math.floor(pts.length / 2)] || tip;
    return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + d + '"/>' +
      arrowhead(tip.x, tip.y, ang, ddir) +
      (ev ? edgeLabel(mid.x, mid.y, ev, ddir, 'middle') : '');
  }

  function edge(t, byIndex, dir, style) {
    const from = byIndex[t.from], to = byIndex[t.to];
    if (!from || !to) return '';
    const ev = t.event || '';
    // A re-ranked machine draws dagre's route; everything else — every chain,
    // and every self-loop on any machine — keeps the column router unchanged.
    const body = t._pts && t._pts.length > 1
      ? edgeDagre(t, from, to, ev)
      : (dir === 'lr' ? edgeLR(t, from, to, ev, style) : edgeTB(t, from, to, ev, style));
    const d = t.isSelf ? 'self' : (t.to > t.from ? 'forward' : 'back');
    // One style on the GROUP rather than on each of the fourteen `<path>` emit
    // sites: custom properties inherit, so `--edge-tint` reaches the path, the
    // arrowhead polygon and the label from here. The CSS reads each with the
    // untinted value as its fallback, so an untinted edge emits no style
    // attribute and renders byte-identically.
    const tintStyle = (t.tint ? '--edge-tint:var(--' + t.tint + ');' : '') +
                      (t.labelBg ? '--edge-label-bg:var(--' + t.labelBg + ');' : '');
    return '<g class="state-edge-group" data-dir="' + d + '"' +
      (tintStyle ? ' style="' + tintStyle + '"' : '') + '>' + body + '</g>';
  }

  // ── dagre positioning ──────────────────────────────────────────────────────
  //
  // The BROWSER measures each node's real size; dagre decides where the boxes
  // go. That split is the whole integration: dagre takes width/height as INPUT
  // and cannot measure text, so it replaces the POSITIONING half of the layout
  // and nothing else. The existing router still draws the edges between the
  // boxes — it routes between known rects, which is exactly what it gets — so
  // self-loops (which dagre does not route at all) keep working unchanged.
  //
  // WHEN IT IS ADOPTED is the load-bearing decision. dagre runs on every
  // machine, but its answer is only USED when it puts two nodes in one rank —
  // i.e. when the machine actually branches. A chain lays out as a column under
  // both, so keeping the CSS positions there means every shipped gallery is
  // byte-identical by construction rather than by a spacing constant that
  // happens to match today. `state i at row i` also survives where it holds,
  // which is the forcing function the numbered authoring exists for.
  //
  // Returns null when dagre is unreachable, when the machine is a chain, or on
  // any internal failure — every one of which falls back to today's column.
  function dagrePositions(nodes, transitions, dir, labelExtent) {
    const D = globalThis.__latticeDagre;
    if (!D || typeof D.Graph !== 'function') return null;
    // The synthetic final node IS handed to dagre. Leaving it out placed it from
    // column geometry — below whichever node had the highest index — while every
    // terminal converged on it through the column router, which sent one of those
    // edges off the canvas entirely on a fan-out. dagre ranks it like any other
    // sink and routes the convergence properly.
    const real = nodes.slice();
    if (real.length < 3) return null;   // nothing to re-rank
    try {
      const g = new D.Graph({ multigraph: true, compound: true });
      // Gaps come from the measured geometry constants, not from dagre's
      // defaults, so a tinted or scaled figure keeps the family's spacing.
      g.setGraph({
        rankdir: dir === 'lr' ? 'LR' : 'TB',
        // Rank separation has to clear an EDGE LABEL, not just the arrowhead:
        // every transition can carry an event name, and dagre is not told about
        // those labels (they are drawn afterwards at the polyline midpoint), so
        // the gap it leaves is the only room they get. At `gap * 3` the labels
        // sat on the boxes below them. The label's own line height is the floor.
        nodesep: G.gap * 2.5,
        // The rank gap must clear an EDGE LABEL, and which dimension that is
        // depends on the flow: a TB label stacks between ranks (its line height),
        // an LR label sits between them (its measured WIDTH). Using the vertical
        // extent for both left `triage` and `deep` touching the boxes either side
        // on a left-to-right machine. dagre is never told about these labels —
        // they are drawn afterwards at the polyline midpoint — so this gap is the
        // only room they get.
        ranksep: Math.max(G.gap * 3, labelExtent + G.arrow + G.gap * 2),
        marginx: 0,
        marginy: 0,
      });
      g.setDefaultEdgeLabel(() => ({}));
      for (const n of real) g.setNode(String(n.index), { width: n.w, height: n.h });
      let e = 0;
      for (const t of transitions) {
        // Self-loops are NOT handed to dagre: it does not route them, and
        // feeding it a self-edge perturbs the ranking for no gain. The existing
        // router draws them, as it does today.
        if (t.isSelf || t.from === t.to) continue;
        if (!g.hasNode(String(t.from)) || !g.hasNode(String(t.to))) continue;
        g.setEdge(String(t.from), String(t.to), { width: 0, height: 0 }, 'e' + (e++));
      }
      D.layout(g);

      // The adoption test: does any rank hold more than one node? Ranks are the
      // cross-axis coordinate — y for TB, x for LR.
      const along = (v) => (dir === 'lr' ? v.x : v.y);
      const ranks = Object.create(null);
      let branching = false;
      for (const n of real) {
        const v = g.node(String(n.index));
        if (!v) return null;
        const key = Math.round(along(v));
        if (ranks[key]) { branching = true; break; }
        ranks[key] = 1;
      }
      if (!branching) return null;   // a column — leave the CSS positions alone

      // dagre reports CENTRES; the rest of this pass works in top-left corners.
      const out = { pos: Object.create(null), pts: Object.create(null), width: 0, height: 0 };
      for (const n of real) {
        const v = g.node(String(n.index));
        out.pos[n.index] = { x: v.x - n.w / 2, y: v.y - n.h / 2 };
        out.width = Math.max(out.width, v.x + n.w / 2);
        out.height = Math.max(out.height, v.y + n.h / 2);
      }
      // The ROUTED polylines, keyed the way the caller can find them again.
      // Taking these is not optional once the nodes move: the column router
      // packs edges into side lanes because it assumes a single stack, and on a
      // 2D layout that sends a one-rank hop on a long detour around the figure.
      for (const e of g.edges()) {
        const rec = g.edge(e);
        if (rec?.points && rec.points.length > 1) {
          out.pts[e.v + '>' + e.w] = rec.points.map((q) => ({ x: q.x, y: q.y }));
        }
        out.width = Math.max(out.width, ...(rec?.points || []).map((q) => q.x));
        out.height = Math.max(out.height, ...(rec?.points || []).map((q) => q.y));
      }
      return out;
    } catch (_e) {
      return null;   // never let a layout failure take the diagram down
    }
  }

  function draw(fig) {
    const raw = fig.getAttribute('data-sc-transitions');
    if (raw == null) return;
    let transitions;
    try { transitions = JSON.parse(raw); } catch (_e) { return; }
    const svg = fig.querySelector('.state-chart-edges');
    const nodeEls = fig.querySelectorAll('.state-node');
    if (!svg || !nodeEls.length) return;

    // A reveal interaction (docs Drawing Board) tilts/scales the FIGURE to lift
    // the active state. While that transform is live, getBoundingClientRect
    // returns the foreshortened/scaled rects, so re-measuring here would route
    // every edge to a wrong point — the garbled overlap. Skip: the edges already
    // drawn (flat) tilt rigidly *with* the figure and stay aligned, and they're
    // still correct once it settles back to none, so no redraw is owed.
    if (typeof getComputedStyle === 'function') {
      let _t;
      try { _t = getComputedStyle(fig).transform; } catch (_e) { _t = 'none'; }
      if (_t && _t !== 'none') return;
    }

    // The `.state-chart-scale` box is the NATURAL-SIZE geometry root — nodes +
    // edge overlay — that draw() measures and routes against. Reset its fit
    // transform to none BEFORE measuring so the boxes read at natural size (the
    // fit is re-applied at the end); measuring through the scale would compound.
    // Fallback to the figure itself keeps a pre-wrapper harness (unit tests) working.
    const geo = fig.querySelector('.state-chart-scale') || fig;
    // The scale box is absolutely centered (translate -50%); reset to just the
    // centering (no scale) BEFORE measuring so the boxes read at natural size.
    if (geo !== fig) geo.style.transform = 'translate(-50%, -50%)';

    const dir = fig.getAttribute('data-sc-dir') === 'lr' ? 'lr' : 'tb';
    const style = fig.getAttribute('data-sc-style') === 'curved' ? 'curved' : 'orthogonal';

    // Resolution scale: 1cqi tracks the section's real px width, so px-per-cqi
    // is 12.8 at HD and ~38.4 at 4K. Rescale every px geometry constant by how
    // big 1cqi is now vs that HD baseline, so the edges/markers/gaps scale with
    // the cqi-sized nodes instead of pinning small. Per figure (sections can
    // differ); sequential draws, so mutating the shared G in place is safe.
    const _sec = typeof fig.closest === 'function' ? fig.closest('section') : null;
    // Read the slide's 1% from the STAMP, not from a rect. `getBoundingClientRect()`
    // returns the VISUAL box, so on any host that scales the slide with a CSS
    // transform — the docs filmstrip scales every section to the preview pane — the
    // section measured 695px instead of 1280 and every px geometry constant here
    // shrank with the pane. The same figure then drew different edge routing in the
    // Playground, in the Studio, and in the export: 31 computed values on the
    // gallery's state-chart pages moved with the host window, the last tier of the
    // ICB leak (engineering/decisions/2026-07-29-section-cq-icb-leak.md).
    //
    // `--_sec-1cqi` is authoritative and unit-safe: the engine emits it from the
    // resolved `@size` geometry (lib/engine/css.js geometryVarsCss) and the runtime
    // re-stamps it inline only where the box genuinely differs (the fluid viewer).
    // offsetWidth is the layout-px fallback for a host that predates the stamp;
    // the rect is gone entirely, since it is the one measure that lies under scale.
    let _sec1cqi = 0;
    if (_sec && typeof getComputedStyle === 'function') {
      _sec1cqi = parseFloat(getComputedStyle(_sec).getPropertyValue('--_sec-1cqi')) || 0;
    }
    if (!(_sec1cqi > 0) && typeof _sec?.offsetWidth === 'number') _sec1cqi = _sec.offsetWidth / 100;
    // …and the visual scale the host applies on top of that layout box, so every
    // rect this pass reads can be normalized back to layout px (see rectL).
    readVis(_sec);
    // Fall back to the HD baseline (S=1, original px constants) when the section
    // can't be measured — no layout yet, or a non-DOM harness (the unit tests).
    const S = _sec1cqi > 0 ? _sec1cqi / 12.8 : 1;
    for (const _k in G_BASE) G[_k] = G_BASE[_k] * S;
    G.S = S;

    const measure = makeLabelW(fig, S);

    // Stretch the node gap so a labeled ADJACENT edge's connector outruns its
    // label (line visible on both sides). TB labels cross the line (constant
    // height), LR labels ride it (measured width). Only labeled adjacent edges
    // drive this, so label-free charts stay compact. Set before measuring.
    const ol = fig.querySelector('.state-nodes');
    if (ol) {
      let need = 0;
      transitions.forEach((t) => {
        if (t.isSelf || t.to !== t.from + 1 || !t.event) return;
        const extent = dir === 'lr' ? measure(t.event) : G.extentTb;
        const g = extent + 2 * G.labelMargin + G.arrow + 2 * G.gap;
        if (g > need) need = g;
      });
      ol.style.gap = Math.max(dir === 'lr' ? G.gapFloorLr : G.gapFloorTb, need).toFixed(1) + 'px';
    }

    const figRect = rectL(geo);
    if (!figRect.width || !figRect.height) return;
    const byIndex = {};
    const nodes = [];
    for (let k = 0; k < nodeEls.length; k++) {
      const el = nodeEls[k];
      const r = rectL(el);
      const n = {
        index: parseInt(el.getAttribute('data-index'), 10),
        x: r.left - figRect.left,
        y: r.top - figRect.top,
        // The MEASURED origin, kept beside the final one. dagre may move the box
        // afterwards, and the badge and label are painted from their OWN measured
        // rects (they have to be — that is where the browser put the real glyphs).
        // The delta between these two is what carries those children along; with
        // no dagre it is 0,0 and every coordinate is unchanged.
        mx: r.left - figRect.left,
        my: r.top - figRect.top,
        w: r.width,
        h: r.height,
        isStart: el.getAttribute('data-kind') === 'start',
        isTerminal: el.getAttribute('data-kind') === 'terminal',
      };
      nodes.push(n);
      byIndex[n.index] = n;
    }

    // Single exit: one final pseudo-state after the last node, with every
    // terminal/sink node converging into it (instead of a ring per sink).
    // A synthetic node + synthetic edges, routed by the normal engine.
    let fnode = null;
    const hasOut = new Set(transitions.map((t) => t.from));
    const terminals = nodes.filter((n) => n.isTerminal || !hasOut.has(n.index));
    if (terminals.length) {
      const last = nodes.reduce((a, b) => (b.index > a.index ? b : a));
      const fi = last.index + 1;
      const fw = 2 * G.termOuter, fh = 2 * G.termOuter;
      fnode = dir === 'lr'
        ? { index: fi, x: last.x + last.w + G.markerGap - G.termOuter, y: last.y + last.h / 2 - fh / 2, w: fw, h: fh, isFinal: true }
        : { index: fi, x: last.x + last.w / 2 - fw / 2, y: last.y + last.h + G.markerGap - G.termOuter, w: fw, h: fh, isFinal: true };
      nodes.push(fnode);
      byIndex[fi] = fnode;
      terminals.forEach((tn) => { transitions.push({ from: tn.index, to: fi, event: '', isSelf: false }); });
    }

    // Re-rank a BRANCHING machine. Applied here — after the boxes are measured,
    // before the synthetic final node is placed — so the final node is derived
    // from the node that is genuinely last on the canvas rather than from a CSS
    // position dagre has just superseded.
    // The widest event label on this machine, measured in the font that will
    // actually render it (makeLabelW reads --font-label from live CSS) — the same
    // coupling the label-box reservation has: dagre trusts the extent it is given.
    let labelExtent = G.extentTb;
    if (dir === 'lr') {
      for (const t of transitions) {
        if (t.event) labelExtent = Math.max(labelExtent, measure(t.event));
      }
    }
    const dagreLayout = dagrePositions(nodes, transitions, dir, labelExtent);
    let canvasW = figRect.width, canvasH = figRect.height;
    if (dagreLayout) {
      // Centre the laid-out graph in the figure box. dagre works from its own
      // origin, and dropping it at 0,0 would pin a branching machine to the
      // top-left of a stage the column used to sit centred in.
      // A symmetric pad, not a centring offset: the box is about to be sized to
      // the drawing, so centring happens by the scale box's own translate. The pad
      // keeps an arrowhead or a label from sitting flush on the viewBox edge.
      const offX = G.gap, offY = G.gap;
      for (const n of nodes) {
        const p = dagreLayout.pos[n.index];
        if (p) { n.x = p.x + offX; n.y = p.y + offY; }
      }
      // Ride the routed polyline on the transition, in the same figure-space
      // coordinates the nodes now use. A self-loop has no dagre route and keeps
      // `_pts` undefined, so it falls through to the existing router.
      for (const t of transitions) {
        const pts = dagreLayout.pts[t.from + '>' + t.to];
        if (pts) t._pts = pts.map((q) => ({ x: q.x + offX, y: q.y + offY }));
      }
      // TIGHT content bounds, deliberately NOT max()'d with the measured column.
      // `.state-chart-scale` is `width: fit-content` sized by the hidden column,
      // and `.state-chart-edges` fills it at the SVG default `xMidYMid meet` — so
      // a wide canvas declared inside a narrow tall element box gets letterboxed
      // down to a quarter of the stage, which is exactly what a max() left. Giving
      // the box the drawing's own dimensions makes `meet` a no-op and hands the
      // scaling to applyFit, where it belongs.
      canvasW = dagreLayout.width + offX * 2;
      canvasH = dagreLayout.height + offY * 2;
    }

    // The scale box normally takes its size from the hidden column. A re-ranked
    // machine is a different shape, so the box is pinned to the drawing and the
    // pin is REMOVED again when dagre is not in play — draw() re-runs on resize
    // and font load, and a stale inline size would outlive the layout it was for.
    if (geo?.style) {
      if (dagreLayout) {
        geo.style.width = canvasW.toFixed(1) + 'px';
        geo.style.height = canvasH.toFixed(1) + 'px';
      } else {
        geo.style.removeProperty('width');
        geo.style.removeProperty('height');
      }
    }

    svg.setAttribute('viewBox', '0 0 ' + canvasW.toFixed(1) + ' ' + canvasH.toFixed(1));
    svg.setAttribute('width', canvasW.toFixed(1));
    svg.setAttribute('height', canvasH.toFixed(1));

    assignGutters(transitions, dir);
    assignPorts(transitions, byIndex, dir);
    // Clearance: a non-adjacent edge must clear the DEEPEST node in its span.
    // Orthogonal runs straight at peak so the extreme node extents suffice;
    // the curved variant also records _peakCurved — the peak a single cubic
    // needs so its (reduced) reach still clears each intermediate node at the
    // node's row (reach = 3·t·(1−t), clamped; capped against ballooning).
    transitions.forEach((t) => {
      if (t.isSelf || t.to === t.from + 1) return;
      const lo = Math.min(t.from, t.to), hi = Math.max(t.from, t.to);
      let maxR = -Infinity, minL = Infinity, maxB = -Infinity, minT = Infinity;
      for (let idx = lo; idx <= hi; idx++) {
        const n = byIndex[idx];
        if (!n) continue;
        if (n.x + n.w > maxR) maxR = n.x + n.w;
        if (n.x < minL) minL = n.x;
        if (n.y + n.h > maxB) maxB = n.y + n.h;
        if (n.y < minT) minT = n.y;
      }
      t._maxR = maxR; t._minL = minL; t._maxB = maxB; t._minT = minT;
      if (style === 'curved') {
        const from = byIndex[t.from], to = byIndex[t.to];
        const max = gutterMax(t, dir);
        const ext = (n) => (dir === 'lr' ? (max ? n.y + n.h : n.y) : (max ? n.x + n.w : n.x));
        const xs = ext(from), xe = ext(to);
        let req = max ? -Infinity : Infinity;
        for (let idx = lo + 1; idx < hi; idx++) {
          const n = byIndex[idx];
          if (!n) continue;
          const p = (idx - lo) / (hi - lo);
          const reach = Math.max(0.18, 3 * p * (1 - p));
          const blend = (1 - p) ** 3 * xs + p ** 3 * xe;
          const target = ext(n) + (max ? 12 : -12);
          const r = blend + (target - blend) / reach;
          req = max ? Math.max(req, r) : Math.min(req, r);
        }
        if (Number.isFinite(req)) t._peakCurved = req;
      }
    });
    assignBows(transitions, dir, measure);
    // Distinct state tints, in first-appearance order, so the defs block is
    // deterministic (a Set's insertion order) rather than dependent on hash order.
    const nodeTints = [];
    for (let i = 0; i < nodeEls.length; i++) {
      const tv = typeof nodeEls[i].getAttribute === 'function' ? nodeEls[i].getAttribute('data-tint') : null;
      if (tv && nodeTints.indexOf(tv) < 0) nodeTints.push(tv);
    }
    const parts = [nodeFillDefs(nodeTints)];
    // Nodes first, then connectors: document order is the motion build order, so
    // a state machine assembles its states and then draws the arrows between
    // them — which is how a reader follows it.
    for (let k = 0; k < nodeEls.length; k++) {
      const n = byIndex[parseInt(nodeEls[k].getAttribute('data-index'), 10)];
      if (n) parts.push(nodeShape(n, nodeEls[k], figRect));
    }
    nodes.forEach((n) => { if (n.isStart) parts.push(startMarker(n, dir)); });
    transitions.forEach((t) => { parts.push(edge(t, byIndex, dir, style)); });
    if (fnode) parts.push(finalRing(fnode));
    // KEEP the accessible name and description. They are emitted at build time
    // as the FIRST children of this <svg>, and `parts` contains only geometry —
    // so a bare `innerHTML =` destroys them. That is not a cosmetic loss: this
    // pass also hides the <ol> the states used to be readable from
    // (`[data-sc-svg="1"] .state-nodes { visibility: hidden }`), so wiping the
    // <desc> leaves `<svg role="img">` with no accessible name and the state
    // names nowhere in the tree — strictly worse than before the SVG-ification,
    // and exactly the mitigation the decision note claims. Re-prepending is
    // idempotent: on the next draw() they are found again and kept again.
    const keep = (String(svg.innerHTML || '')
      .match(/^\s*(?:<(?:title|desc)\b[\s\S]*?<\/(?:title|desc)>\s*)+/) || [''])[0];
    svg.innerHTML = keep + parts.join('');
    // The HTML column has done its job (it measured, and the gap math reads it),
    // so hand the painting over to the SVG. `visibility:hidden` — NOT display:none
    // — because the boxes must keep occupying layout for the next re-measure.
    if (typeof fig.setAttribute === 'function') fig.setAttribute('data-sc-svg', '1');

    // ── Letterbox self-scale — a self-scaling chart, exactly like the pie ─────
    // The nodes are cqi-sized HTML at fixed dimensions, so a state machine can't
    // letterbox itself the way an <svg> viewBox does. The figure is a flex viewport
    // that fills the stage (the caption keeps its space); here we scale the
    // natural-size `.state-chart-scale` box — nodes + edges together, so they stay
    // aligned — to fit that viewport. ALWAYS fits: it squeezes DOWN when the machine
    // is tall and fills UP when there's room, sized purely by the container (crisp
    // 400px → 8K, since the node sizing is cqi and the edge factor S tracks the
    // section width). No floor, no overflow: an OVERSTUFFED machine just gets
    // cramped — that is the author's stress test, and the house rule is a simple
    // boardroom chart, not an architect's diagram. So state-chart is a self-scaling
    // chart in the pie/SVG class, NOT a pinned list chart
    // (2026-07-16-state-chart-self-scale.md). No-op for the geo===fig harness.
    // BOTH sides of this ratio must be in the SAME space. `figRect` is layout px
    // (rectL divides out the host's transform scale), so `view` must be too —
    // a raw getBoundingClientRect() here makes k collapse to VIS itself, which
    // renders the whole diagram at the preview pane's scale ON TOP of the pane's
    // own scale (measured: k=0.2084 where it should be 1.0246, on a pane at
    // VIS=0.2034 — an illegible smear that trips the engine's own legibility badge).
    // Fit against the DAGRE canvas when there is one. `figRect` is the measured
    // HTML column, and on a re-ranked machine the drawing is wider and shorter
    // than that column — fitting to the column scales a fan-out as though it
    // were still a narrow stack, which is what left it stranded at a quarter of
    // the stage.
    applyFit(fig, geo, (canvasW !== figRect.width || canvasH !== figRect.height)
      ? { width: canvasW, height: canvasH }
      : figRect);
  }

  // draw() forces synchronous layout per word per node (labelLines probes each
  // word's rendered top edge), so a raw ResizeObserver callback would run that
  // on every resize tick. Coalesce to one redraw per frame.
  let rafPending = 0;
  function scheduleDrawAll() {
    const w = (doc.defaultView || (typeof window !== 'undefined' ? window : null));
    if (!w || typeof w.requestAnimationFrame !== 'function') { drawAll(); return; }
    if (rafPending) w.cancelAnimationFrame(rafPending);
    rafPending = w.requestAnimationFrame(() => { rafPending = 0; drawAll(); });
  }

  function drawAll() {
    const figs = doc.querySelectorAll('.state-chart-figure[data-sc-transitions]');
    for (let i = 0; i < figs.length; i++) draw(figs[i]);
    // Every OTHER state-chart figure — today only the inline variant — still owns a
    // scale box that wants letterboxing. Selected by the absence of the edge payload
    // rather than by variant name, so a future presentation that draws no SVG is fit
    // by construction instead of being silently left out the way inline was (#1360).
    const plain = doc.querySelectorAll('.state-chart-figure:not([data-sc-transitions])');
    for (let i = 0; i < plain.length; i++) fitOnly(plain[i]);
  }

  // Always redraw on call (content may have changed). Attach the one-shot
  // listeners and observers only once per document — the runtime invokes
  // this on every transform pass, so re-attaching would leak observers.
  drawAll();
  if (doc.__scLayoutInstalled) return;
  doc.__scLayoutInstalled = true;

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', drawAll);
  }
  // Re-measure once webfonts settle (label widths shift when Outfit loads).
  if (doc.fonts?.ready && typeof doc.fonts.ready.then === 'function') {
    doc.fonts.ready.then(drawAll);
  }
  // Live preview: re-draw on resize.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { scheduleDrawAll(); });
    const figs2 = doc.querySelectorAll('.state-chart-figure');
    for (let j = 0; j < figs2.length; j++) ro.observe(figs2[j]);
  }
}

// Serialised form for the emulator's bootstrap <script>. Self-invoking.
//
// This is the PASS ONLY. The dagre IIFE it needs is prepended by the emulator
// (lattice-emulator.js), deliberately not here: the runtime bundle also imports
// this module, and a top-level require of the generated 62KB bundle would ship
// that string to every reader of every deck — measured at +51KB gzipped on
// lattice-runtime.min.js, against +22KB for the live library alone, because the
// bundle then carried dagre twice (inlined AND as this string). The emulator is
// the only consumer, so the concatenation belongs at that call site.
//
// The pass reaches dagre through `globalThis.__latticeDagre` either way — see
// tools/build-dagre-bundle.js for both halves of the delivery.
const STATE_CHART_BROWSER_JS = '(' + installStateChartLayout.toString() + ')(document);';


/**
 * The chart-family entrypoint (see the `kernel` block in
 * state-chart.manifest.json).
 *
 * Unlike the other charts, state-chart does NOT use spliceFirstList: a numbered
 * machine of >9 states is split by markdown-it into a first <ol> plus a run of
 * leaked <ol start>/orphan <ul> siblings (the two-digit-marker indent trap).
 * extractStateList reassembles that run into one logical list so no state is
 * lost to indentation. See §extractStateList above.
 */
function transformSection(html, ctx) {
  const ext = extractStateList(html);
  if (!ext) return html;
  const model = parseStateChart(ext.inner);
  if (!model) return html;
  // Pass the full class-token list: state-chart reads two orthogonal axes —
  // presentation (inline) and direction (lr / tb). `orientation` lets a portrait
  // deck force the vertical default over an `lr` machine that can't fit a tall
  // box (§buildStateChart).
  const figure = buildStateChart(model, ctx.classTokens, ctx.orientation);
  return html.slice(0, ext.start) + figure + html.slice(ext.end);
}

module.exports = {
  transformSection,
  STATE_CHART_VARIANTS,
  STATUS_KEYWORDS,
  STATE_ATTR_KEYWORDS,
  TRANSITION_RE,
  parseTransitionToken,
  parseStateLi,
  parseStateChart,
  extractStateList,
  buildStateChart,
  matchEyebrowText,
  installStateChartLayout,
  STATE_CHART_BROWSER_JS,
  // Exposed for unit tests:
  stripTrailingPills,
  splitTopLevelLis,
  findOuterList,
};
