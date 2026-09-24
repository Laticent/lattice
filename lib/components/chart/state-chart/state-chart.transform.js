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
// Start/terminal inference, shared with the caption voice — see the call site below.
const { inferRoles } = require('../../../core/state-graph-facts');

// Two orthogonal axes expressed as modifier classes:
//   direction:    lr (left-to-right) or tb (top-to-bottom) PINS it; with
//                 neither, the browser pass picks whichever direction — and
//                 however many lines — sets the type largest (`data-sc-fit`)
//   presentation: inline (HTML chips, no SVG) — default is the SVG canvas
// `horizontal` is a backwards-compatible alias for `lr inline`.
const STATE_CHART_VARIANTS = ['lr', 'tb', 'inline', 'curved'];

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
// not exist resolves to its FALLBACK and the element keeps the untinted default —
// the deck degrades, it does not break. That is now true because each inline
// value carries `var(--token, var(--default))`; without the fallback an unknown
// token made the property invalid and the mark was erased rather than untinted.
//
// NOTHING NAMES THE TYPO TODAY. An earlier version of this comment, and the same
// sentence in the docs and the manifest, said "naming the typo is `lint:deck`'s
// job, which is the coaching posture HARD RULE #29 settled: we warn, we coach."
// `lib/authoring/lint-core.js` has no `:::` handling of any kind — `grep ':::'`
// returns nothing — so #29 was cited to justify an omission and then neither half
// happened. A typo is silent. Saying so plainly is the honest state; the coaching
// warning is worth building, and it needs a decision this file cannot make on its
// own: which token list is authoritative for a rule that must stay fs-free.
const TINT_TOKEN_RE = /^[a-z][a-z0-9-]*$/;

// Splits a trailing `:::a` or `:::a/b` off a chunk of authored text.
// Two slots, because the ask is two channels: the MARK's color and, for a
// transition, its edge-label background. `:::pass/surface-raised` reads left to
// right as "paint the edge with pass, sit its label on surface-raised".
// A malformed or over-long spec is dropped whole rather than half-applied — a
// half-read tint is harder to debug than none.
function stripTint(text) {
  // Scanned, not matched. The regex this replaced —
  // `/^([\s\S]*?)\s*:::([^\s:]+)\s*$/` — pairs a lazy `[\s\S]*?` with a
  // following `\s*`, and the two can divide a run of whitespace between them in
  // quadratically many ways. On author text that is a polynomial ReDoS, and it
  // is reachable: an event label is whatever the deck says. Measured on a label
  // of 32k spaces: 851ms, growing ~16x for each 4x of input. CodeQL flagged it
  // high on #2084. `lastIndexOf` is linear and says the same thing — the old
  // pattern also effectively bound the LAST `:::`, since `[^\s:]+` cannot cross
  // a colon.
  const str = String(text);
  const at = str.lastIndexOf(':::');
  if (at < 0) return { rest: str, tint: null, labelBg: null };
  const spec = str.slice(at + 3).trim();
  // The old `[^\s:]+ $` admitted exactly one colon-free, space-free token.
  if (!spec || /[\s:]/.test(spec)) return { rest: str, tint: null, labelBg: null };
  const m = [null, str.slice(0, at).trimEnd(), spec];
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

// Peels trailing `<code>…</code>` pills off the end of a state's lead text.
//
// SCANNED, NOT MATCHED, and the reason is the same one that got the two `:::`
// regexes rewritten: `/^([\s\S]*?)\s*<code>…/` pairs a lazy head with a
// following `\s*`, and with no match to anchor them the two divide a run of
// whitespace quadratically. Measured in isolation on 32k spaces: 847ms. This
// predates the tint work, but `parseStateLi` now calls `stripTint` immediately
// above it on the same author text, so it sits squarely on the path this change
// added — on-path under HARD RULE #18, not a found-and-logged bystander.
//
// `trimEnd()`, never `/\s+$/`. That anchored form is quadratic for the same
// reason the patterns above were — `\s+` retries from every position in a
// trailing whitespace run, each attempt failing at `$`. Measured at 732ms on 32k
// spaces, which is WORSE than the regex it was introduced to replace: the first
// cut of this fix swapped one polynomial ReDoS for another, and only re-measuring
// caught it. `trimEnd` is native and linear.
//
// The scan reproduces the old pattern exactly: a pill is the LAST thing in the
// string (bar trailing whitespace), its body is non-empty and carries no `<`.
function stripTrailingPills(lead) {
  const pills = [];
  let s = lead;
  for (;;) {
    const t = s.trimEnd();
    if (!t.endsWith('</code>')) { s = t; break; }
    const open = t.lastIndexOf('<code>');
    if (open < 0) { s = t; break; }
    const inner = t.slice(open + '<code>'.length, t.length - '</code>'.length);
    // `([^<]+)` — at least one character, none of them `<`.
    if (!inner || inner.includes('<')) { s = t; break; }
    pills.unshift(inner.trim());
    s = t.slice(0, open);
  }
  return { leadStripped: s.trim(), pills };
}

// ── Transition token parsing ─────────────────────────────────────────────
// Event label is any run of characters up to the `=>` arrow (CJK, accents,
// punctuation — not just ASCII); `[^=]` stops before the arrow's first `=`.
//
// NO `\s*` AROUND THE LAZY GROUP. The previous form was
// `/^\s*([^=]*?)\s*=>\s*(\d+|self)\s*$/`, where `^\s*`, `[^=]*?` and `\s*` all
// compete for the same whitespace run — three quantifiers over one input, which
// is CUBIC on a NON-matching string. Measured on this machine, one nested bullet
// whose inline code is nothing but spaces:
//
//     spaces   matching   non-matching
//        500     0.21ms        19.93ms
//      1 000     0.08ms       135.69ms
//      2 000     0.04ms     1 030.44ms
//      4 000     0.06ms     8 272.39ms      (~8x per doubling)
//
// That is ordinary authoring, not crafted markup, and it blocks whatever thread
// is parsing — the Studio's render, the Playground's keystroke path, the CLI
// export. It is also the shape the sibling linearity fix in this branch missed:
// its test feeds a MATCHING input, and a matching input never backtracks.
//
// The leading and trailing runs are simply dropped — `m[1].trim()` below already
// removes them, so the parse is unchanged and the ambiguity is gone.
const TRANSITION_RE = /^([^=]*?)=>\s*(\d+|self)\s*$/;

function decodeEntities(s) {
  return String(s)
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// Explicit line breaks in an event label. Two spellings, because authors reach
// for different ones: a literal `\n` typed inside the inline code, and an HTML
// `<br>` / `<br/>`. The `<br>` arrives here already entity-escaped by markdown-it
// and is restored by decodeEntities before this runs, so both forms are plain
// text by the time they are split.
//
// Kept as a `\n`-joined STRING rather than an array: the event rides through
// `data-sc-transitions` as JSON and is read back by the browser pass, and a
// string keeps that payload the same shape it has always been.
// SPLIT ON the break token rather than replacing it together with the whitespace
// around it. The previous form, `/\s*(?:\\n|<br\s*\/?>)\s*/gi`, wrapped an
// alternation in `\s*` on both sides; with no match to anchor them the two runs
// divide the same whitespace quadratically. Measured on 32k spaces: 1,098ms.
// Splitting and trimming each piece is linear and produces the identical string,
// empty segments included — `a <br> <br> b` still yields `a\n\nb`, which is why
// the pieces are NOT filtered.
const LABEL_BREAK_RE = /\\n|<br\s*\/?>/gi;
function normalizeEventBreaks(event) {
  return String(event).split(LABEL_BREAK_RE).map((part) => part.trim()).join('\n').trim();
}

function parseTransitionToken(text) {
  const decoded = decodeEntities(text);
  const m = decoded.match(TRANSITION_RE);
  if (!m) return null;
  const event = normalizeEventBreaks(m[1].trim());
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
    // Case folds, and the folded word is what stamps (`AT-RISK` → `at-risk`).
    else if (STATUS_KEYWORDS.has(p.toLowerCase())) status = p.toLowerCase();
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

  // START AND TERMINAL ROLES come from `lib/core/state-graph-facts.js`, shared with
  // the narration that describes this same machine to a listener. The rule used to
  // live here alone, so the voice re-read it from the Markdown and the two were
  // free to drift on exactly the slides where it matters — a machine whose author
  // tagged neither role (HARD RULE #1).
  const roles = inferRoles(states, transitions);
  for (const s of states) {
    if (s.index === roles.startIndex) s.isStart = true;
    if (roles.terminalIndices.has(s.index)) s.isTerminal = true;
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
 * The top-right ordinal: a numeral that IS the state's identifier (edges route by
 * it, `byFrom.get(s.index)`). It carries the status for ASSISTIVE TECHNOLOGY only —
 * since 2026-09-24 the status is painted on the node's tile, not on this numeral —
 * so the label names both, and the visible numeral stays a quiet ref.
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
  // The status PAINTS THE NODE (the `data-s` above drives the tile through the
  // stylesheet's status table); the top-right numeral is the state's ref only,
  // and names the status to assistive technology. No pill, no inline dot.
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

function buildDefault(model, dir, style, fit) {
  const nodes = model.states.map(renderHtmlNode).join('');
  // Serialise the transition list for the browser pass.
  const data = escAttr(JSON.stringify(model.transitions));
  const d = dir === 'lr' ? 'lr' : 'tb';
  const styleAttr = (style === 'curved' ? ' data-sc-style="curved"' : '') +
    (fit === 'auto' ? ' data-sc-fit="auto"' : '');
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
    // Same fallback as the SVG paint path: an unknown token must degrade to the
    // untinted default, not invalidate the property and drop the node's border.
    const tintAttr = s.tint ? ` style="--fill-hue:var(--${s.tint},var(--muted-mark))"` : '';
    // The status paints the row (the status table), as it paints an SVG node.
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
// deck an `lr` pin is forced back to `tb`. The flip happens HERE, not in CSS,
// because the measuring column keys off `data-sc-dir`. With no pin, a tall box
// needs no flip: the fit picks a column there on its own.
//
// NO DIRECTION TOKEN MEANS "FIT" (2026-09-24). The default used to be `tb`, and a
// vertical column is the worst shape for a 16:9 stage: measured, a 10-state chain
// set its state names at 4.6px. Now the measuring column starts as `tb` and the
// browser pass is told it may choose (`data-sc-fit="auto"`), scoring both
// directions at every line count against the real viewport. `tb` is a new token
// that pins the old default for an author who wants the column regardless.
function buildStateChart(model, opts, orientation) {
  const tokens = Array.isArray(opts) ? opts : (typeof opts === 'string' ? [opts] : []);
  const portrait = orientation === 'portrait';
  const inline = tokens.includes('inline') || tokens.includes('horizontal');
  const wantsLr = tokens.includes('lr') || tokens.includes('horizontal');
  const dir = (!portrait && wantsLr) ? 'lr' : 'tb';
  const style = tokens.includes('curved') ? 'curved' : 'orthogonal';
  // `curved` is a STROKE style, not a direction — both line routers and the
  // grid's routes draw it — so it pins nothing.
  const pinned = wantsLr || tokens.includes('tb');
  return inline ? renderInline(model, dir) : buildDefault(model, dir, style, pinned ? 'pinned' : 'auto');
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

function installStateChartLayout(rootDoc, opts) {
  const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  // `onlyFresh`: draw only the figures that have never painted. The runtime's
  // mutation microtask asks for this — it runs synchronously before the frame
  // an edit produces, and redrawing every chart in a 14-chart deck there cost
  // 100–175ms per keystroke burst. The debounced pass still redraws them all.
  const onlyFresh = Boolean(opts?.onlyFresh);

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
    labelLine: 13,   // line box of one edge-label line (11px type + leading)
    labelOff: 7,     // label's perpendicular offset OFF the edge line
    // How far the PAINTED label exceeds its line box, per side. Two measured
    // parts, both invisible to `getBBox`: the glyph box is 14px against the 13px
    // line box and sits 1.48px high of it (`dominant-baseline: middle` does not
    // center), and `.state-edge-label` paints a `paint-order: stroke` halo whose
    // measured `strokeWidth` is 5.4px — 2.7px of ink each side. 3.5 covers both
    // with a little air. It is in G_BASE, not a bare const, because it is scaled
    // by `S` with every other length here: the halo scales with the type (2.7px
    // at 16:9, 8.1px at 4K), so an unscaled pad under-reserves exactly where the
    // figure is largest.
    labelPad: 3.5,
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

    // ── THE TYPE FLOOR, COUNTER-SCALED (#1213) ──────────────────────────────
    // A CSS `max(var(--chart-text-min), …)` cannot pin an EFFECTIVE size here,
    // and the stylesheet says so where it declares one: this box is letterbox-
    // scaled by `k`, and that transform multiplies the floor along with
    // everything else. Measured before this, with the floor declared at 11px:
    // landscape k=0.593 -> 6.52px effective, square k=0.771 -> 8.48px. The floor
    // helped and did not hold.
    //
    // `k` is known exactly here and nowhere else, so the compensation belongs
    // here: raise the DECLARED floor by 1/k, and the transform brings it back
    // down to the floor the token actually asks for.
    //
    // ONLY UPWARDS, and that asymmetry is the point. At k > 1 the machine is
    // being grown to fill the stage, and dividing by k would LOWER the declared
    // floor — text that reads at 16.5px today would come back at 11px. The
    // compensation exists to stop the floor being eaten, never to cap type that
    // is already comfortable.
    //
    // WHAT IT COSTS, stated because it is a real trade: on a machine crowded
    // enough to need it, the labels come back bigger with nowhere new to go, so
    // they sit closer to their edges. That is the deliberate call — an
    // unreadable label is worse than a tight one — and it is the one thing the
    // self-scale note (2026-07-16) left open rather than settled.
    if (k < 1 && geo.style && typeof geo.style.setProperty === 'function') {
      let base = 11;
      if (typeof getComputedStyle === 'function') {
        // Read from the FIGURE, never from `geo`: the override below lands on
        // `geo`, so reading there would compound 1/k on every redraw.
        try {
          const declared = parseFloat(getComputedStyle(fig).getPropertyValue('--chart-text-min'));
          if (Number.isFinite(declared) && declared > 0) base = declared;
        } catch (_e) { /* synthetic DOM — the 11px default stands */ }
      }
      geo.style.setProperty('--chart-text-min', `${(base / k).toFixed(3)}px`);
    } else if (geo.style && typeof geo.style.removeProperty === 'function') {
      // Removed rather than reset, so the token falls back to the stylesheet's
      // own value and a stale compensation cannot outlive the layout it was for.
      geo.style.removeProperty('--chart-text-min');
    }
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
    // CACHED BY TEXT AND WIDTH, because the probe below is a DOM WRITE. The runtime
    // re-runs its content pass on any childList mutation under <body>, and that pass
    // calls draw() — so a probe on every draw fed the observer that scheduled the next
    // draw, and a state-chart slide redrew every ~160ms for as long as it was open
    // (measured in the Playground: 60 redraws in 10s on an idle slide).
    //
    // THE FONT IS PART OF THE KEY. A wrapping label is clamped by the node's
    // `max-width`, so its box keeps the same width whatever the font — while its
    // line breaks do not. Keyed on text + width alone, a webfont landing after the
    // first draw (the `fonts.ready` redraw) or a theme swap kept the fallback
    // font's breaks: three HARD RULE #25 lenses reproduced the SVG painting two
    // lines where the browser now made three. `font` is the resolved shorthand
    // (family, size, weight, style); letter-spacing is not in it.
    let fontKey = '';
    try {
      const cs = getComputedStyle(labelEl);
      fontKey = cs.font + '|' + cs.letterSpacing + '|' + cs.wordSpacing;
    } catch (_e) { /* synthetic DOM — the text and width still key it */ }
    const key = text + '\u0000' + rectL(labelEl).width.toFixed(2) + '\u0000' + fontKey;
    if (labelEl.__scLines && labelEl.__scLines.key === key) return labelEl.__scLines.lines;
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
    const out = lines.length ? lines.map((a) => a.join(' ')) : [text];
    labelEl.__scLines = { key, lines: out };
    return out;
  }

  // Unique per figure — two state-charts in one document must not share a def id
  // (the first would win for both, the SVG duplicate-id trap the pie/radar defs
  // also guard against).
  //
  // THE ID IS DERIVED FROM THE FIGURE, not from a counter — and it cannot come
  // from lib/core/render-ids.js the way pie, quadrant, radar and gantt get it,
  // because THIS function is serialised with .toString() into the emulator's
  // bootstrap (see the header). A serialised function carries its own body and
  // nothing it closed over, so a module import is `undefined` in the browser,
  // nodeFillDefs throws, and every state-chart renders EMPTY. Measured: 0 of 5
  // figures baked in the --player export.
  //
  // A counter was the original answer and it was not deterministic. drawAll()
  // runs on install, on DOMContentLoaded, when webfonts settle, and on resize —
  // so a per-call counter advanced a VARIABLE number of times before capture and
  // two identical renders disagreed (`sc-node-fill-5` on one run, `-4` on the
  // next). render() has to be a pure function of its input.
  //
  // The figure's own INDEX is both: stable across every redraw pass, and unique
  // per figure, which is all the uniqueness is for (the SVG duplicate-id trap —
  // a second `#sc-node-fill-1` in one document makes every reference resolve to
  // the first).
  let gradId = '';
  let tintGradIds = Object.create(null);
  // A gradient PER DISTINCT TINT, not one gradient reading a custom property.
  // That shape is forced: an SVG gradient stop resolves `var()` against the
  // <linearGradient> element's own computed style, NOT against the rect that
  // references it — so `--fill-hue` set on the node cannot reach these stops.
  // The set is bounded by the machine's distinct `:::` tints (typically 0-3),
  // and an untinted figure emits exactly the one gradient it always did, with
  // the same id, so its markup is unchanged.
  // STATUS PAINTS THE NODE, the way it paints a gantt bar. The ten status words
  // share five ramps, and the table is the pill vocabulary's (chart-family.css
  // `.chart-status`), so a state, its legend chip and a pill on the next slide
  // agree. Held here rather than imported for the reason `gradId` gives below:
  // this function is serialized and carries nothing it closes over.
  const STATUS_TONE = {
    'on-track': 'pass', done: 'pass', live: 'pass',
    'at-risk': 'warn', warn: 'warn',
    blocked: 'fail', fail: 'fail',
    pilot: 'info', decision: 'info',
    deferred: 'mute',
  };
  const toneOf = (st) => (typeof st === 'string' && Object.hasOwn(STATUS_TONE, st) ? STATUS_TONE[st] : null);
  let toneGradIds = Object.create(null);
  // The letterbox factor the current figure's chosen layout is expected to get,
  // and the screen size the ordinal must not drop below (the engine's floor is 1%
  // of a 720px slide; 7.5 gives it a little air). Set per figure in draw().
  let paintK = 1;
  const LEGIBLE_PX = 7.5;
  function nodeFillDefs(tints, figIndex, tones) {
    gradId = 'sc-node-fill-' + figIndex;
    // `var(hue, var(--muted-mark))`, not a bare `var(hue)`: a `:::token` naming a
    // token that does not exist made the whole `stop-color` declaration invalid,
    // and the stop fell to its initial — so a single dropped letter painted the
    // state SOLID BLACK. Measured. The same fallback is on `--fill-hue` and on
    // `--edge-tint`; between them they are what makes the promise every doc
    // surface repeats ("the deck degrades, it does not break") actually true.
    const stop = (hue, pos, l, d) =>
      '<stop offset="' + pos + '" style="stop-color:light-dark(' +
        'color-mix(in oklab, var(' + hue + ', var(--muted-mark)) var(' + l + '), var(--bg)),' +
        'color-mix(in oklab, var(' + hue + ', var(--muted-mark)) var(' + d + '), black))"/>';
    const ramp = (id, hue) =>
      '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        stop(hue, '0%', '--chart-fill-top-l', '--chart-fill-top-d') +
        stop(hue, '100%', '--chart-fill-bottom-l', '--chart-fill-bottom-d') +
      '</linearGradient>';
    tintGradIds = Object.create(null);
    toneGradIds = Object.create(null);
    let out = ramp(gradId, '--muted-mark');
    // One ramp per tone PRESENT, in first-appearance order, so a machine with no
    // status emits exactly the defs it always did.
    // A STATUS tile takes the pill's stops (18/30 light, 42/54 dark), not the
    // family bar ramp: a state carries text, and the bar ramp under its name was
    // sub-AA on forty dark theme pairs. The same four literals are the CSS
    // `--state-tile-*` values on a `[data-s]` node, so the HTML fallback and this
    // paint agree. `mute` (deferred) keeps the neutral ramp and is drawn hollow.
    const lit = (hue, pos, l, d) =>
      '<stop offset="' + pos + '" style="stop-color:light-dark(' +
        'color-mix(in oklab, var(' + hue + ') ' + l + '%, var(--bg)),' +
        'color-mix(in oklab, var(' + hue + ') ' + d + '%, black))"/>';
    for (const tone of (tones || [])) {
      const id = gradId + '-s-' + tone;
      toneGradIds[tone] = id;
      out += tone === 'mute'
        ? ramp(id, '--muted-mark')
        : '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
          lit('--state-' + tone + '-hue', '0%', 18, 42) +
          lit('--state-' + tone + '-hue', '100%', 30, 54) +
          '</linearGradient>';
    }
    let i = 0;
    for (const t of (tints || [])) {
      const id = gradId + '-t' + (++i);
      tintGradIds[t] = id;
      out += ramp(id, '--' + escText(t));
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
    const tint = tintToken(typeof el.getAttribute === 'function' ? el.getAttribute('data-tint') : null);
    // The status word is read back out of the DOM, so it is admitted only if it is
    // one of the table's keys — the same refuse-don't-escape rule `tintToken` applies.
    const rawSt = typeof el.getAttribute === 'function' ? el.getAttribute('data-s') : null;
    const tone = toneOf(rawSt);
    const st = tone ? rawSt : null;
    // An explicit `:::token` outranks the status for the FILL: the author named a
    // paint. The edge and accent still take the status ink (the stylesheet's
    // status table), so a tinted state with a status keeps its status cue.
    const useGrad = (tint && tintGradIds[tint]) || (tone && toneGradIds[tone]) || gradId;
    let out = '<rect class="state-node-shape" data-index="' + n.index + '"' +
      (mark != null ? ' data-mark="' + escText(mark) + '"' : '') +
      (kind ? ' data-kind="' + escText(kind) + '"' : '') +
      (st ? ' data-s="' + st + '"' : '') +
      // Fallback for the same reason `--edge-tint` carries one: an inline
      // declaration beats the stylesheet, so a token that does not exist made
      // `--fill-hue` invalid rather than falling back to the `--muted-mark`
      // default, and the node's border went to `stroke: none`.
      (tint ? ' style="--fill-hue:var(--' + escText(tint) + ',var(--muted-mark))"' : '') +
      ' data-anima-role="region"' +
      ' x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) +
      '" width="' + n.w.toFixed(1) + '" height="' + n.h.toFixed(1) +
      '" rx="' + rx.toFixed(1) + '" fill="url(#' + useGrad + ')"/>';
    // The leading accent edge, ONLY ON A NODE WITH A STATUS — gantt's rule and
    // gantt's reason (gantt.styles.css, `.gantt-bar-accent:not([data-s])`). The
    // accent's one job is to reinforce the mark's hue at its leading edge, so on
    // a node carrying no status it drew a plain slate stripe that said nothing:
    // the "plain spectrum" down the left of every state that made this chart
    // read as a different family from gantt, kanban and progress. A status-less
    // node is now a quiet tile, and the start node is told apart by its heavier
    // edge and the `●` marker, not by a stripe.
    //
    // Clipped to the node's own corner radius, so the stripe follows the rounded
    // tile rather than squaring off its corner.
    if (st) out += accentPath(n, rx, Math.min(3 * G.S, n.w / 4), st);
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

    // The ordinal is a quiet numeral on every node. It used to become a colored
    // disc overhanging the corner when the state had a status, which put the
    // status on a sticker instead of on the mark; the node's own fill carries
    // it now, so the numeral goes back to being only the ref transitions cite.
    // SIZED AND PLACED FROM THE TILE, not from the 9px HTML slot. The letterbox
    // scales the whole drawing by k, so a numeral sized for the slot painted at
    // 5.8px on a wrapped machine — under the legibility floor. Raised to the floor
    // at the chosen layout's k (`paintK`), it outgrew the slot and, at a very low
    // k, the tile (the red team measured 30 of 30 numerals outside their tiles at
    // k = 0.32). So: at least the floor, at most a third of the tile's height,
    // anchored to the tile's own top-right corner. Where the two bounds cross the
    // chart is past its budget anyway, and the tile wins.
    if (idxEl) {
      const natural = readFontPx(idxEl);
      const floorPx = LEGIBLE_PX / Math.max(paintK, 0.05);
      const fs = Math.min(Math.max(natural, floorPx), n.h * 0.34);
      const inset = Math.max(3 * G.S, rx * 0.4);
      const x = n.x + n.w - inset;
      const y = n.y + Math.max(2 * G.S, rx * 0.25) + fs / 2;
      out += '<text class="state-index-t"' + (st && tone !== 'mute' ? ' data-s="' + st + '"' : '') +
        ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" text-anchor="end" dominant-baseline="central" font-size="' +
        fs.toFixed(1) + '">' + escText(idxEl.textContent) + '</text>';
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
      // `dominant-baseline` is repeated on every <tspan> because a tspan's own
      // `auto` does NOT resolve against the parent in WebKit — it resolves to
      // `alphabetic`, which paints the label about one font-size high (#2297).
      const tspans = lines.map((ln, i) =>
        '<tspan x="' + cx.toFixed(1) + '" y="' + (first + i * lh).toFixed(1) +
        '" dominant-baseline="central">' + escText(ln) + '</tspan>').join('');
      out += '<text class="state-label-t" text-anchor="middle" dominant-baseline="central" ' +
        'font-size="' + fs.toFixed(1) + '">' + tspans + '</text>';
    }
    return out;
  }

  // The rounded tile intersected with a strip `aw` wide at its left edge. With
  // `aw < rx` (the normal case: a 3px stripe on a 10px corner) the strip's right
  // side meets each corner arc at `dy` from the top and bottom, and the outline
  // follows those arcs round to the tile's left edge. A plain rect there would
  // square off the tile's rounded corners in the accent color.
  function accentPath(n, rx, aw, st) {
    const f = (v) => v.toFixed(1);
    let d;
    if (aw < rx) {
      const dy = rx - Math.sqrt(rx * rx - (rx - aw) * (rx - aw));
      d = 'M ' + f(n.x + aw) + ' ' + f(n.y + dy) +
        ' L ' + f(n.x + aw) + ' ' + f(n.y + n.h - dy) +
        ' A ' + f(rx) + ' ' + f(rx) + ' 0 0 1 ' + f(n.x) + ' ' + f(n.y + n.h - rx) +
        ' L ' + f(n.x) + ' ' + f(n.y + rx) +
        ' A ' + f(rx) + ' ' + f(rx) + ' 0 0 1 ' + f(n.x + aw) + ' ' + f(n.y + dy) + ' Z';
    } else {
      d = 'M ' + f(n.x + rx) + ' ' + f(n.y) + ' L ' + f(n.x + aw) + ' ' + f(n.y) +
        ' L ' + f(n.x + aw) + ' ' + f(n.y + n.h) + ' L ' + f(n.x + rx) + ' ' + f(n.y + n.h) +
        ' A ' + f(rx) + ' ' + f(rx) + ' 0 0 1 ' + f(n.x) + ' ' + f(n.y + n.h - rx) +
        ' L ' + f(n.x) + ' ' + f(n.y + rx) +
        ' A ' + f(rx) + ' ' + f(rx) + ' 0 0 1 ' + f(n.x + rx) + ' ' + f(n.y) + ' Z';
    }
    return '<path class="state-node-accent" aria-hidden="true" data-s="' + st + '" d="' + d + '"/>';
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
  // EVERY tint the pass reads comes back OUT of the DOM, and the DOM is not the
  // parser. `stripTint` refuses anything but a bare token, but that guard runs at
  // BUILD time on the markdown; this function runs in the browser against
  // whatever `data-tint` and `data-sc-transitions` actually carry — and a deck
  // author's raw inline HTML lands in the same document, so `querySelectorAll`
  // can hand this pass a `.state-node` the parser never saw. The value is then
  // interpolated into a `style="…"` attribute and into a `<stop>`'s style, both
  // of which end at `svg.innerHTML`.
  //
  // Measured, before this existed: `data-tint` of
  // `x"><image href="1" onerror="…"><rect a="` closed the style attribute and put
  // a live `onerror` into the frame — the post-sanitize markup injection HARD
  // RULE #22 names, on a same-origin preview frame, and in a distributed `.html`
  // export it bakes into every copy the recipient opens. None of the four #22
  // gates can see it: they scope to `lib/runtime`, `docs/src` and the export
  // roots, and this sink is in `lib/components`.
  //
  // Refusing is better than escaping here, and both are applied. A tint is a
  // TOKEN NAME by contract, so anything else is not a value to sanitize but a
  // value with no meaning — dropping it renders the untinted default, which is
  // exactly what a typo already does.
  function tintToken(v) {
    return typeof v === 'string' && /^[a-z][a-z0-9-]*$/.test(v) ? v : null;
  }

  function escText(t) {
    return String(t).replace(/[&<>"']/g, (ch) => (
      ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;'
        : ch === '"' ? '&quot;' : '&#39;'));
  }

  function edgeLabel(x, y, event, dir, anchor) {
    const lines = String(event).split('\n');
    if (lines.length < 2) {
      return '<text class="state-edge-label" data-dir="' + dir + '" x="' + x.toFixed(1) +
        '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || 'middle') +
        '" dominant-baseline="middle">' + escText(event) + '</text>';
    }
    // Multi-line: centre the BLOCK on y, so a two-line label straddles the point
    // the single-line form would have sat on and the edge stays visually bisected.
    const lh = G.labelLine;
    const top = y - ((lines.length - 1) * lh) / 2;
    // Repeated on each <tspan> for the same reason as the node label above: a
    // tspan's `auto` baseline resolves to `alphabetic` in WebKit, not to the
    // parent's `middle` (#2297).
    const tspans = lines.map((ln, i) =>
      '<tspan x="' + x.toFixed(1) + '" y="' + (top + i * lh).toFixed(1) +
      '" dominant-baseline="middle">' + escText(ln) + '</tspan>').join('');
    return '<text class="state-edge-label" data-dir="' + dir + '" text-anchor="' +
      (anchor || 'middle') + '" dominant-baseline="middle">' + tspans + '</text>';
  }

  // Wrap a long event label onto several lines. Only ever ADDS breaks — an
  // author's own `\n` / `<br>` splits are respected first and each resulting
  // line is wrapped independently, so an explicit break is never undone.
  //
  // The width budget is a share of the rank gap, because that is the space the
  // label actually has: on LR it sits under a horizontal run, on TB beside a
  // vertical one. Wrapping to a budget the layout does not have is what makes a
  // label bleed into a node.
  function wrapEventLabel(event, budget, measure) {
    if (!event || !(budget > 0) || typeof measure !== 'function') return event;
    const out = [];
    for (const para of String(event).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const next = line + ' ' + words[i];
        // A single word wider than the budget is kept whole rather than broken
        // mid-token: an event name is an identifier to the reader, and hyphenating
        // `acknowledge` helps nobody.
        if (measure(next) <= budget) line = next;
        else { out.push(line); line = words[i]; }
      }
      out.push(line);
    }
    return out.join('\n');
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
  // The point half way ALONG the polyline by arc length. `pts[len/2]` is the
  // middle VERTEX, which on an orthogonal route with a long first leg and a
  // short last one is nowhere near the middle of the drawn line — and the label
  // then reads as belonging to the wrong end.
  function pointAlong(pts, frac) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (!(total > 0)) return pts[0];
    const target = total * frac;
    let seen = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (seen + seg >= target) {
        const u = seg > 0 ? (target - seen) / seg : 0;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
                 y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
      }
      seen += seg;
    }
    return pts[pts.length - 1];
  }

  const midpointOf = (pts) => pointAlong(pts, 0.5);

  // Which way the run under `pointAlong(pts, frac)` goes: 'lr' for a horizontal
  // run, 'tb' for a vertical one — the side `labelBoxAt` sets a label on.
  function runDirAt(pts, frac) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const target = total * frac;
    let seen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      seen += Math.hypot(dx, dy);
      if (seen >= target) return Math.abs(dx) >= Math.abs(dy) ? 'lr' : 'tb';
    }
    return 'lr';
  }

  // Where a label actually SITS, given the anchor point the route offers.
  // Mirrors `edgeLabel`'s own geometry: `(x, y)` is the block CENTER with
  // `dominant-baseline: middle`, so the block spans `nlines * labelLine`
  // vertically about `y`, and horizontally by the anchor.
  // THE MODEL BOX IS THE LINE BOX, AND THE PAINTED LABEL IS BIGGER THAN IT — see
  // `labelPad` in G_BASE for what it is made of and why it is scaled. Testing the
  // bare line box certified placements that still overlapped by ~0.7px, which is
  // how the first cut of this walk left two of three collisions standing.

  // `side` is +1 for the label's home side — BELOW a horizontal run on `lr`, to
  // the RIGHT of a vertical one on `tb` — and -1 for the far side. The far side
  // is the second degree of freedom the walk has, and it needs one: on a dense
  // machine every point along an edge can be crowded while the mirror of one of
  // them is completely clear.
  function labelBoxAt(mid, dagreDir, nlines, w, side) {
    const h = nlines * G.labelLine;
    const sgn = side < 0 ? -1 : 1;
    if (dagreDir === 'lr') {
      // `ly` is derived so the block edge nearest the line lands `labelOff` off
      // it — see the note at the call site for the halo that forced it.
      const ly = mid.y + sgn * (G.labelOff + G.labelLine / 2 + ((nlines - 1) * G.labelLine) / 2);
      return { x: mid.x - w / 2 - G.labelPad, y: ly - h / 2 - G.labelPad,
        w: w + G.labelPad * 2, h: h + G.labelPad * 2, lx: mid.x, ly, anchor: 'middle' };
    }
    const lx = mid.x + sgn * G.labelOff;
    return { x: (sgn > 0 ? lx : lx - w) - G.labelPad, y: mid.y - h / 2 - G.labelPad,
      w: w + G.labelPad * 2, h: h + G.labelPad * 2, lx,
      ly: mid.y, anchor: sgn > 0 ? 'start' : 'end' };
  }

  /** How much of `box` two rectangles share — 0 when they are clear. */
  function overlapArea(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 0 && oy > 0 ? ox * oy : 0;
  }

  const boxesHit = (a, b, pad) => (
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > -pad
    && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > -pad);

  // SLIDE THE LABEL ALONG ITS OWN EDGE UNTIL IT CLEARS.
  //
  // The clearance floor fed to dagre reserves room along the rank and cross axes,
  // which bounds a label on an AXIS-ALIGNED run and bounds nothing on a diagonal
  // one — so a label taken at the arc-length midpoint could graze a node. Measured
  // on the shipped decks before this: `accept` overlapped node 2 by 3.28px and
  // `block` overlapped node 9 by 1.63px, and `block` also overlapped the `reject`
  // label by 1.9px.
  //
  // THE OBVIOUS FIX IS THE WRONG ONE, and it is written down here because it is
  // what the defect's own note proposed: "place the label on the longest
  // AXIS-ALIGNED segment of the route (dagre's orthogonal routes always have
  // one)". Both halves of that are false here, measured off the shipped decks.
  // dagre-d3-es does not route orthogonally — it emits a point per rank boundary,
  // so a route is a short stub at each node border joined by long DIAGONALS. On
  // the two figures that actually graze, the longest axis-aligned segment is
  // 34px against a 277px diagonal (and one edge has no axis-aligned segment at
  // all). Anchoring there would park every label a few pixels from a node border
  // — decisively worse than the 3px graze it set out to fix.
  //
  // So keep the midpoint and MOVE ALONG THE LINE instead. The label stays on the
  // edge it names, which is the property that makes it readable at all; it just
  // slides to a stretch where its box fits. Candidates walk outward from the
  // middle and stop well short of either end, so a label never creeps under a
  // node border or the arrowhead.
  //
  // 0.5 IS TRIED FIRST AND KEPT WHEN IT IS CLEAR, so every label that does not
  // collide is emitted at exactly the coordinate it had before — the change
  // moves the three that overlapped and nothing else. Nothing clear anywhere
  // falls back to 0.5 as well: no worse than today, never a label parked
  // somewhere arbitrary.
  const LABEL_SPOTS = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74];

  // How far a box falls OUTSIDE the canvas. The viewBox is fixed from the node
  // rects and the routed polylines before any label is placed — labels never
  // enter that extent — so a candidate can be clear of every box and still hang
  // past the edge, where `.chart-body`'s `overflow: clip` cuts it and the
  // engine's own CONTENT CLIPPED gate fires on a shipped PDF. That is §9.1's F1
  // in a new costume, and it is why this is weighted ABOVE a node overlap: a
  // grazed label is still readable, a clipped one has lost its text.
  function outsideArea(b, canvas) {
    if (!canvas) return 0;
    const dx = Math.max(0, -b.x) + Math.max(0, (b.x + b.w) - canvas.w);
    const dy = Math.max(0, -b.y) + Math.max(0, (b.y + b.h) - canvas.h);
    return dx * b.h + dy * b.w;
  }

  function placeLabel(pts, dagreDir, nlines, w, ctx) {
    const anchor = ctx?.cur?._anchor;
    // A grid route names the side its anchor run wants (see `_anchorDir`).
    if (anchor && ctx.cur._anchorDir) dagreDir = ctx.cur._anchorDir;
    const home = labelBoxAt(anchor || midpointOf(pts), dagreDir, nlines, w, 1);
    if (!ctx || !(w > 0)) return home;
    // Other edges' RUNS, on a wrapped chain only (`ctx.segs`). There a full-width
    // wrap connector crosses every edge that climbs back a line, and the midpoint
    // of the climbing edge is exactly where the two meet: `reopen` sat on the
    // `publish` run. A segment is tested as a hairline box — the edge's OWN runs
    // included: a label placed beside its run never touches it (it sits
    // `labelOff` clear), so touching one means the label landed ON its own line,
    // which is the failure the red team reproduced (`—cancel—` drawn across its
    // own connector once the walk fell back to a spot on a perpendicular run).
    const segHit = (box) => {
      let hit = 0;
      for (const sg of ctx.segs || []) {
        const x0 = Math.max(box.x, Math.min(sg.x0, sg.x1)), x1 = Math.min(box.x + box.w, Math.max(sg.x0, sg.x1));
        const y0 = Math.max(box.y, Math.min(sg.y0, sg.y1)), y1 = Math.min(box.y + box.h, Math.max(sg.y0, sg.y1));
        if (x1 >= x0 && y1 >= y0) hit += Math.max(x1 - x0, y1 - y0, 1);
      }
      return hit;
    };
    const clash = (box) => {
      if (outsideArea(box, ctx.canvas) > 0) return true;
      for (const n of ctx.boxes) if (boxesHit(box, n, 0)) return true;
      for (const l of ctx.placed) if (boxesHit(box, l, 0)) return true;
      if (segHit(box) > 0) return true;
      return false;
    };
    // A NODE collision outweighs a label one: a label over a node box hides the
    // state's own name and its gradient, while two labels that touch are still
    // both readable. The weight only orders the fallback — a candidate that
    // clears everything is taken outright.
    // Ordering, not a verdict: a candidate that clears everything is taken
    // outright. Off-canvas outranks a node overlap, which outranks a label
    // overlap — lost text, then a hidden state name, then two words that touch.
    // The home midpoint is scored on the same scale, so the walk can never
    // return something further out of bounds than the placement it replaced.
    const score = (box) => {
      let sc = outsideArea(box, ctx.canvas) * 16;
      for (const n of ctx.boxes) sc += overlapArea(box, n) * 4;
      for (const l of ctx.placed) sc += overlapArea(box, l);
      sc += segHit(box) * G.labelLine;
      return sc;
    };
    let chosen = home;
    if (clash(home)) {
      // No clear spot on a crowded machine is a real outcome — the ten-step
      // pipeline of `examples/state-chart-stress.md` has one. Fall back to the
      // LEAST bad candidate rather than to the middle: keeping `home` there is
      // what let the first cut of this walk push `block` further INTO `reject`
      // than it started, trading one collision for a worse one.
      let bestScore = score(home);
      // HOME SIDE FIRST, ALL OF IT, before considering the far side: a machine
      // whose labels all sit on one side of their lines reads as one figure, so
      // the mirror is a last resort rather than an equal option.
      outer: for (const side of [1, -1]) {
        // The home side skips index 0: `home` IS that candidate and was tested
        // above. The far side starts at 0, because the midpoint mirrored across
        // the line is a genuinely different placement and often the best one.
        for (let i = side > 0 ? 1 : 0; i < LABEL_SPOTS.length; i++) {
          // On a grid route each spot takes the side of the RUN it lands on — below
          // a horizontal one, right of a vertical one — not the anchor run's side.
          const spotDir = anchor ? runDirAt(pts, LABEL_SPOTS[i]) : dagreDir;
          const box = labelBoxAt(pointAlong(pts, LABEL_SPOTS[i]), spotDir, nlines, w, side);
          if (!clash(box)) { chosen = box; break outer; }
          const sc = score(box);
          if (sc < bestScore) { bestScore = sc; chosen = box; }
        }
      }
    }
    ctx.placed.push(chosen);
    return chosen;
  }

  // Catmull-Rom → cubic Bézier through the routed vertices. Eases dagre's own
  // polyline instead of replacing it, so a curved edge still goes where the
  // layout put it and still lands on the clipped tip.
  function smoothPath(pts) {
    let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ', ' + c2x.toFixed(1) + ' ' +
        c2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d;
  }

  // An orthogonal polyline with each corner replaced by a quarter-round. The
  // radius is capped at half of either leg, so a short stub never folds back.
  function roundedPath(pts) {
    const f = (v) => v.toFixed(1);
    let d = 'M ' + f(pts[0].x) + ' ' + f(pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      // Generous on purpose: `curved` is the ONLY caller, and at a quarter-lane the
      // variant was indistinguishable from the square default (the inversion lens).
      const r = Math.min(G.laneStep * 1.4, l1 / 2, l2 / 2);
      if (!(r > 0.5)) { d += ' L ' + f(b.x) + ' ' + f(b.y); continue; }
      const p1 = { x: b.x - (b.x - a.x) / l1 * r, y: b.y - (b.y - a.y) / l1 * r };
      const p2 = { x: b.x + (c.x - b.x) / l2 * r, y: b.y + (c.y - b.y) / l2 * r };
      d += ' L ' + f(p1.x) + ' ' + f(p1.y) + ' Q ' + f(b.x) + ' ' + f(b.y) + ', ' + f(p2.x) + ' ' + f(p2.y);
    }
    const z = pts[pts.length - 1];
    return d + ' L ' + f(z.x) + ' ' + f(z.y);
  }

  function edgeDagre(t, from, to, ev, dagreDir, style, ctx) {
    const pts = t._pts.slice();
    // Clip the polyline to the target's border, so the arrowhead is not hidden
    // behind the node's own fill.
    //
    // An earlier version of this comment said dagre "routes CENTRE to CENTRE, so
    // the last point sits inside the box". It does not: dagre-d3-es computes node
    // intersects, and measured, an edge between 40-tall boxes at y=20 and y=120
    // ends at y=100 — exactly ON the border. So this walk is defensive, not
    // corrective, against dagre's own output today.
    //
    // It is still a genuine walk BACK rather than a look at the final segment,
    // and that part earned itself: an earlier cut ended every branch of the loop
    // in `break`, so it examined one segment and stopped. That is wrong for any
    // route ending deep inside the box — a shape dagre does not currently produce
    // but nothing here guarantees.
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
    // `curved` has to survive a re-rank. The modifier used to reach only
    // edgeTB/edgeLR, so a fan-out silently rendered as the default variant and
    // the author got no signal the modifier had been dropped. A Catmull-Rom pass
    // over dagre's vertices eases the same route rather than inventing another.
    // A grid route is ORTHOGONAL by construction, and a spline through its corners
    // overshoots them — the wrap connector swung out past the end of its row. So
    // `curved` rounds its corners instead, which is the same eased reading.
    const d = style === 'curved' && pts.length > 2 ? (t._orth ? roundedPath(pts) : smoothPath(pts)) :
      'M ' + pts.map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' L ');
    // The label sits OFF the line, not on it: BELOW on a left-to-right machine,
    // to the RIGHT on a top-to-bottom one. On the line it needed a halo to knock
    // the stroke out from behind the glyphs, and a two-line label made that
    // knockout a hole in the edge. Beside it, the edge stays continuous.
    //
    // Which side is not arbitrary — it is the axis the edge does NOT run along,
    // so the offset never eats the rank gap the arrow needs.
    // The offset geometry lives in `labelBoxAt`, which both this and the
    // collision walk read, so the drawn position and the tested box cannot
    // disagree. On `lr` the block's TOP lands `labelOff` below the line, not its
    // center: `mid.y + labelOff` would put the first line's CENTER 7px below the
    // edge, its box top 0.5px below it, and `.state-edge-label`'s
    // `paint-order: stroke` halo (0.46875cqi, ~3px half-width at the HD baseline)
    // reaches back across the line. Measured on page 7 of
    // `examples/state-chart-branching.md`: the one-line `auto approve` notched the
    // green edge and the two-line `escalate to legal / counsel` broke its
    // connector into a dashed run — in the deck whose own coda says a label
    // "never punches a hole through the edge it belongs to".
    let lx, ly, anchor = 'middle';
    if (ev) {
      if (ctx) ctx.cur = t;
      const spot = placeLabel(pts, dagreDir, String(ev).split('\n').length, t._lw || 0, ctx);
      lx = spot.lx; ly = spot.ly; anchor = spot.anchor;
    } else {
      const mid = midpointOf(pts);
      lx = mid.x; ly = mid.y;
    }
    return '<path class="state-edge" data-anima-role="bar" data-dir="' + ddir + '" d="' + d + '"/>' +
      arrowhead(tip.x, tip.y, ang, ddir) +
      (ev ? edgeLabel(lx, ly, ev, ddir, anchor) : '');
  }

  function edge(t, byIndex, dir, style, ctx) {
    const from = byIndex[t.from], to = byIndex[t.to];
    if (!from || !to) return '';
    const ev = t.event || '';
    // A re-ranked machine draws dagre's route; everything else — every chain,
    // and every self-loop on any machine — keeps the column router unchanged.
    const body = t._pts && t._pts.length > 1
      ? edgeDagre(t, from, to, ev, dir, style, ctx)
      : (dir === 'lr' ? edgeLR(t, from, to, ev, style) : edgeTB(t, from, to, ev, style));
    const d = t.isSelf ? 'self' : (t.to > t.from ? 'forward' : 'back');
    // One style on the GROUP rather than on each of the fourteen `<path>` emit
    // sites: custom properties inherit, so `--edge-tint` reaches the path, the
    // arrowhead polygon and the label from here. The CSS reads each with the
    // untinted value as its fallback, so an untinted edge emits no style
    // attribute and renders byte-identically.
    // Same provenance as `data-tint`: `t` came from JSON.parse of an attribute on
    // an element in the document, not from the parser — so it is validated here
    // too, by the same rule, for the same reason.
    const tTint = tintToken(t.tint), tBg = tintToken(t.labelBg);
    // THE INLINE VALUE CARRIES ITS OWN FALLBACK, because an inline declaration
    // always beats the stylesheet's — so a token that does not exist could not
    // fall back to the section's default, it made `--edge-tint` invalid at
    // computed-value time and the properties reading it fell to their SVG
    // initials. Measured: one dropped letter in `:::state-pass-hue` gave
    // `stroke: none` (the transition vanished from the diagram) and a black
    // arrowhead. Five surfaces — the docblock, the docs, the manifest, the
    // changelog and the design record — all promise the opposite: "a well-formed
    // name for a token that does not exist … the deck degrades, it does not
    // break." This is what makes that true. The fallback is chosen by DIRECTION,
    // so a typo on a back edge degrades to the back default rather than the
    // forward one.
    const tintFallback = d === 'back' ? '--state-edge-back' : '--state-edge';
    const tintStyle =
      (tTint ? '--edge-tint:var(--' + escText(tTint) + ',var(' + tintFallback + '));' : '') +
      (tBg ? '--edge-label-bg:var(--' + escText(tBg) + ',var(--state-label-bg));' : '');
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
  const byIndexOf = (nodes, idx) => {
    for (const n of nodes) if (n.index === idx) return n;
    return null;
  };

  function dagrePositions(nodes, transitions, dir, metrics, stretch, dropped) {
    const D = globalThis.__latticeDagre;
    if (!D || typeof D.Graph !== 'function') return null;
    // A DROPPED NODE MAKES THIS PASS AND THE EXPORT GATE DISAGREE, so decline.
    //
    // `draw()` drops a `.state-node` whose measured rect is non-finite. The
    // Node-side gate (`state-chart.adoption.js`) reads `<li>`s out of the markup
    // and cannot see that happen, so the two run their identical predicate over
    // DIFFERENT topologies — and the smaller one branches where the whole one does
    // not, because the drop leaves nodes isolated and dagre parks every isolated
    // node in rank 0. Fuzzed over 3,210 machines with an induced drop: 102 cases
    // where the gate answered "chain" and this pass re-ranked anyway, and 0 with
    // this guard. That is the unsafe direction — the export withholds an engine
    // the browser then wants, and the machine silently returns to the column.
    //
    // (The first count taken here was 363, from an oracle that read "re-ranked"
    // as any painted box away from a CSS rect. It was wrong for a reason worth
    // keeping: when a node is dropped the SYNTHETIC EXIT reuses its index, so the
    // paint loop draws the exit as a state box at a position no CSS rect has, and
    // the oracle read that stray shape as a re-rank. Pre-existing, off this path,
    // and recorded in the decision note rather than fixed here.)
    //
    // Declining is the honest close rather than reconciling the two: a figure with
    // an unmeasurable node has no reliable geometry to lay out, the column is the
    // documented fallback for exactly that, and it keeps ONE topology behind the
    // decision instead of two that have to be argued equal. Reachable only through
    // the raw inline HTML door the tint injection uses, never from authored
    // markdown.
    if (dropped) return null;
    // The synthetic final node IS handed to dagre. Leaving it out placed it from
    // column geometry — below whichever node had the highest index — while every
    // terminal converged on it through the column router, which sent one of those
    // edges off the canvas entirely on a fan-out. dagre ranks it like any other
    // sink and routes the convergence properly.
    const real = nodes.slice();
    if (real.length < 3) return null;   // nothing to re-rank
    // How much room the labels need, split by axis, plus the density factor.
    const lr = dir === 'lr';
    // CLEARANCE FOLLOWS WHERE THE LABEL SITS, and the two axes are asymmetric
    // because the label is drawn BESIDE the line, not across it.
    //
    //   LR — the label sits BELOW a horizontal run, so the run must be at least
    //        as long as the label is WIDE. Its height goes on the cross axis.
    //   TB — the label sits to the RIGHT of a vertical run, so its width goes on
    //        the CROSS axis and the run itself only has to clear the arrowhead.
    //
    // That second case is the point of putting the label there: stacking the
    // label's height into the rank gap as well would spend vertical space on
    // something no longer occupying any, and vertical space is the scarce axis
    // on a 16:9 stage. The label is CENTERED on the edge midpoint, so the gap
    // still has to be at least the label's own height or a two-line label would
    // spill past the node below — hence `max`, not a bare arrow clearance.
    const labelH = metrics.maxLines * G.labelLine;
    // `labelMargin` each side on `lr`, as the grid's flow gap has (`gridLayout`):
    // without it a label under a short run sat flush against both boxes, and a
    // dagre machine next to a wrapped chain in the same deck read as the cramped
    // one.
    const rankClear = lr
      ? metrics.maxW + G.arrow + G.gap * 2 + G.labelMargin * 2
      : Math.max(G.arrow + G.gap * 2, labelH);
    const crossClear = (lr ? labelH : metrics.maxW) + G.labelOff + G.gap;
    // Sparse machines get air, dense ones stay tight. Measured against the node
    // count rather than the canvas, because the canvas is what this call is
    // computing — a feedback loop the other way round.
    const airy = real.length <= 4 ? 1.7 : real.length <= 7 ? 1.35 : 1;

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
        // Separation is RESPONSIVE to how dense the machine is, with a hard floor
        // at label clearance. A sparse machine reads better with air around it; a
        // dense one has to stay compact or it outgrows the stage and the fit
        // shrinks the type instead. `airy` interpolates between the two, and the
        // floor is what keeps "responsive" from ever meaning "a label overlaps a
        // node" — the length can grow, it can never shrink past clearance.
        //
        // THE FLOOR IS AN AXIS-ALIGNED GUARANTEE, and only that. It reserves room
        // along the rank and cross axes; a DIAGONAL run gets its label at the
        // polyline's arc-length midpoint plus a fixed perpendicular offset, which
        // the floor does not bound. What closes the gap is not this floor but
        // `placeLabel`, which slides a label along its own edge until its box
        // clears every node and every label already placed — see the note there,
        // including why anchoring on "the longest axis-aligned segment" (the fix
        // this comment used to propose) is measurably the wrong one.
        nodesep: Math.max(G.gap * 2.5, crossClear) * airy,
        // The rank gap must clear the label along the axis the edge RUNS, which
        // is the axis the label does NOT sit on now that it is drawn beside the
        // line: an LR label sits under a horizontal run, so the run has to be at
        // least as long as the label is wide; a TB label sits beside a vertical
        // run, so the run has to clear the label's stacked HEIGHT.
        ranksep: Math.max(G.gap * 3, rankClear) * airy * (stretch || 1),
        marginx: 0,
        marginy: 0,
      });
      g.setDefaultEdgeLabel(() => ({}));
      for (const n of real) g.setNode(String(n.index), { width: n.w, height: n.h });
      let e = 0;
      const edgeName = new Map();   // transition object -> dagre edge name
      for (const t of transitions) {
        // Self-loops are NOT handed to dagre: it does not route them, and
        // feeding it a self-edge perturbs the ranking for no gain. The existing
        // router draws them, as it does today.
        if (t.isSelf || t.from === t.to) continue;
        if (!g.hasNode(String(t.from)) || !g.hasNode(String(t.to))) continue;
        // The graph is a MULTIGRAPH with a distinct name per edge, so dagre really
        // does route two `1 -> 2` transitions separately. Keying the results by
        // endpoint pair threw one away and drew both on top of each other, with
        // their labels exactly coincident — the information to do better was
        // already here and was being discarded.
        const name = 'e' + (e++);
        edgeName.set(t, name);
        g.setEdge(String(t.from), String(t.to), { width: 0, height: 0 }, name);
      }
      D.layout(g);

      // The adoption test: does any rank hold more than one node? Ranks are the
      // cross-axis coordinate — y for TB, x for LR.
      // Adoption asks what the LAYOUT looks like, not what the grammar says — two
      // nodes sharing a rank. That distinction is deliberate and was arrived at
      // by measurement: "some state has two successors" sounds like the right
      // question, but a SKIP edge (`1 => 2` beside `1 => 5`) satisfies it while
      // dagre still ranks the machine linearly, so switching to it re-laid out
      // every shipped gallery for no visual gain.
      //
      // Two exclusions, both of which were bugs first:
      //   · the SYNTHETIC EXIT — a sink every terminal converges on, so counting
      //     it makes any machine with two endings look like a join;
      //   · DISCONNECTED nodes — dagre parks every one of them in rank 0, so a
      //     states-only chart with no transitions at all, and a chain with one
      //     orphan state, both "shared a rank" and were re-ranked into a row.
      // SYNTHETIC EXIT EDGES DO NOT COUNT AS WIRING. By the time this runs, every
      // terminal has had an edge to the synthetic exit pushed onto `transitions`
      // — so on a states-only chart EVERY node is a terminal, every node looks
      // wired, and all of them land in rank 0 together. Excluding the node was
      // not enough; the edges into it have to go too.
      const wired = new Set();
      for (const t of transitions) {
        if (t.isSelf || t.from === t.to) continue;
        if (byIndexOf(nodes, t.to)?.isFinal) continue;
        wired.add(t.from); wired.add(t.to);
      }
      const along = (v) => (dir === 'lr' ? v.x : v.y);
      const ranks = Object.create(null);
      let branching = false;
      for (const n of real) {
        if (n.isFinal || !wired.has(n.index)) continue;
        const v = g.node(String(n.index));
        if (!v) return null;
        const key = Math.round(along(v));
        if (ranks[key]) { branching = true; break; }
        ranks[key] = 1;
      }
      if (!branching) return null;   // a column — leave the CSS positions alone

      // dagre reports CENTERS; the rest of this pass works in top-left corners.
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
      for (const ed of g.edges()) {
        const rec = g.edge(ed);
        if (rec?.points && rec.points.length > 1) {
          out.pts[ed.name] = rec.points.map((q) => ({ x: q.x, y: q.y }));
        }
        for (const q of rec?.points || []) {
          out.width = Math.max(out.width, q.x);
          out.height = Math.max(out.height, q.y);
        }
      }
      out.name = edgeName;
      return out;
    } catch (_e) {
      return null;   // never let a layout failure take the diagram down
    }
  }

  // ── Reading-order wrap (a chain on more than one line) ─────────────────────
  //
  // A chain on one line is the right picture until it stops fitting, and past
  // that point the only thing the old layout could do was shrink: measured in
  // the Playground on a 16:9 stage, a 10-state chain set its state names at
  // 4.6px vertically and 8.1px in a row. This lays the same chain out on
  // several lines in READING ORDER — every line runs the same way, and a
  // connector drops from the end of one line to the start of the next — so the
  // type keeps its size and the stage is used in both directions.
  //
  // It produces the same shape `dagrePositions` does (`pos` + routed `pts`),
  // which is the whole integration: the painter, the arrowheads, the label
  // walk and `curved` already handle a routed polyline, so this adds a
  // producer and no second painter.
  //
  // WORKED IN FLOW COORDINATES. `u` runs along the flow (x on `lr`, y on `tb`)
  // and `v` across it, so one body serves both directions and the transpose
  // happens once, at the end. "Above" a line means smaller `v`; the label side
  // (`placeLabel`'s home side — below on `lr`, right on `tb`) is +v.
  //
  // ROUTES, by what an edge joins (every one orthogonal):
  //   · the next state on the same line — straight, across the flow gap;
  //   · a later state on the same line (a skip) — out of the node's +v side,
  //     along the channel below the line, back in from below;
  //   · an earlier state on the same line, or itself — the same, above;
  //   · the adjacent line — through the one channel between them (this is the
  //     wrap connector, and a back-edge to the line above);
  //   · two or more lines away — out to a side gutter (forward on the far side,
  //     back on the near side), along it, and in through the target's channel.
  // Lanes are packed per channel so parallel runs never share a track, and the
  // edges meeting one side of a node are spread across it in the order they
  // leave, so their stubs do not cross each other.
  function gridLayout(nodes, transitions, dir, lines, metrics) {
    const lr = dir === 'lr';
    const real = nodes.filter((n) => !n.isFinal).sort((a, b) => a.index - b.index);
    const fin = nodes.find((n) => n.isFinal) || null;
    const N = real.length;
    if (N < 2 || !(lines >= 1)) return null;
    const per = Math.ceil(N / lines);
    const nLines = Math.ceil(N / per);
    // Every line holds at least two states; a lone state on the last line reads
    // as an afterthought rather than a continuation.
    if (nLines !== lines || (nLines > 1 && N - (nLines - 1) * per < Math.min(2, per))) return null;
    const A = (n) => (lr ? n.w : n.h);   // extent ALONG the flow
    const C = (n) => (lr ? n.h : n.w);   // extent ACROSS it
    const hasLabel = transitions.some((t) => t.event);
    const labelBlock = metrics.maxLines * G.labelLine + 2 * G.labelPad;
    // A label sits BESIDE its run: along an in-line run it needs the run's
    // length, across a channel lane it needs the gap to the next lane.
    const labelAlong = lr ? metrics.maxW : labelBlock;
    const labelAcross = lr ? labelBlock : metrics.maxW;
    const flowGap = Math.max(lr ? G.gapFloorLr : G.gapFloorTb,
      hasLabel ? labelAlong + G.arrow + 2 * G.gap + 2 * G.labelMargin : 0);
    const laneGap = Math.max(G.laneStep, (hasLabel ? labelAcross + G.labelOff : 0) + 2 * G.gap);

    // ── cells, columns, lines ──
    const cell = new Map();
    real.forEach((n, i) => { cell.set(n.index, { line: Math.floor(i / per), col: i % per }); });
    const colA = new Array(per).fill(0);
    const lineC = new Array(nLines).fill(0);
    for (const n of real) {
      const c = cell.get(n.index);
      colA[c.col] = Math.max(colA[c.col], A(n));
      lineC[c.line] = Math.max(lineC[c.line], C(n));
    }
    const colStart = [];
    let acc = 0;
    for (let j = 0; j < per; j++) { colStart.push(acc); acc += colA[j] + flowGap; }
    // u of each node (centered in its column), and the final ring after the last.
    const U = new Map();   // index -> { uL, uR, uc }
    for (const n of real) {
      const c = cell.get(n.index);
      const uL = colStart[c.col] + (colA[c.col] - A(n)) / 2;
      U.set(n.index, { uL, uR: uL + A(n), uc: uL + A(n) / 2 });
    }
    const last = real[N - 1];
    if (fin) {
      const lc = cell.get(last.index);
      cell.set(fin.index, { line: lc.line, col: lc.col + 1 });
      const uc = U.get(last.index).uR + G.markerGap;
      U.set(fin.index, { uL: uc - A(fin) / 2, uR: uc + A(fin) / 2, uc });
    }
    let gridLo = 0, gridHi = 0;
    for (const [, q] of U) { gridLo = Math.min(gridLo, q.uL); gridHi = Math.max(gridHi, q.uR); }

    // ── classify every edge ──
    const byIdx = (i) => nodes.find((n) => n.index === i);
    const plans = [];
    for (const t of transitions) {
      const a = byIdx(t.from), b = byIdx(t.to);
      if (!a || !b || !cell.has(a.index) || !cell.has(b.index)) continue;
      const ca = cell.get(a.index), cb = cell.get(b.index);
      let kind;
      if (t.isSelf || t.from === t.to) kind = 'self';
      else if (ca.line === cb.line) {
        kind = cb.col === ca.col + 1 ? 'straight' : (cb.col > ca.col ? 'skip' : 'back');
      } else if (cb.line === ca.line + 1) kind = 'down';
      else if (cb.line === ca.line - 1) kind = 'up';
      else kind = cb.line > ca.line ? 'downFar' : 'upFar';
      plans.push({ t, a, b, ca, cb, kind });
    }

    // ── which side each loop takes ──
    // A skip naturally rides BELOW its line and a back-edge ABOVE, but two loops
    // on one side whose spans OVERLAP without nesting (3→5 beside 4→6) must cross,
    // whatever the lanes do. So each loop, shortest first, takes the side where it
    // interleaves with the fewest loops already placed, keeping its natural side
    // on a tie — the balancing the column router's gutters did for a single stack.
    const loops = plans.filter((pl) => pl.kind === 'skip' || pl.kind === 'back')
      .map((pl) => ({ pl, line: pl.ca.line, lo: Math.min(pl.ca.col, pl.cb.col), hi: Math.max(pl.ca.col, pl.cb.col) }))
      .sort((x, y) => (x.hi - x.lo) - (y.hi - y.lo) || x.lo - y.lo);
    const interleaves = (x, y) => x.line === y.line
      && ((x.lo < y.lo && y.lo < x.hi && x.hi < y.hi) || (y.lo < x.lo && x.lo < y.hi && y.hi < x.hi));
    const placedLoops = [];
    for (const lp of loops) {
      const natural = lp.pl.kind === 'skip' ? 'lo' : 'hi';
      const cost = (side) => placedLoops.filter((o) => o.side === side && interleaves(o, lp)).length;
      const other = natural === 'lo' ? 'hi' : 'lo';
      lp.side = cost(other) < cost(natural) ? other : natural;
      lp.pl.side = lp.side;
      placedLoops.push(lp);
    }

    // ── ports: where each edge meets its node's +v ('lo') or -v ('hi') side ──
    const sides = new Map();   // `${index}:${side}` -> [{ plan, end, key }]
    const attach = (n, side, plan, end, key) => {
      const k = n.index + ':' + side;
      if (!sides.has(k)) sides.set(k, []);
      sides.get(k).push({ plan, end, key });
    };
    // A run that leaves a line and comes back to it (a skip, a back-edge) is a
    // LOOP, and loops on one side of a node must nest. Two rules, and the
    // measurements that set them:
    //   · loops heading the SAME way nest outward — the longer one rides the outer
    //     lane, so its stub sits further from where it is heading than the shorter
    //     one's. Sorted by the other end's position instead, four back-edges into
    //     one state crossed six times;
    //   · loops heading OPPOSITE ways do not interleave — every loop heading to
    //     lower `u` sits before every loop heading to higher `u`. Nesting alone
    //     crossed a back-edge up to state 2 with one returning from state 6.
    // Edges that cross to another line keep the natural order (`otherU`), and
    // their keys fall between the two groups.
    const HUG = 1e6;
    const hugKey = (here, other) => (other >= here ? HUG - (other - here) : -HUG + (here - other));
    for (const pl of plans) {
      const ua = U.get(pl.a.index).uc, ub = U.get(pl.b.index).uc;
      switch (pl.kind) {
        case 'straight': break;
        // A self-loop is drawn by the line router's corner hook (see below), so it
        // takes no port here — only room.
        case 'self': break;
        case 'skip': case 'back':
          attach(pl.a, pl.side, pl, 'src', hugKey(ua, ub)); attach(pl.b, pl.side, pl, 'dst', hugKey(ub, ua)); break;
        case 'down': attach(pl.a, 'lo', pl, 'src', ub); attach(pl.b, 'hi', pl, 'dst', ua); break;
        case 'up': attach(pl.a, 'hi', pl, 'src', ub); attach(pl.b, 'lo', pl, 'dst', ua); break;
        case 'downFar': attach(pl.a, 'lo', pl, 'src', gridHi + 1); attach(pl.b, 'hi', pl, 'dst', gridHi + 1); break;
        case 'upFar': attach(pl.a, 'hi', pl, 'src', gridLo - 1); attach(pl.b, 'lo', pl, 'dst', gridLo - 1); break;
        default: break;
      }
    }
    const portStep = Math.max(G.selfHalf, G.laneStep * 0.6);
    for (const [k, list] of sides) {
      const n = byIdx(parseInt(k, 10));
      const q = U.get(n.index);
      list.sort((x, y) => x.key - y.key);
      const span = Math.min(A(n) * 0.7, (list.length - 1) * portStep);
      const step = list.length > 1 ? span / (list.length - 1) : 0;
      list.forEach((at, i) => {
        at.plan[at.end === 'src' ? 'ps' : 'pd'] = q.uc - span / 2 + i * step;
      });
    }
    // STUBS ACROSS A CHANNEL MUST NOT LINE UP. A node's -v stubs rise into the
    // channel its column shares with the node directly above, whose +v stubs drop
    // into the same channel — and two centered stubs meet end to end. They are
    // different edges, but they draw ONE line: the inversion lens found the
    // headline machine reading "Draft -> Approved" because Draft's `discard` stub
    // and the wrap connector into Approved met in one vertical. So where a -v port
    // falls within a fraction of a step of a facing +v port, the whole side slides
    // half a step (inward, so it stays on the tile).
    const colLine = new Map();
    for (const [idx, c] of cell) colLine.set(c.line + ':' + c.col, idx);
    const portsOf = (idx, side) => (sides.get(idx + ':' + side) || [])
      .map((at) => at.plan[at.end === 'src' ? 'ps' : 'pd']);
    for (const [k, list] of sides) {
      const [idxStr, side] = k.split(':');
      if (side !== 'hi') continue;
      const c = cell.get(+idxStr);
      if (!c || c.line === 0) continue;
      const above = colLine.get((c.line - 1) + ':' + c.col);
      if (above == null) continue;
      const facing = portsOf(above, 'lo');
      const mine = list.map((at) => at.plan[at.end === 'src' ? 'ps' : 'pd']);
      if (!mine.some((x) => facing.some((y) => Math.abs(x - y) < portStep * 0.4))) continue;
      const q = U.get(+idxStr);
      const shift = (Math.max(...mine) + portStep * 0.5 <= q.uR - A(byIdx(+idxStr)) * 0.1 ? 1 : -1) * portStep * 0.5;
      for (const at of list) at.plan[at.end === 'src' ? 'ps' : 'pd'] += shift;
    }

    // ── channel lanes (channel L sits above line L; channel nLines below the last) ──
    // Three groups per channel, stacked: runs that hug the line ABOVE (skips),
    // runs that cross between the lines, runs that hug the line BELOW (back-edges,
    // self-loops). Short runs are packed first so they take the innermost lanes.
    const chans = [];
    for (let c = 0; c <= nLines; c++) chans.push({ U: [], X: [], D: [] });
    // `top` / `bot`: where the run's stubs meet the line above and the line below
    // (a gutter end meets neither, so it is parked outside every span).
    const seg = (c, grp, lo, hi, pl, which, top, bot) => {
      chans[c][grp].push({ lo: Math.min(lo, hi), hi: Math.max(lo, hi), pl, which,
        top: top == null ? -Infinity : top, bot: bot == null ? -Infinity : bot });
    };
    for (const pl of plans) {
      const la = pl.ca.line, lb = pl.cb.line;
      switch (pl.kind) {
        case 'skip': case 'back':
          if (pl.side === 'lo') seg(la + 1, 'U', pl.ps, pl.pd, pl, 'l1');
          else seg(la, 'D', pl.ps, pl.pd, pl, 'l1');
          break;
        // The hook wraps the node's LEADING corner into its -v side: reserve that
        // corner of the channel above, so no run is packed through the loop.
        case 'self': {
          const q = U.get(pl.a.index);
          seg(la, 'D', q.uL - G.selfPeak, q.uL + A(pl.a) / 3, pl, 'l1');
          break;
        }
        case 'down': seg(la + 1, 'X', pl.ps, pl.pd, pl, 'l1', pl.ps, pl.pd); break;
        case 'up': seg(la, 'X', pl.ps, pl.pd, pl, 'l1', pl.pd, pl.ps); break;
        case 'downFar':
          seg(la + 1, 'X', pl.ps, gridHi + 1, pl, 'l1', pl.ps, null);
          seg(lb, 'X', pl.pd, gridHi + 1, pl, 'l2', null, pl.pd);
          break;
        case 'upFar':
          seg(la, 'X', pl.ps, gridLo - 1, pl, 'l1', null, pl.ps);
          seg(lb + 1, 'X', pl.pd, gridLo - 1, pl, 'l2', pl.pd, null);
          break;
        default: break;
      }
    }
    const pack = (segs, clear) => {
      segs.sort((x, y) => (x.hi - x.lo) - (y.hi - y.lo) || x.lo - y.lo);
      const lanes = [];
      for (const sg of segs) {
        let i = 0;
        for (; i < lanes.length; i++) {
          if (lanes[i].every((o) => sg.lo > o.hi + clear || sg.hi < o.lo - clear)) break;
        }
        if (i === lanes.length) lanes.push([]);
        lanes[i].push(sg);
        sg.lane = i;
      }
      return lanes.length;
    };
    const clear = flowGap * 0.5;
    // THE CROSSING CHANNEL IS ORDERED, NOT JUST PACKED. Runs between two lines
    // each drop a stub from the line above and one into the line below, and which
    // run rides higher decides which stubs cross which runs: with E above F, F's
    // upper stub crosses E's run where it lies inside E's span, and E's lower stub
    // crosses F's run where it lies inside F's. So each run is inserted where it
    // costs the fewest such crossings against the runs already ordered, and runs
    // then share a lane only with runs they do not overlap — keeping the order.
    // Measured on the stress deck's incident machine: five runs crossing in one
    // channel, before this.
    const packOrdered = (segs) => {
      const inI = (x, sg) => x > sg.lo + 0.5 && x < sg.hi - 0.5;
      const cost = (e, f) => (inI(f.top, e) ? 1 : 0) + (inI(e.bot, f) ? 1 : 0);   // e above f
      const order = [];
      for (const sg of segs.slice().sort((x, y) => (x.hi - x.lo) - (y.hi - y.lo) || x.lo - y.lo)) {
        let bestAt = 0, best = Infinity;
        for (let at = 0; at <= order.length; at++) {
          let c = 0;
          for (let i = 0; i < order.length; i++) c += i < at ? cost(order[i], sg) : cost(sg, order[i]);
          if (c < best) { best = c; bestAt = at; }
        }
        order.splice(bestAt, 0, sg);
      }
      let lanes = 0;
      order.forEach((sg, i) => {
        let lane = 0;
        for (let j = 0; j < i; j++) {
          const o = order[j];
          if (!(sg.lo > o.hi + clear || sg.hi < o.lo - clear)) lane = Math.max(lane, o.lane + 1);
        }
        sg.lane = lane;
        lanes = Math.max(lanes, lane + 1);
      });
      return lanes;
    };
    // An in-line label hangs off its run on the +v side; where the line's own
    // band is too thin to hold it, the channel below has to.
    const spill = hasLabel ? Math.max(0, G.labelOff + labelAcross - Math.min(...lineC) / 2) : 0;
    const chanH = [];
    for (let c = 0; c <= nLines; c++) {
      const ch = chans[c];
      ch.nU = pack(ch.U, clear); ch.nX = packOrdered(ch.X); ch.nD = pack(ch.D, clear);
      const lanes = ch.nU + ch.nX + ch.nD;
      const top = c > 0 ? Math.max(laneGap, spill + laneGap * 0.5) : laneGap;
      ch.top = top;
      chanH.push(lanes ? top + (lanes - 1) * laneGap + laneGap : (c > 0 ? spill + G.gap : 0));
    }
    // ── v geometry ──
    const lineTop = [];
    let v = 0;
    for (let L = 0; L < nLines; L++) { v += chanH[L]; lineTop.push(v); v += lineC[L]; }
    const chanTop = (c) => (c === 0 ? 0 : lineTop[c - 1] + lineC[c - 1]);
    const laneV = (c, grp, lane) => {
      const ch = chans[c];
      const bottom = chanTop(c) + chanH[c];
      if (grp === 'D') return bottom - laneGap - lane * laneGap;
      return chanTop(c) + ch.top + (grp === 'U' ? lane : ch.nU + lane) * laneGap;
    };
    const V = (n) => {
      const L = cell.get(n.index).line;
      const vt = lineTop[L] + (lineC[L] - C(n)) / 2;
      return { vt, vb: vt + C(n), vc: vt + C(n) / 2 };
    };
    // ── side gutters, for the rare edge that jumps two lines or more ──
    const gut = { hi: [], lo: [] };
    for (let c = 0; c <= nLines; c++) {
      for (const grp of ['U', 'X', 'D']) {
        for (const sg of chans[c][grp]) sg.pl[sg.which + 'v'] = laneV(c, grp, sg.lane);
      }
    }
    for (const pl of plans) {
      if (pl.kind === 'downFar') gut.hi.push({ lo: pl.l1v, hi: pl.l2v, pl });
      if (pl.kind === 'upFar') gut.lo.push({ lo: pl.l2v, hi: pl.l1v, pl });
    }
    pack(gut.hi, laneGap * 0.5); pack(gut.lo, laneGap * 0.5);
    for (const g of gut.hi) g.pl.gu = gridHi + laneGap * (g.lane + 1);
    for (const g of gut.lo) g.pl.gu = gridLo - laneGap * (g.lane + 1);

    // ── routes ──
    const P = (u, vv) => (lr ? { x: u, y: vv } : { x: vv, y: u });
    // `selfSide` is the side the line router's hook must enter: the -v side, where
    // the lane was reserved — `top` on `lr`, `left` on `tb`.
    const out = { pos: Object.create(null), pts: new Map(), lines: nLines, dir, selfSide: lr ? 'top' : 'left' };
    for (const pl of plans) {
      const qa = U.get(pl.a.index), qb = U.get(pl.b.index);
      const va = V(pl.a), vb = V(pl.b);
      let r;
      switch (pl.kind) {
        case 'straight': r = [P(qa.uR, va.vc), P(qb.uL, vb.vc)]; break;
        case 'skip': case 'back':
          r = pl.side === 'lo'
            ? [P(pl.ps, va.vb), P(pl.ps, pl.l1v), P(pl.pd, pl.l1v), P(pl.pd, vb.vb)]
            : [P(pl.ps, va.vt), P(pl.ps, pl.l1v), P(pl.pd, pl.l1v), P(pl.pd, vb.vt)];
          break;
        case 'down': r = [P(pl.ps, va.vb), P(pl.ps, pl.l1v), P(pl.pd, pl.l1v), P(pl.pd, vb.vt)]; break;
        case 'up': r = [P(pl.ps, va.vt), P(pl.ps, pl.l1v), P(pl.pd, pl.l1v), P(pl.pd, vb.vb)]; break;
        case 'downFar':
          r = [P(pl.ps, va.vb), P(pl.ps, pl.l1v), P(pl.gu, pl.l1v), P(pl.gu, pl.l2v), P(pl.pd, pl.l2v), P(pl.pd, vb.vt)]; break;
        case 'upFar':
          r = [P(pl.ps, va.vt), P(pl.ps, pl.l1v), P(pl.gu, pl.l1v), P(pl.gu, pl.l2v), P(pl.pd, pl.l2v), P(pl.pd, vb.vb)]; break;
        default: r = null;
      }
      if (!r) continue;
      // Drop repeated vertices (a stub whose ports line up collapses to one run).
      const clean = [r[0]];
      for (let i = 1; i < r.length; i++) {
        const p0 = clean[clean.length - 1];
        if (Math.abs(r[i].x - p0.x) > 0.05 || Math.abs(r[i].y - p0.y) > 0.05) clean.push(r[i]);
      }
      if (clean.length > 1) out.pts.set(pl.t, clean);
    }
    for (const n of nodes) {
      if (!cell.has(n.index)) continue;
      const q = U.get(n.index), vv = V(n);
      out.pos[n.index] = lr ? { x: q.uL, y: vv.vt } : { x: vv.vt, y: q.uL };
    }

    // ── bounds: nodes, routes, the start marker, and the label side ──
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const n of nodes) {
      const p = out.pos[n.index];
      if (!p) continue;
      grow(p.x, p.y); grow(p.x + n.w, p.y + n.h);
      if (n.isStart) {
        if (lr) grow(p.x - G.markerGap - G.startR, p.y + n.h / 2);
        else grow(p.x + n.w / 2, p.y - G.markerGap - G.startR);
      }
    }
    for (const [, pts] of out.pts) for (const q of pts) grow(q.x, q.y);
    // A self-loop's hook reaches `selfPeak` past the node's leading corner, and its
    // one-line label sits beyond that (edgeLR / edgeTB place it; mirrored here).
    for (const pl of plans) {
      if (pl.kind !== 'self') continue;
      const p = out.pos[pl.a.index];
      if (!p) continue;
      grow(p.x - G.selfPeak, p.y - G.selfPeak);
      const half = (metrics.selfW || 0) / 2 + G.labelPad;
      if (lr) grow(p.x - G.gap - G.selfPeak * 0.2 - half, p.y - G.selfPeak * 0.7 - G.labelLine);
      else grow(p.x - G.selfPeak * 0.7 - half, p.y - G.gap - G.selfPeak * 0.2 - G.labelLine);
    }
    if (!Number.isFinite(x0)) return null;
    // Room on the label side of the far edge, so a label under the last lane (or
    // beside the last column) is inside the canvas the walk is told about.
    const pad = G.gap * 2;
    const padLabel = hasLabel ? labelAcross + G.labelOff : 0;
    const dx = pad - x0, dy = pad - y0;
    for (const k in out.pos) { out.pos[k].x += dx; out.pos[k].y += dy; }
    for (const [, pts] of out.pts) for (const q of pts) { q.x += dx; q.y += dy; }
    out.width = x1 - x0 + pad * 2 + (lr ? 0 : padLabel);
    out.height = y1 - y0 + pad * 2 + (lr ? padLabel : 0);
    return out;
  }

  // The letterbox factor a layout of `w x h` would get in the figure viewport.
  const fitK = (w, h, view) => (w > 0 && h > 0 && view.width > 0 && view.height > 0
    ? Math.min(view.width / w, view.height / h) : 0);

  // PICK BY LEGIBILITY, WITH A BIAS TOWARD THE SIMPLER PICTURE. Every candidate
  // is scored by the scale it would letterbox at — the size its type ends up —
  // and the first candidate in PREFERENCE order that comes within 12% of the
  // best one wins. The preference order is: fewer lines first, then the
  // preferred direction. So a wrap has to buy a real gain in type size to be
  // taken, and a chain that reads fine on one line stays on one line. 12% is a
  // bit over one step of the type scale; below that, a reader sees the same
  // chart either way and the single line is the plainer one.
  //
  // THE SCORE IS CAPPED AT BODY SIZE. Wrapping exists to buy back legibility, and
  // once a state's name renders as large as the slide's own body text there is
  // none left to buy: uncapped, a four-state chain folded into a 2x2 square
  // because the square letterboxed at 2.3x against the row's 1.7x — bigger, and a
  // worse picture, with a connector doubling back across the middle. Capped, every
  // candidate that already reads at body size ties, and the simplest one wins.
  // `capK` is that size as a scale — body px over the node label's natural px,
  // which is 1 today because a node inherits the body size — times CAP_OVER_BODY.
  // Measured on a 16:9 stage: a five-state row lands near 1.1 and stays a row;
  // a six-state row lands at 0.93, with most of the stage empty, and wraps 3 + 3
  // at the cap. The 20% is what lets a state name sit a step above body text,
  // the way a chart's marks outrank its caption.
  const WRAP_GAIN = 1.12;
  const CAP_OVER_BODY = 1.2;
  const MAX_OVER_BODY = 1.6;
  function pickCandidate(cands, prefDir, capK) {
    if (!cands.length) return null;
    const cap = capK > 0 ? capK : 1;
    const score = (c) => Math.min(c.k, cap);
    let best = 0;
    for (const c of cands) best = Math.max(best, score(c));
    const order = cands.slice().sort((a, b) =>
      (a.lines - b.lines) || ((a.dir === prefDir ? 0 : 1) - (b.dir === prefDir ? 0 : 1)));
    for (const c of order) if (score(c) * WRAP_GAIN >= best) return c;
    return order[0];
  }

  function draw(fig, figIndex) {
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
    // The SIZE PIN comes off with it, and for the same reason. On a re-ranked
    // machine the tail of this function pins the scale box to the drawing
    // (`geo.style.width/height`), and the box is what the hidden measuring column
    // lays out inside — so a pin left over from the PREVIOUS draw constrains the
    // node boxes this draw is about to measure. The layout then feeds its own
    // output back in, and it does not converge: measured on the `lr` incident
    // machine of `examples/state-chart-branching.md`, successive draws alternated
    // between `viewBox 1167.4 x 168.1` and `1073.5 x 154.7` FOREVER, period two —
    // so any surface that redraws (resize, `fonts.ready`, a live preview) showed
    // the chart jumping between two sizes. The metrics were identical every round;
    // it was the node measurement that moved.
    //
    // The pin is re-applied at the end of every draw that needs one, so removing
    // it here costs nothing: it is only ever read by `applyFit`, which runs after.
    if (geo !== fig) {
      geo.style.transform = 'translate(-50%, -50%)';
      geo.style.removeProperty('width');
      geo.style.removeProperty('height');
    }
    // The measuring column comes back into layout for this draw (see the pin at
    // the end). Synchronous with the measurement, so no frame ever paints it.
    if (typeof fig.removeAttribute === 'function') fig.removeAttribute('data-sc-pinned');

    // `let`: a figure may be DRAWN in another direction than the one its measuring
    // column is laid out in (see the candidate pick below). Every routing decision
    // after that pick reads this, never the attribute.
    let dir = fig.getAttribute('data-sc-dir') === 'lr' ? 'lr' : 'tb';
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
    // Whether any node was dropped for want of a finite rect — see the note in
    // `dagrePositions`, which declines to re-rank when one was.
    let droppedNode = false;
    for (let k = 0; k < nodeEls.length; k++) {
      const el = nodeEls[k];
      const r = rectL(el);
      // A NON-FINITE RECT POISONS EVERY COORDINATE DOWNSTREAM. `figRect` is
      // finite, so an all-`NaN` node rect does not trip the canvas guard below —
      // it produces a valid `viewBox` full of NaN path data instead, which paints
      // nothing at all. Drop the node: the figure still draws, minus a state that
      // had no geometry to draw with.
      if (!Number.isFinite(r.left) || !Number.isFinite(r.top)
        || !Number.isFinite(r.width) || !Number.isFinite(r.height)) { droppedNode = true; continue; }
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

    // Re-rank a BRANCHING machine. Applied here — after the boxes are measured
    // AND after the synthetic final node is placed, so that node is handed to
    // dagre like any other sink and ranked with everything else, rather than
    // being dropped below whichever node had the highest index. (This comment
    // used to say "before the synthetic final node is placed"; the block above
    // plainly runs first. The behavior was always the intended one — dagre
    // re-places the node — but the ordering statement was backwards.)
    // The widest event label on this machine, measured in the font that will
    // actually render it (makeLabelW reads --font-label from live CSS) — the same
    // coupling the label-box reservation has: dagre trusts the extent it is given.
    // Wrap long labels BEFORE measuring, so the numbers fed to dagre describe the
    // text as it will actually be drawn. The budget is generous on the axis the
    // label sits along and is only a wrapping hint — the clearance floor below is
    // what guarantees the result fits.
    // THE WRAP BUDGET FOLLOWS THE CHEAP AXIS, and it differs per direction for
    // the same reason the clearance does.
    //
    //   LR — the label sits UNDER a horizontal run and has to fit inside it, so
    //        the budget is tied to that run: wrapping is what keeps it in bounds.
    //   TB — the label sits BESIDE a vertical run, running out into the cross
    //        axis, which is the axis a 16:9 stage has to spare. Wrapping it
    //        narrowly there converts width into HEIGHT (more lines, and the rank
    //        gap has to clear a centered label), which is exactly the vertical
    //        space this layout is trying to keep. So TB wraps late.
    const labelMetrics = (d) => {
      const wrapBudget = d === 'lr' ? G.gapFloorLr * 2.4 : G.gapFloorLr * 5;
      const wrapped = [];
      let maxW = 0, maxLines = 1, selfW = 0;
      for (const t of transitions) {
        if (!t.event) continue;
        // A SELF-LOOP's label is placed by the hook router as ONE line, so it is
        // never wrapped — wrapped, the second line hung off its own hook and past
        // the canvas edge. Its width is kept apart so the grid can reserve it.
        if (t.isSelf || t.from === t.to) { selfW = Math.max(selfW, measure(t.event)); continue; }
        const w = wrapEventLabel(t.event, wrapBudget, measure);
        wrapped.push([t, w]);
        const lines = w.split('\n');
        maxLines = Math.max(maxLines, lines.length);
        for (const ln of lines) maxW = Math.max(maxW, measure(ln));
      }
      return { wrapped, m: { maxW: Math.max(maxW, G.extentTb), maxLines, selfW } };
    };
    let lm = labelMetrics(dir);
    let wrapped = lm.wrapped;
    let dagreMetrics = lm.m;
    let dagreLayout = dagrePositions(nodes, transitions, dir, dagreMetrics, 1, droppedNode);

    // ── FIT-DRIVEN DIRECTION AND WRAP ─────────────────────────────────────────
    // Which way the machine runs, and on how many lines, is chosen by which
    // candidate sets the type largest in THIS figure's viewport (`pickCandidate`).
    // An `lr` or `tb` modifier pins the direction and leaves the line count free;
    // with neither (`data-sc-fit="auto"`) both directions compete, and the stage's
    // own aspect sets the tie-break — a landscape stage prefers a row.
    //
    // A branching machine is re-ranked by dagre, which cannot wrap, so there the
    // choice is the direction only. A chain is scored with `gridLayout` at every
    // line count and drawn from the winner's routes, whatever its line count.
    const fitAuto = fig.getAttribute('data-sc-fit') === 'auto';
    const view = typeof fig.getBoundingClientRect === 'function' ? rectL(fig) : figRect;
    const prefDir = fitAuto ? (view.width >= view.height ? 'lr' : 'tb') : dir;
    const dirs = fitAuto ? ['lr', 'tb'] : [dir];
    const hasSelfLoop = transitions.some((t) => t.isSelf || t.from === t.to);
    let capK = CAP_OVER_BODY;
    try {
      const lab = fig.querySelector('.state-label');
      const secEl = typeof fig.closest === 'function' ? fig.closest('section') : null;
      if (lab && secEl && typeof getComputedStyle === 'function') {
        const f0 = parseFloat(getComputedStyle(lab).fontSize);
        const body = parseFloat(getComputedStyle(secEl).fontSize);
        if (f0 > 0 && body > 0) capK = Math.max(1, body / f0) * CAP_OVER_BODY;
      }
    } catch (_e) { /* synthetic DOM — the natural size stands in */ }
    // dagre's box plus the pads the positioning block adds below, so a dagre
    // candidate is scored on the canvas it will actually get.
    const dagreCanvas = (L, d) => {
      const padStart = G.markerGap + G.startR + G.gap;
      const padCross = (hasSelfLoop ? G.selfPeak + G.gap : G.gap) * 2;
      return d === 'lr'
        ? { w: L.width + padStart + G.gap, h: L.height + padCross }
        : { w: L.width + padCross, h: L.height + padStart + G.gap };
    };
    // ── LABELS PAINT AT THEIR POST-LETTERBOX SIZE, so they are laid out at it ──
    // An edge label's CSS size is `max(var(--chart-text-min), 0.859375cqi)`, and
    // applyFit raises `--chart-text-min` by 1/k when it shrinks the figure — that is
    // what keeps a label legible on a scaled-down chart. So in the drawing's own
    // units a label is 1/k times the 11px every gap was budgeted for, and on any
    // layout that letterboxes below 1 the labels outgrew their room: over nodes on
    // the feature deck's `tb` slide, past the canvas on a 30-state machine
    // (CONTENT CLIPPED), across their own lines on the branching deck. The label
    // geometry — the metrics fed to the layout, the line box, the pad, the offset,
    // the margin — is therefore scaled by the size the label will actually paint
    // at, per candidate, from that candidate's own k. One re-layout is enough to
    // settle it (a second moves k by well under the 12% the pick cares about).
    let textMinBase = 11;
    try {
      const declared = parseFloat(getComputedStyle(fig).getPropertyValue('--chart-text-min'));
      if (Number.isFinite(declared) && declared > 0) textMinBase = declared;
    } catch (_e) { /* synthetic DOM — the 11px default stands */ }
    const labelScaleFor = (k) => (k > 0 ? Math.min(3, Math.max(1, textMinBase / (k * 11 * S))) : 1);
    const LABEL_BASE = { labelLine: G.labelLine, labelPad: G.labelPad, labelOff: G.labelOff, labelMargin: G.labelMargin };
    const setLabelScale = (ls) => { for (const key in LABEL_BASE) G[key] = LABEL_BASE[key] * ls; };
    const scaled = (m, ls) => ({ maxW: m.maxW * ls, maxLines: m.maxLines, selfW: (m.selfW || 0) * ls });
    // Lay a candidate out, then again at the label size its own k implies.
    const settle = (make, size) => {
      setLabelScale(1);
      let L = make(1);
      if (!L) return null;
      let k = fitK(size(L).w, size(L).h, view);
      let ls = 1;
      const want = labelScaleFor(k);
      if (want > 1.01) {
        setLabelScale(want);
        const L2 = make(want);
        if (L2) { L = L2; ls = want; k = fitK(size(L2).w, size(L2).h, view); }
      }
      setLabelScale(1);
      return { L, k, ls };
    };
    const gridSize = (g) => ({ w: g.width, h: g.height });
    let gridSel = null;
    let labelScale = 1;
    paintK = 1;
    if (view.width > 0 && view.height > 0 && !droppedNode) {
      const cands = [];
      const real = nodes.filter((nd) => !nd.isFinal).length;
      const maxLines = Math.min(6, Math.floor(real / 2));
      for (const d of dirs) {
        const dm = d === dir ? lm : labelMetrics(d);
        if (dagreLayout) {
          // A branching machine: dagre in each allowed direction, AND the grid's
          // wrapped layouts. dagre cannot wrap, so a long pipeline with one small
          // fork (the stress deck's ten-step pipeline) sat on a single row at a
          // fraction of body size. The grid draws a branch as a skip rather than
          // as parallel ranks, which is a weaker picture of a fan-out, so dagre
          // goes first in the preference order and a wrap has to earn its place
          // by the same margin as any other wrap.
          const r = settle((ls) => dagrePositions(nodes, transitions, d, scaled(dm.m, ls), 1, droppedNode),
            (L) => dagreCanvas(L, d));
          if (r) cands.push({ dir: d, lines: 1, k: r.k, L: r.L, ls: r.ls, dm });
        }
        // EVERY chain is drawn from the grid, one line included. A single line
        // used to go to the column router, which draws its labels ON the line
        // under a halo — while a wrapped chain, and a dagre machine, draw them
        // BESIDE it. Three label styles in one component, switching between two
        // of them at an arbitrary state count. One producer, one look. The column
        // router still draws self-loop hooks, and any figure the grid declines.
        for (let Ln = dagreLayout ? 2 : 1; Ln <= Math.max(1, maxLines); Ln++) {
          const r = settle((ls) => gridLayout(nodes, transitions, d, Ln, scaled(dm.m, ls)), gridSize);
          if (r) cands.push({ dir: d, lines: r.L.lines, k: r.k, g: r.L, ls: r.ls, dm });
        }
      }
      // HYSTERESIS ON A REDRAW. The pick is a race on k, and k moves with things an
      // author never connects to the chart's shape — a webfont landing after the
      // first draw, a resize. So a redraw keeps the layout it drew last unless
      // that layout is no longer available or has fallen more than 25% behind the
      // best one; a first draw has nothing to keep.
      let pick = pickCandidate(cands, prefDir, capK);
      const prev = fig.__scPick;
      if (pick && prev) {
        const same = cands.find((c) => c.dir === prev.dir && c.lines === prev.lines && Boolean(c.g) === prev.grid);
        const score = (c) => Math.min(c.k, capK);
        if (same && score(same) * 1.25 >= score(pick)) pick = same;
      }
      if (pick) {
        paintK = pick.k > 0 ? pick.k : 1;
        fig.__scPick = { dir: pick.dir, lines: pick.lines, grid: Boolean(pick.g) };
        dir = pick.dir; lm = pick.dm; wrapped = lm.wrapped;
        labelScale = pick.ls || 1;
        dagreMetrics = scaled(lm.m, labelScale);
        if (pick.g) { gridSel = pick.g; dagreLayout = null; } else { dagreLayout = pick.L; }
      }
    }
    // The label geometry stays at the chosen scale for the rest of this draw: the
    // label boxes the walk tests, the line box `edgeLabel` spaces tspans by, and
    // dagre's stretch re-layouts below all have to agree with the painted size.
    setLabelScale(labelScale);
    // WHICH PRODUCER DREW THIS, stamped rather than inferred. The export gate's test
    // used to infer "re-ranked" from painted boxes leaving their CSS rects, which
    // stopped meaning anything once the grid moved every chain. `data-sc-lines` is
    // the line count the pick settled on (1 = no wrap), for the same readers.
    if (typeof fig.setAttribute === 'function') {
      fig.setAttribute('data-sc-layout', dagreLayout ? 'dagre' : (gridSel ? 'grid' : 'column'));
      fig.setAttribute('data-sc-flow', dir);
      if (gridSel) fig.setAttribute('data-sc-lines', String(gridSel.lines));
      else if (typeof fig.removeAttribute === 'function') fig.removeAttribute('data-sc-lines');
    }
    // An AUTHORED break (`\n`, `<br/>`) is untouched either way — it is an explicit
    // request, normalized at parse time, and it renders on both paths.
    if (dagreLayout || gridSel) {
      for (const [t, w] of wrapped) t.event = w;
      // The label's own rendered WIDTH, measured in the font that will draw it
      // (the §5.1 coupling: `makeLabelW` reads `--font-label` from live CSS).
      // Stashed on the transition beside `_pts` because `edgeDagre` runs outside
      // this closure and `measure` is per-figure — and because the collision walk
      // needs a real extent, not the machine-wide `maxW` every label would share.
      for (const [t] of wrapped) {
        let lw = 0;
        for (const ln of String(t.event).split('\n')) lw = Math.max(lw, measure(ln));
        t._lw = lw * labelScale;
      }
    }
    if (dagreLayout && figRect.width > 0 && figRect.height > 0) {
      // RESPONSIVE EDGE LENGTH. A TB machine should fill the stage's HEIGHT and
      // let its width follow; an LR machine should fill the WIDTH. `applyFit`
      // letterboxes by whichever axis binds, so which axis that is comes down to
      // the DRAWING's aspect against the stage's — an LR machine narrower than
      // the stage binds on height and stops at 86% of the width.
      //
      // Solved, not guessed: the rank gap is one term of the total extent
      // (`extent = fixed + nRanks * ranksep`), so a naive `want/got` multiplier
      // moves it barely at all — measured, 86% -> 88%. Two samples give the line
      // and the target inverts exactly.
      //
      // Only the rank axis stretches, and only UPWARD. The cross axis carries the
      // label clearance, and shrinking either is what lets a label touch a node.
      const lrFlow2 = dir === 'lr';
      // The target aspect comes from the FIGURE VIEWPORT, never from `figRect`.
      // `figRect` is the scale box, and this pass PINS that box to the drawing —
      // so reading the target from it makes draw() feed its own previous output
      // back in on the next run (fonts.ready, resize), and the layout walks away
      // from the stage a little further each time. Measured: a TB machine went
      // 46% -> 24% of the width across re-draws before this was pinned to the
      // viewport, which does not move.
      const viewRect = typeof fig.getBoundingClientRect === 'function' ? rectL(fig) : figRect;
      const want = viewRect.height > 0 ? viewRect.width / viewRect.height
        : figRect.width / figRect.height;
      const aspect = (L) => L.width / L.height;
      const needsMore = lrFlow2 ? aspect(dagreLayout) < want : aspect(dagreLayout) > want;
      if (needsMore) {
        const probe = dagrePositions(nodes, transitions, dir, dagreMetrics, 2, droppedNode);
        if (probe) {
          // extent(s) = a + b*s along the rank axis; the cross axis is unchanged
          // by ranksep, so it is a constant here.
          const e1 = lrFlow2 ? dagreLayout.width : dagreLayout.height;
          const e2 = lrFlow2 ? probe.width : probe.height;
          const cross = lrFlow2 ? dagreLayout.height : dagreLayout.width;
          const b = e2 - e1, a = e1 - b;
          const target = lrFlow2 ? want * cross : cross / want;
          const solved = b > 0 ? (target - a) / b : 1;
          // Bounded: unbounded, a two-state machine becomes a pair of boxes at
          // opposite ends of the slide joined by one very long arrow.
          const stretch = Math.max(1, Math.min(solved, 4));
          if (stretch > 1.02) {
            const retry = dagrePositions(nodes, transitions, dir, dagreMetrics, stretch, droppedNode);
            if (retry) dagreLayout = retry;
          }
        }
      }
    }
    let canvasW = figRect.width, canvasH = figRect.height;
    if (dagreLayout) {
      // Centre the laid-out graph in the figure box. dagre works from its own
      // origin, and dropping it at 0,0 would pin a branching machine to the
      // top-left of a stage the column used to sit centered in.
      // THE PAD MUST CLEAR WHAT THE ROUTERS DRAW OUTSIDE DAGRE'S BOUNDS, and that
      // is a lot more than a hairline. dagre's box contains node rects and edge
      // polylines only. The start marker is painted `markerGap` (40) beyond the
      // first node with radius `startR` (6), and a self-loop's apex reaches
      // `selfPeak` (30) off the node's side — none of which dagre knows about.
      //
      // A flat `G.gap` (5) pad put the start disc at cy = -35 on every re-ranked
      // figure: entirely outside the viewBox, clipped by the ancestor, and loud
      // enough that the engine's own CONTENT CLIPPED gate fired on a shipped PDF.
      // The CSS already reserves exactly this room for the column layout
      // (`.state-nodes { padding: max(4.375cqi, 50px) }`); the dagre path bypassed
      // that reservation and re-created the bug the CSS comment records.
      //
      // Directional, not uniform: padding all four sides by the largest extent
      // would shrink the fit for clearance only one side needs.
      const padStart = G.markerGap + G.startR + G.gap;
      const hasSelf = transitions.some((t) => t.isSelf || t.from === t.to);
      const padCross = hasSelf ? G.selfPeak + G.gap : G.gap;
      const padEnd = G.gap;
      const lrFlow = dir === 'lr';
      const offX = lrFlow ? padStart : padCross;
      const offY = lrFlow ? padCross : padStart;
      const endX = lrFlow ? padEnd : padCross;
      const endY = lrFlow ? padCross : padEnd;
      for (const n of nodes) {
        const p = dagreLayout.pos[n.index];
        if (p) { n.x = p.x + offX; n.y = p.y + offY; }
      }
      // Ride the routed polyline on the transition, in the same figure-space
      // coordinates the nodes now use. A self-loop has no dagre route and keeps
      // `_pts` undefined, so it falls through to the existing router.
      for (const t of transitions) {
        const pts = dagreLayout.pts[dagreLayout.name.get(t)];
        if (pts) t._pts = pts.map((q) => ({ x: q.x + offX, y: q.y + offY }));
      }
      // TIGHT content bounds, deliberately NOT max()'d with the measured column.
      // `.state-chart-scale` is `width: fit-content` sized by the hidden column,
      // and `.state-chart-edges` fills it at the SVG default `xMidYMid meet` — so
      // a wide canvas declared inside a narrow tall element box gets letterboxed
      // down to a quarter of the stage, which is exactly what a max() left. Giving
      // the box the drawing's own dimensions makes `meet` a no-op and hands the
      // scaling to applyFit, where it belongs.
      canvasW = dagreLayout.width + offX + endX;
      canvasH = dagreLayout.height + offY + endY;
    } else if (gridSel) {
      // The grid lays out in its own canvas, markers and label room included.
      for (const n of nodes) {
        const p = gridSel.pos[n.index];
        if (p) { n.x = p.x; n.y = p.y; }
      }
      for (const t of transitions) {
        const pts = gridSel.pts.get(t);
        if (pts) {
          t._pts = pts.map((q) => ({ x: q.x, y: q.y }));
          t._orth = true;
          // The label's HOME is the middle of the route's LONGEST RUN, and it sits
          // beside that run the way every label does — below a horizontal one, to
          // the right of a vertical one. Not the polyline's arc-length midpoint:
          // on a long orthogonal route that can fall on a stub and set the label
          // adrift between two other runs (`regression` did). And not the longest
          // run in the flow direction alone: a route between two stacked states
          // is nearly all vertical, and anchoring on its few-pixel jog laid
          // `block` and `unblock` across their own lines. On a grid route every
          // segment is axis-aligned, so "longest run" is exact; the diagonal case
          // the dagre note warns about cannot arise here.
          let best = -1;
          for (let i = 1; i < t._pts.length; i++) {
            const a = t._pts[i - 1], b = t._pts[i];
            const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
            if (len > best + 0.5) {
              best = len;
              t._anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              t._anchorDir = Math.abs(b.y - a.y) < 0.5 ? 'lr' : 'tb';
            }
          }
        }
      }
      canvasW = gridSel.width;
      canvasH = gridSel.height;
    }

    // A DEGENERATE NODE BOX MUST NOT REACH THE CANVAS. Every dimension here comes
    // from `getBoundingClientRect` on elements the pass found in the document, and
    // a `.state-node` with a `0x0`, negative or non-finite rect propagates
    // straight through the arithmetic: measured, a zero-size node emitted
    // `viewBox="0 0 47.8 NaN"` and path data reading `M 23.9 NaN`, which makes the
    // browser discard the viewBox and render the whole overlay as nothing. On
    // `origin/main` the same input produced a valid canvas, so this is new with
    // the dagre path.
    //
    // It is not reachable from authored markdown — the CSS gives every node a box,
    // and an all-zero figure is caught by the `figRect` guard upstream — but it IS
    // reachable through the same raw-inline-HTML door as the tint injection above,
    // and "not reachable today" is not a property this pass should depend on when
    // the fix is one guard. Bailing leaves the CSS column visible, which is the
    // same degradation as an absent dagre.
    if (!Number.isFinite(canvasW) || !Number.isFinite(canvasH) || canvasW <= 0 || canvasH <= 0) return;
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
    // On a wrapped chain the lane above each line was reserved for the hook, so
    // the hook has to go there, whatever the column router's balancing preferred.
    if (gridSel) for (const t of transitions) if (t.isSelf || t.from === t.to) t._selfSide = gridSel.selfSide;
    // Distinct state tints, in first-appearance order, so the defs block is
    // deterministic (a Set's insertion order) rather than dependent on hash order.
    const nodeTints = [];
    for (let i = 0; i < nodeEls.length; i++) {
      const tv = tintToken(typeof nodeEls[i].getAttribute === 'function' ? nodeEls[i].getAttribute('data-tint') : null);
      if (tv && nodeTints.indexOf(tv) < 0) nodeTints.push(tv);
    }
    const nodeTones = [];
    for (let i = 0; i < nodeEls.length; i++) {
      const tn = toneOf(typeof nodeEls[i].getAttribute === 'function' ? nodeEls[i].getAttribute('data-s') : null);
      if (tn && nodeTones.indexOf(tn) < 0) nodeTones.push(tn);
    }
    const parts = [nodeFillDefs(nodeTints, figIndex, nodeTones)];
    // Nodes first, then connectors: document order is the motion build order, so
    // a state machine assembles its states and then draws the arrows between
    // them — which is how a reader follows it.
    for (let k = 0; k < nodeEls.length; k++) {
      const n = byIndex[parseInt(nodeEls[k].getAttribute('data-index'), 10)];
      if (n) parts.push(nodeShape(n, nodeEls[k], figRect));
    }
    nodes.forEach((n) => { if (n.isStart) parts.push(startMarker(n, dir)); });
    // Edge labels are placed against the boxes they must not touch: every node
    // (including the synthetic exit, which is a painted disc like any other) and
    // every label already emitted. Built ONCE and threaded through, because the
    // label-vs-label half is order-dependent — each placement has to see the ones
    // before it. Only the dagre path consults it; the column router's labels sit
    // on the line under a halo and have their own geometry.
    const labelCtx = {
      boxes: nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
      placed: [],
      // The canvas the walk must stay inside. Only meaningful on the dagre path:
      // canvasW/H are the drawing's own bounds there, whereas the column router
      // measures against the CSS column and has its own label geometry.
      canvas: (dagreLayout || gridSel) ? { w: canvasW, h: canvasH } : null,
      segs: gridSel ? transitions.flatMap((t) => (t._pts || []).slice(1).map((q, i) => ({
        owner: t, x0: t._pts[i].x, y0: t._pts[i].y, x1: q.x, y1: q.y,
      }))) : null,
    };
    transitions.forEach((t) => { parts.push(edge(t, byIndex, dir, style, labelCtx)); });
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
    // WRITE ONLY WHAT CHANGED. An identical `innerHTML` assignment still replaces
    // every child, and the runtime's body-wide childList observer answers any child
    // replacement with a full content pass — which calls this again. Skipping the
    // no-op write is what lets that cycle settle after one lap instead of spinning
    // (see labelLines for the other half, and the measurement).
    const paint = keep + parts.join('');
    if (svg.__scPaint !== paint) {
      svg.innerHTML = paint;
      svg.__scPaint = paint;
    }
    // The geometry is also hidden from the accessibility tree, because
    // `role="img"` does not prune it (cartesian.js § ariaHiddenMarks) — without
    // this a reader hears the curated <desc> and then walks every state name and
    // edge label again as loose text.
    //
    // MARKED IN PLACE RATHER THAN WRAPPED, unlike every other member. The shared
    // helper puts the marks inside one `<g aria-hidden>`, and here that extra
    // element moves the drawing: `check:chart-fit` went red at square with the
    // machine painting 40px outside its stage on both sides, reproducibly, twice
    // on each arm. This chart is the family's one runtime-laid-out member — it
    // measures the document it just wrote and scales itself to fit — so a node
    // that is free everywhere else is not free here. Setting the attribute on
    // the children it already has changes nothing about the layout and prunes
    // exactly the same subtree. `<title>`/`<desc>` are skipped so the root keeps
    // its accessible name.
    // GUARDED, like `fig.setAttribute` a few lines down: draw() also runs against
    // the synthetic DOM the kernel's own tests build, which has no `children`.
    // Unguarded this threw `svg.children is not iterable` and took 72 arms with
    // it — the a11y pass is a decoration on the render, and must never be the
    // reason the render fails.
    for (const el of (svg.children ? [...svg.children] : [])) {
      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'title' || tag === 'desc') continue;
      if (typeof el.setAttribute === 'function') el.setAttribute('aria-hidden', 'true');
    }
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
    // PINNED LAST, after every node and label is painted. Setting an inline size
    // on the scale box REFLOWS the hidden measuring column, which moves the very
    // `.state-index` / `.state-label` rects `nodeShape` reads through `rectL` —
    // while `n.mx`/`n.my` still describe the pre-pin layout. Pinning before the
    // paint therefore shifted every node's text out of its box by the reflow
    // delta (measured: labels ~20px above centre on a machine whose column had
    // wrapped a label). Nothing between here and the paint needs the pin; only
    // applyFit does.
    // The scale box normally takes its size from the hidden column. A re-ranked
    // machine is a different shape, so the box is pinned to the drawing and the
    // pin is REMOVED again when dagre is not in play — draw() re-runs on resize
    // and font load, and a stale inline size would outlive the layout it was for.
    if (geo?.style) {
      if (dagreLayout || gridSel) {
        geo.style.width = canvasW.toFixed(1) + 'px';
        geo.style.height = canvasH.toFixed(1) + 'px';
        // …and the hidden measuring column leaves layout while the pin holds. A
        // machine drawn as a wide row keeps a measuring column TALLER than the
        // drawing, and `visibility: hidden` still occupies that box — so the last
        // states' hidden numerals hung past the stage and the export reported
        // "CONTENT CLIPPED, first cut '6'" for text no reader sees. The next draw
        // lifts this before it measures (above).
        if (typeof fig.setAttribute === 'function') fig.setAttribute('data-sc-pinned', '1');
      } else {
        geo.style.removeProperty('width');
        geo.style.removeProperty('height');
      }
    }


    // Fit against the DAGRE canvas when there is one. `figRect` is the measured
    // HTML column, and on a re-ranked machine the drawing is wider and shorter
    // than that column — fitting to the column scales a fan-out as though it
    // were still a narrow stack, which is what left it stranded at a quarter of
    // the stage.
    //
    // THE UPSCALE HAS A CEILING: a state name never letterboxes past
    // MAX_OVER_BODY times the slide's body text. Uncapped, a three-state machine
    // grew its names to 48px (2.2x body) and a portrait five-state column to about
    // 2.5x — boxes that read as a poster, not a diagram. The shrink direction is
    // untouched; the ceiling only stops a small machine being blown up to fill a
    // stage it does not need.
    applyFit(fig, geo, (canvasW !== figRect.width || canvasH !== figRect.height)
      ? { width: canvasW, height: canvasH }
      : figRect, (capK / CAP_OVER_BODY) * MAX_OVER_BODY);
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

  function drawAll(freshOnly) {
    const figs = doc.querySelectorAll('.state-chart-figure[data-sc-transitions]');
    for (let i = 0; i < figs.length; i++) {
      // The figure's INDEX stays its position in the full list either way — it
      // names the figure's gradient ids, which must not depend on who is drawn.
      if (freshOnly && typeof figs[i].getAttribute === 'function' && figs[i].getAttribute('data-sc-svg')) continue;
      draw(figs[i], i);
    }
    if (freshOnly) return;
    // Every OTHER state-chart figure — today only the inline variant — still owns a
    // scale box that wants letterboxing. Selected by the absence of the edge payload
    // rather than by variant name, so a future presentation that draws no SVG is fit
    // by construction instead of being silently left out the way inline was (#1360).
    const plain = doc.querySelectorAll('.state-chart-figure:not([data-sc-transitions])');
    for (let i = 0; i < plain.length; i++) fitOnly(plain[i]);
  }

  // Every figure in the document is observed, including the ones a live edit
  // inserts after install. This used to observe the figures present at the FIRST
  // call only, so a figure the host swapped in later was never observed. Its first
  // draw came from the old figure's resize (it collapsed when it was removed),
  // two frames late. For those two frames the raw measuring column showed,
  // and then the chart snapped into place. `observe()` on an element it already
  // watches is a no-op, so this is safe to run on every call.
  function observeAll() {
    const ro = doc.__scResizeObserver;
    if (!ro) return;
    const figs = doc.querySelectorAll('.state-chart-figure');
    for (let j = 0; j < figs.length; j++) ro.observe(figs[j]);
  }

  // Always redraw on call (content may have changed). Attach the one-shot
  // listeners and observers only once per document — the runtime invokes
  // this on every transform pass, so re-attaching would leak observers.
  drawAll(onlyFresh);
  if (doc.__scLayoutInstalled) { observeAll(); return; }
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
    doc.__scResizeObserver = new ResizeObserver(() => { scheduleDrawAll(); });
    observeAll();
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
  // deck force `tb` over an `lr` pin that can't fit a tall box (§buildStateChart).
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
