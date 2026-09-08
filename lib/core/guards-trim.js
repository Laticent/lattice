/**
 * guards-trim — TRIM, the fifth Fit-Ladder move: when a box overflows, cut the
 * text that does not fit and leave a visible ellipsis, instead of shearing it.
 *
 * The design record is `engineering/decisions/2026-09-07-overflow-guards-trim.md`.
 * Read §2a, §3 and §4 before changing anything here: six review passes on that
 * note retracted a load-bearing claim each, and every rule below exists because
 * a prototype without it destroyed content on a real deck.
 *
 * ── WHY THIS FILE IS SHAPED AS MEASURE -> DECIDE -> APPLY ───────────────────
 *
 * The investigation's numbers all came from ad-hoc browser scripts, and several
 * were wrong in the flattering direction — a detector that asked whether a
 * clamped element's content exceeds its box (true of every trim) reported zero
 * failures where there were nineteen. Nothing about that is a browser problem;
 * it is that the DECISION was never separable from the measurement, so it could
 * not be tested without re-running the thing under test.
 *
 * So the policy is a pure function over a plain data model:
 *
 *   measureTrim(section)  ->  model    (DOM in, numbers out; needs layout)
 *   planTrim(model)       ->  plan     (PURE — no DOM, no globals, no clock)
 *   applyTrim(plan, ...)  ->  record   (numbers in, DOM out)
 *
 * `planTrim` is where every rule lives, and it is exercised by generated models
 * in `test/unit/core/guards-trim.metamorphic.test.js` at unit speed. The browser
 * tier then only has to establish that `measureTrim` reports the box faithfully
 * and `applyTrim` does what the plan says — two much smaller claims.
 *
 * ── THE RULES, AND THE DEFECT EACH ONE PREVENTS ─────────────────────────────
 *
 *   1. ONLY A TEXT BLOCK IS EVER TRIMMED (§4a). A prototype clamped the `<ul>`
 *      that WAS the cards grid; `display:-webkit-box` replaced `display:grid`
 *      and a four-up grid collapsed into one column.
 *   2. ONLY THE INNERMOST BLOCK (§4b). Clamping a box whose children are blocks
 *      clips geometrically and draws NO ellipsis — the mark is placed on the
 *      clamped box's own last line box, and such a box has none.
 *   3. ONLY A `trim`-CLASSED ROLE (§6). An ellipsis on a sentence says "there is
 *      more"; on a KPI value, a citation, a formula or a line of code it states
 *      something false. An unclassified role is `never`, so the guard does less
 *      rather than something wrong.
 *   4. THE MARK MUST BE VISIBLE, OR DECLINE (§4d). A block sitting wholly below
 *      the box's bottom can be clamped into perfect invisibility: content gone,
 *      ellipsis off-screen, slide looks finished. Nineteen of eighty-one
 *      stressed gallery slides did exactly that. There is no reach-back and no
 *      `display: none` here — dropping an element is how the earlier prototype
 *      deleted 82 elements, including chart labels, with no mark and no alarm.
 *   5. FIT OR CHANGE NOTHING (§2a). A plan that does not achieve fit is
 *      DISCARDED whole. Half-trimming destroys content and still leaves the
 *      overflow ring on — measured at 46 of 98 touched slides. Trimming is only
 *      worth its cost if it actually buys the fit.
 *   6. THE PLAN CARRIES ITS OWN RECORD. The existing `probeContentClipped` sees
 *      a CLAMP (the lines still lay out, so Range rects exist) and is BLIND to
 *      anything removed from layout. TRIM therefore cannot inherit the alarm; it
 *      reports what it cut, and the marker and `overflow:check` read that.
 */

/** Layout-px slack before a box counts as overflowing. Matches the overflow probe. */
const TRIM_TOLERANCE = 12;

/**
 * Trim classes (§6). The default for an unlisted role is `never`, deliberately:
 * the cost of trimming something that must not be trimmed is a false statement on
 * a boardroom slide, and the cost of not trimming is a slide that clips visibly
 * and rings. Those are not symmetric.
 */
const TRIM_CLASSES = Object.freeze(['trim', 'never']);
const DEFAULT_TRIM_CLASS = 'never';

/**
 * Role -> trim class. Roles are assigned by the measurer from the DOM; keeping the
 * table here (not in the measurer) means both render paths and the tests share one
 * answer to "may this be cut?" (HARD RULE #1).
 */
const ROLE_TRIM_CLASS = Object.freeze({
  prose: 'trim',
  'list-item': 'trim',
  caption: 'trim',
  note: 'trim',
  // Everything below states a fact that truncation would falsify.
  heading: 'never',
  value: 'never',
  label: 'never',
  code: 'never',
  math: 'never',
  legal: 'never',
  citation: 'never',
  attribution: 'never',
  footer: 'never',
});

/** The trim class for a role, defaulting closed. */
function trimClassOf(role) {
  return  Object.hasOwn(ROLE_TRIM_CLASS, role)
    ? ROLE_TRIM_CLASS[role]
    : DEFAULT_TRIM_CLASS;
}

/**
 * Decide what to cut. PURE: no DOM, no globals, no time, no randomness. The same
 * model always yields the same plan, which is what makes the relation tests
 * meaningful.
 *
 * @param {object} model
 *   `{ boxes: [{ id, limit, contentBottom, blocks: [{ id, role, top, bottom,
 *      lineHeight, padBottom, chars }] }] }`
 *   All lengths are LAYOUT px in one coordinate space. `limit` is the box's
 *   content bottom edge; `contentBottom` is where its content actually reaches.
 * @param {object} [opts] `{ tolerance }`
 * @returns {object} `{ actions, declines, fits }` — `actions` is the ordered list
 *   of `{ boxId, blockId, lines, linesBefore, charsKept }` clamps to apply.
 */
function planTrim(model, opts) {
  const tolerance = opts && Number.isFinite(opts.tolerance) ? opts.tolerance : TRIM_TOLERANCE;
  const actions = [];
  const declines = [];
  const fits = [];
  const boxes = (model && Array.isArray(model.boxes) ? model.boxes : []);

  for (const box of boxes) {
    const over = box.contentBottom - box.limit;
    if (!(over > tolerance)) continue;                      // already fits: rule 5's base case

    const planned = planBox(box, tolerance);
    if (planned.fitted) {
      for (const a of planned.actions) actions.push(a);
      fits.push(box.id);
    } else {
      // RULE 5 — fit or change nothing. Discard the whole plan for this box.
      declines.push({ boxId: box.id, reason: planned.reason, discarded: planned.actions.length });
    }
  }
  return { actions, declines, fits };
}

/**
 * Plan one box. Simulates the reflow the clamps would cause so the decision is
 * made against the geometry the reader will actually get, not the pre-trim one.
 */
function planBox(box, tolerance) {
  const blocks = (Array.isArray(box.blocks) ? box.blocks : [])
    .slice()
    .sort((a, b) => a.top - b.top);
  const actions = [];
  let shift = 0;                 // height already recovered by clamps above
  let bottom = box.contentBottom;

  for (let guard = 0; guard < blocks.length + 1; guard++) {
    if (bottom - shift - box.limit <= tolerance) {
      return { fitted: true, actions };
    }
    const next = blocks.find((b) => !actions.some((a) => a.blockId === b.id)
      && (b.bottom - shift) > box.limit + 1);
    if (!next) return { fitted: false, reason: 'nothing-left-to-cut', actions };

    // RULE 3 — role gate. A `never` block is not a candidate and never becomes one.
    if (trimClassOf(next.role) !== 'trim') {
      return { fitted: false, reason: 'blocked-by-' + next.role, actions };
    }

    const top = next.top - shift;
    const lh = next.lineHeight > 0 ? next.lineHeight : 0;
    if (!(lh > 0)) return { fitted: false, reason: 'unmeasurable-line-height', actions };

    // RULE 4 — the mark must be visible. One full line of this block has to sit
    // above the limit, or its ellipsis is drawn where nobody can see it.
    if (top >= box.limit - lh) {
      return { fitted: false, reason: 'mark-would-be-invisible', actions };
    }

    const room = box.limit - top - (next.padBottom || 0);
    const lines = Math.max(1, Math.floor(room / lh));
    const linesBefore = Math.max(1, Math.round((next.bottom - next.top - (next.padBottom || 0)) / lh));
    if (lines >= linesBefore) {
      // Clamping to at least what it already has recovers nothing; cutting here
      // would be a no-op that still counts as content loss.
      return { fitted: false, reason: 'no-height-to-recover', actions };
    }

    const recovered = (linesBefore - lines) * lh;
    shift += recovered;
    bottom = box.contentBottom;
    actions.push({
      boxId: box.id,
      blockId: next.id,
      lines,
      linesBefore,
      recovered,
      role: next.role,
      chars: next.chars,
    });
  }
  return { fitted: false, reason: 'did-not-converge', actions };
}

/**
 * Summarize a plan as the RECORD the marker and `overflow:check` read (rule 6).
 * The existing content-clipped probe cannot see this, which is the whole reason
 * it exists.
 */
function trimRecord(plan) {
  const byBox = new Map();
  for (const a of plan.actions) {
    if (!byBox.has(a.boxId)) byBox.set(a.boxId, []);
    byBox.get(a.boxId).push(a);
  }
  return {
    trimmed: plan.actions.length,
    boxes: byBox.size,
    declined: plan.declines.length,
    linesRemoved: plan.actions.reduce((n, a) => n + (a.linesBefore - a.lines), 0),
    detail: plan.actions.map((a) => ({ block: a.blockId, role: a.role, lines: a.lines, was: a.linesBefore })),
    declines: plan.declines.map((d) => ({ box: d.boxId, reason: d.reason })),
  };
}


/**
 * Classify a DOM element's ROLE (§6). Kept beside the trim-class table so "what is
 * this?" and "may it be cut?" cannot drift apart.
 *
 * Closure-free on purpose: this function is `.toString()`-injected whole into the
 * emulator and `page.evaluate`, the same contract `overflow-probe.js` uses. It may
 * not reference anything from this module's scope.
 */
function trimRoleOf(el) {
  var tag = el.tagName;
  var bare;
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'PRE' || tag === 'CODE' || el.closest('pre, code')) return 'code';
  if (el.closest('.katex, mjx-container, .math-block')) return 'math';
  if (tag === 'CITE' || el.closest('cite')) return 'citation';
  if (tag === 'FOOTER' || el.closest('footer, .cell-footer')) return 'footer';
  if (tag === 'FIGCAPTION') return 'caption';
  if (tag === 'DT') return 'label';

  var text = (el.textContent || '').trim();
  // A VALUE slot: a short run that is mostly digits and unit punctuation. An
  // ellipsis here does not shorten a fact, it states a different one — "$1,234,567"
  // trimmed to "$1,23…" is wrong, not abbreviated.
  if (text && text.length <= 24) {
    bare = text.replace(/[^0-9]/g, '');
    if (bare.length && bare.length / text.length > 0.4) return 'value';
  }
  // Legal / statutory shapes, which read as prose but are operative text.
  if (/^(\u00a7|art\.|sec\.|clause\s)/i.test(text)) return 'legal';

  if (tag === 'LI') return 'list-item';
  if (tag === 'P') return 'prose';
  if (tag === 'BLOCKQUOTE' || tag === 'DD') return 'prose';
  // Anything unrecognized is unclassified, and `trimClassOf` defaults it to never.
  return 'unclassified';
}

/**
 * Measure one section into a `planTrim` model. Needs layout; returns plain numbers.
 *
 * Only INNERMOST TEXT BLOCKS become candidates (§4a + §4b): an element laid out as
 * a block whose child boxes are all inline. Clamping anything else either destroys
 * a layout or clips without drawing the ellipsis at all.
 *
 * Closure-free — injected by `.toString()`.
 */
function measureTrim(section, clipSelector, tolerance) {
  var TOL = typeof tolerance === 'number' ? tolerance : 12;
  var px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;

  var isTextBlock = (el) => {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents') return false;
    if (/grid|flex/.test(cs.display)) return false;
    if (!(el.textContent || '').trim()) return false;
    var i, d;
    for (i = 0; i < el.children.length; i++) {
      d = getComputedStyle(el.children[i]).display;
      if (!/^inline/.test(d) && d !== 'contents' && d !== 'none') return false;
    }
    return true;
  };

  var lineHeightOf = (el) => {
    var cs = getComputedStyle(el);
    var v = parseFloat(cs.lineHeight);
    if (!Number.isFinite(v)) v = parseFloat(cs.fontSize) * 1.4;
    return v > 0 ? v : 0;
  };

  // CHROME IS NOT CONTENT. The marker berth and the footer band sit at the bottom
  // of every section, so a measurer that counts them makes the footer "the block
  // crossing the edge" on every slide — measured: it blocked 6 of 12 corpus boxes
  // before this exclusion, and reported 12 overflowing boxes where the shipped
  // probe reports 6. `probeContentClipped` draws the same line and calls it
  // `chromeOnly`; this is that line, in the one place TRIM needs it.
  var isChrome = (el) => !!el.hasAttribute?.('data-lattice-berth') ||
           !!el.closest('[data-lattice-berth], .cell-footer, footer, .overflow-tab, .illegible-tab, .fixme-tab');

  var boxes = [];
  var candidates = [section];
  var found = section.querySelectorAll(clipSelector || '');
  var f, b, c, box, rect, limit, boxOver, blocks, contentBottom, stack, seq, node, child, r;
  for (f = 0; f < found.length; f++) candidates.push(found[f]);

  for (b = 0; b < candidates.length; b++) {
    box = candidates[b];
    rect = box.getBoundingClientRect();
    limit = rect.top + box.clientTop + box.clientHeight - px(box, 'paddingBottom');

    // The box's own overflow, by the SAME measure the shipped probe uses for a
    // clip cell. Inventing a second answer to "does this box overflow?" is how the
    // Playground and the Studio came to disagree; there is one oracle for that
    // question and this is not the place to add another.
    boxOver = box.scrollHeight - box.clientHeight;
    blocks = [];
    contentBottom = limit + (boxOver > 0 ? boxOver : 0);
    stack = [box];
    seq = 0;
    while (stack.length) {
      node = stack.pop();
      for (c = node.children.length - 1; c >= 0; c--) {
        child = node.children[c];
        if (isChrome(child)) continue;
        if (isTextBlock(child)) {
          r = child.getBoundingClientRect();
          if (r.height <= 0) continue;
          if (!child.id) child.setAttribute('data-trim-id', 'tb' + (seq++));
          blocks.push({
            id: child.id || child.getAttribute('data-trim-id'),
            role: trimRoleOf(child),
            top: r.top,
            bottom: r.bottom,
            lineHeight: lineHeightOf(child),
            padBottom: px(child, 'paddingBottom'),
            chars: (child.textContent || '').trim().length,
          });
        } else {
          stack.push(child);
        }
      }
    }
    if (boxOver > TOL) {
      boxes.push({ id: box.getAttribute('data-trim-box') || ('box' + b), limit: limit, contentBottom: contentBottom, blocks: blocks });
      box.setAttribute('data-trim-box', 'box' + b);
    }
  }
  return { boxes: boxes };
}

/**
 * Apply a plan to the DOM and stamp the RECORD (rule 6).
 *
 * The clamp is `-webkit-line-clamp` with a LITERAL integer, which is the one form
 * every engine supports (the design note's §1 table); the adaptive CSS form works
 * in WebKit alone and would render the same deck three ways.
 *
 * Closure-free — injected by `.toString()`.
 */
function applyTrim(root, plan) {
  var applied = 0;
  var i, a, el;
  for (i = 0; i < plan.actions.length; i++) {
    a = plan.actions[i];
    el = root.querySelector('#' + CSS.escape(a.blockId)) ||
             root.querySelector('[data-trim-id="' + a.blockId + '"]');
    if (!el) continue;
    el.style.display = '-webkit-box';
    el.style.webkitBoxOrient = 'vertical';
    el.style.webkitLineClamp = String(a.lines);
    el.style.overflow = 'hidden';
    el.setAttribute('data-lattice-trimmed', String(a.linesBefore - a.lines));
    applied++;
  }
  // The record IS the alarm: `probeContentClipped` sees a clamp but cannot see
  // what a clamp removed, and nothing else in the system knows a trim happened.
  if (applied) {
    root.setAttribute('data-lattice-trim', String(applied));
  }
  return applied;
}


/**
 * Undo every trim in `root`, restoring the pre-trim DOM.
 *
 * A live preview re-measures as the author types, and a clamp computed for the
 * PREVIOUS text is not a measurement of the current text — leave it in place and
 * each pass trims what the last pass already trimmed, converging on one line. So
 * every measure starts from a clean slide: clear, measure, plan, apply.
 *
 * Closure-free — injected by `.toString()`.
 */
function clearTrim(root) {
  var marked = root.querySelectorAll('[data-lattice-trimmed]');
  var i, el;
  for (i = 0; i < marked.length; i++) {
    el = marked[i];
    el.style.display = '';
    el.style.webkitBoxOrient = '';
    el.style.webkitLineClamp = '';
    el.style.overflow = '';
    el.removeAttribute('data-lattice-trimmed');
  }
  if (root.hasAttribute('data-lattice-trim')) root.removeAttribute('data-lattice-trim');
  return marked.length;
}

module.exports = {
  TRIM_TOLERANCE,
  TRIM_CLASSES,
  DEFAULT_TRIM_CLASS,
  ROLE_TRIM_CLASS,
  trimClassOf,
  planTrim,
  trimRecord,
  trimRoleOf,
  measureTrim,
  applyTrim,
  clearTrim,
  // Function source for verbatim injection into browser-string contexts, the same
  // contract overflow-probe.js uses — keeps the LOGIC single-sourced (HARD RULE #1).
  ROLE_SRC: trimRoleOf.toString(),
  MEASURE_SRC: measureTrim.toString(),
  APPLY_SRC: applyTrim.toString(),
  CLEAR_SRC: clearTrim.toString(),
};
