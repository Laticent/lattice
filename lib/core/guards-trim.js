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
 *   6. THE PLAN CARRIES ITS OWN RECORD — and the honest status of that record is
 *      CORROBORATING, not load-bearing. `probeContentClipped` sees a CLAMP (the
 *      lines still lay out, so Range rects exist), so every trim this code makes is
 *      already reported by the existing channel; the export additionally prints a
 *      `TRIMMED` line naming the pages. An earlier version of this comment said the
 *      marker and `overflow:check` READ `data-lattice-trim`. They do not — nothing
 *      in `lib/`, `tools/` or `docs/` reads it, and saying otherwise invited a
 *      reviewer to look for a consumer that was never written.
 *      The record becomes load-bearing the moment anything removes an element from
 *      layout, because the probe cannot see that at all. Nothing here does today.
 */

/** Layout-px slack before a box counts as overflowing. Matches the overflow probe. */
const TRIM_TOLERANCE = 12;

/**
 * ENTRY tolerance and EXIT target are not the same number, and conflating them
 * shipped a defect.
 *
 * `TRIM_TOLERANCE` answers "is this box overflowing enough to act on?" — it is
 * measurement slack, matched to the overflow probe so the two agree about which
 * slides are in trouble. It must NOT also serve as "close enough, stop cutting":
 * `planBox` used it that way and exited with up to 12px still outside the clip
 * cell. On `examples/overflow-guards.md` page 2 that was 8px — enough to shear the
 * card's bottom border and both rounded corners — and because 8px is also under the
 * probe's slack, `guards: strict` then SILENCED the overflow warning on a slide it
 * had left exactly as sheared as the untrimmed render. The guard sold a fix it did
 * not deliver and switched off the alarm that said so (HARD RULE #18).
 *
 * So the exit target is real fit, to sub-pixel slack. Half a layout pixel absorbs
 * the fractional `getBoundingClientRect` arithmetic and nothing else; it is
 * deliberately smaller than one device pixel at every export DPI we ship, so a
 * residual it tolerates cannot round to a visible row.
 */
const FIT_EPSILON = 0.5;

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
  // A prose block whose RUN contains operative inline text — code, a citation,
  // math. §6's argument against trimming a code block ("an ellipsis on a line of
  // code states something false") is an argument about the TAIL that gets cut, and
  // the tail of a `<p>` ending in `<code>--with-a-long-flag</code>` is exactly that.
  // Classifying the whole block by its tag alone made every such paragraph `prose`
  // and therefore trimmable; found by an independent review.
  mixed: 'never',
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

    const planned = planBox(box);
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
function planBox(box) {
  // A TOTAL order. Sorting on `top` alone is stable in V8, so two blocks at the same
  // top — which is exactly what a two-column layout produces — kept whatever order
  // the caller's walk happened to hand over, and the planner then reported a
  // different decline reason depending on it. MR9 caught this once the generator
  // started producing near-miss overflow. The tie-break is the block id, which the
  // measurer mints in document order, so the export and the live preview agree.
  const blocks = (Array.isArray(box.blocks) ? box.blocks : [])
    .slice()
    .sort((a, b) => a.top - b.top ||
      (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const actions = [];
  // Recovered height PER BLOCK, not one scalar for the box.
  //
  // A single accumulator is only correct when every block is one non-overlapping
  // in-flow stack, and the measurer does not produce that shape: it refuses to
  // treat a grid or flex container as a text block and walks into its children, so
  // a two-column layout emits SIBLING blocks with overlapping vertical ranges.
  // With a scalar shift, clamping the left column was credited against the right
  // one and the box was declared fitting while the right column still overflowed
  // by 160px. Found by an independent review — and the relation that should have
  // caught it could not, because the test's oracle re-stacked blocks the same
  // wrong way.
  const recovered = new Map();
  const shiftOf = (b) => {
    let sum = 0;
    for (const [id, amount] of recovered) {
      const other = blocks.find((x) => x.id === id);
      // Only a block strictly ABOVE this one moves it up. In one column that is
      // every earlier block; between columns it is none of them.
      if (other && other.bottom <= b.top) sum += amount;
    }
    return sum;
  };
  const bottomOf = (b) => b.bottom - shiftOf(b) - (recovered.get(b.id) || 0);

  // CHROME, PER BLOCK — not one scalar for the box.
  //
  // `measureTrim` classifies INNERMOST TEXT BLOCKS. A card's own bottom padding and
  // border, a grid row gap, a rule under the last line: none of them is a text block,
  // so a `contentBottom` taken as a max over `blocks` alone reports the box as ending
  // where its last PARAGRAPH ends. On page 2 of the demo deck the two differ by 17px
  // (model 1531.5, measured 1548.8), the planner cut against the smaller number, and
  // the card shipped sheared by 8px — with the overflow warning silenced, because
  // 8px is inside the alarm's own slack.
  //
  // The FIRST fix for that was a single global tail (`box.contentBottom` less the
  // deepest block) and it was wrong in the same direction. A third review reproduced
  // it: with two side-by-side stacks in one clip cell, chrome on the stack that is
  // not the deepest is invisible to a global number, so the planner under-reserved
  // and shipped the sheared card again. `outerBottom` is measured per block — the
  // deepest ancestor edge between the block and the box — so each block answers for
  // its own card. `chromeOf` is what that costs the block's line budget.
  //
  // `remainder` is what is left over: content the walk could not attribute to ANY
  // block (an absolutely positioned decoration pinned to the cell's bottom). It has
  // no owner, so it is reserved globally, which over-reserves in the safe direction —
  // the slide still fits, and rule 5 is preserved.
  const outerOf = (b) => (Number.isFinite(b.outerBottom) ? b.outerBottom : b.bottom);
  const chromeOf = (b) => Math.max(0, outerOf(b) - b.bottom);
  const deepestOuter = blocks.reduce((m, b) => Math.max(m, outerOf(b)), -Infinity);
  const measured = Number.isFinite(box.contentBottom) ? box.contentBottom : deepestOuter;
  const remainder = blocks.length ? Math.max(0, measured - deepestOuter) : 0;
  const limit = box.limit - remainder;

  const contentBottom = () =>
    blocks.reduce((m, b) => Math.max(m, bottomOf(b) + chromeOf(b)), limit);

  for (let guard = 0; guard < blocks.length + 1; guard++) {
    // FIT, not "within the alarm's slack" — see FIT_EPSILON. `tolerance` decided
    // whether this box was worth entering at all (in `planTrim`); it has no say in
    // when to stop cutting.
    if (contentBottom() - limit <= FIT_EPSILON) return { fitted: true, actions };

    const next = blocks.find((b) =>
      !recovered.has(b.id) && bottomOf(b) + chromeOf(b) > limit + FIT_EPSILON);
    if (!next) return { fitted: false, reason: 'nothing-left-to-cut', actions };

    // RULE 3 — role gate. A `never` block is not a candidate and never becomes one.
    if (trimClassOf(next.role) !== 'trim') {
      return { fitted: false, reason: 'blocked-by-' + next.role, actions };
    }

    const lh = next.lineHeight > 0 ? next.lineHeight : 0;
    if (!(lh > 0)) return { fitted: false, reason: 'unmeasurable-line-height', actions };

    // The block's TEXT starts below its border-box top by its top padding and
    // border. Measuring `room` from the border-box top over-counts by exactly that
    // and clamps to more lines than fit.
    const padTop = next.padTop || 0;
    const padBottom = next.padBottom || 0;
    const textTop = next.top - shiftOf(next) + padTop;

    // RULE 4 — the mark must be visible: one full line above the limit, with the
    // block's own bottom padding/border reserved (same reason as `lines` below).
    if (textTop >= limit - lh - padBottom - chromeOf(next)) {
      return { fitted: false, reason: 'mark-would-be-invisible', actions };
    }

    // The block's own bottom padding and border sit BELOW its last line, inside its
    // border box. Budgeting lines against `limit - textTop` alone spends that space
    // on text and leaves the border box hanging over the limit by exactly
    // `padBottom` — which is the 8px shear described at FIT_EPSILON, and it is why
    // the loop below used to exit "fitted" with the card still cut.
    const lines = Math.max(1,
      Math.floor((limit - textTop - padBottom - chromeOf(next)) / lh));
    const linesBefore = Math.max(1,
      Math.round((next.bottom - next.top - padTop - padBottom) / lh));
    if (lines >= linesBefore) {
      return { fitted: false, reason: 'no-height-to-recover', actions };
    }

    recovered.set(next.id, (linesBefore - lines) * lh);
    actions.push({
      boxId: box.id,
      blockId: next.id,
      lines,
      linesBefore,
      recovered: (linesBefore - lines) * lh,
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

  // A MIXED run — prose carrying operative inline text. FIRST among the content
  // tests, because the roles below are decided by TAG and this one by what the run
  // actually contains. Placed after them, `caption` and `note` returned first and a
  // figcaption or aside ending in code stayed trimmable — which is exactly the harm
  // this role was added to prevent, still shipped for two of the four trimmable
  // roles. Found by a third review.
  if (el.querySelector?.('code, kbd, samp, cite, .katex, mjx-container')) return 'mixed';

  // A quote's ATTRIBUTION. `attribution: 'never'` sat in the table unreachable —
  // no input produced it — so it protected nothing: an attribution line rendered as
  // a plain `<p>` inside a blockquote classified as `prose` and was trimmable. A
  // review found both dead entries by enumerating what the classifier can return
  // and diffing that against the table.
  // An em or en dash FOLLOWED BY A SPACE. The first cut also accepted an ASCII
  // hyphen, so `-40% year over year` inside a blockquote and a literal `- bullet`
  // inside a figure both classified as `attribution` — which is `never`, and under
  // rule 5 one misfire declines the WHOLE box, so `guards: strict` went silently
  // inert on any quote or figure slide whose prose merely opened with a dash.
  if (/^\s*[\u2014\u2013]\s/.test(text) && el.closest('blockquote, figure, .quote')) return 'attribution';
  // An aside / note block. `note: 'trim'` was the other dead entry.
  if (tag === 'ASIDE' || el.closest('aside, .note')) return 'note';

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
function measureTrim(section, clipSelector, tolerance, idPrefix) {
  var TOL = typeof tolerance === 'number' ? tolerance : 12;
  // Synthetic ids are unique per SECTION by construction (one counter below), which
  // is enough while they are only ever resolved within a section.
  //
  // The LIVE PREVIEW is where that stops holding: the runtime sweeps a whole deck's
  // DOM in one document, so two slides' `tb2` coexist there for the lifetime of the
  // page. (An earlier version of this comment blamed the player's Read view. That
  // rationale is void — `finalizeTrim` strips every `data-trim-id` before the player
  // is baked, verified: zero occurrences in the exported artifact. A third review
  // caught the comment outliving its reason.)
  var PRE = typeof idPrefix === 'string' && idPrefix ? idPrefix : 'tb';
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
  // of every section, so a measurer that walks a SECTION box would offer the footer
  // as "the block crossing the edge" and spend the one cut on chrome.
  //
  // THE HONEST STATUS OF THIS GUARD, because an earlier comment here got it wrong.
  // It claimed the exclusion is what fixed a measured "6 of 12 boxes blocked by
  // footer". It is not: that was fixed by taking the box's overflow from its own
  // scroll dims instead of a max over descendant rects, which was the same edit.
  // Mutation-tested afterwards, deleting this guard changes NOTHING on any real
  // deck — the adapter deck, the shipped corpus, or the 116-slide gallery — because
  // in all of them only a bounded cell overflows, and the footer band is a SIBLING
  // of `.cell-stage` rather than inside it.
  //
  // It is kept as defense in depth for the case that IS reachable in principle: a
  // section whose own box overflows, where the walk starts at the section and the
  // footer is a descendant. The test builds that case deliberately rather than
  // waiting for a deck to produce it. `probeContentClipped` draws the same line and
  // calls it `chromeOnly`.
  var isChrome = (el) => !!el.hasAttribute?.('data-lattice-berth') ||
           !!el.closest('[data-lattice-berth], .cell-footer, footer, .cell-header, header, .overflow-tab, .illegible-tab, .fixme-tab');

  var boxes = [];
  // ONE counter for the whole section, not one per box. It used to reset inside the
  // box loop while the section's walk ALSO descended into the clip cells, so the same
  // element was stamped twice and two elements ended up sharing an id. `applyTrim`
  // resolves an id with `querySelector`, which returns the first match in document
  // order — so a plan naming a paragraph could clamp a HEADING instead. That is rule
  // 3 violated in the DOM without `planTrim` ever proposing it, and it reproduced on
  // any section with a clip cell. Found by an independent review; see the adapter test.
  var idSeq = 0;
  // IDS ALREADY IN USE IN THIS SECTION. `idSeq` restarts at 0 on every call, while a
  // stamped element KEEPS its id across sweeps (deliberately — re-minting would
  // orphan the `data-trim-prior` an earlier apply saved against the old id) and
  // `clearTrim` does not remove it either. So on the runtime's next incremental
  // sweep a newly appeared paragraph was minted at index 0 and collided with an
  // element already holding `tb0`; `trimBlockEl` then returns the first in document
  // order. Reproduced by a third review: a plan naming a `prose` block clamped a
  // `value` block — rule 3 violated in the DOM without `planTrim` ever proposing it,
  // which is the same class of bug a first review found in the per-box counter and
  // the same fix applied one level too shallowly. Minting skips what is taken.
  var taken = {};
  var used = section.querySelectorAll('[data-trim-id]');
  var u;
  for (u = 0; u < used.length; u++) taken[used[u].getAttribute('data-trim-id')] = 1;
  var candidates = [section];
  // `querySelectorAll('')` THROWS — the `|| ''` fallback guaranteed it for any caller
  // without a clip selector, so the section itself was the only measurable box and the
  // call died before reaching it. Both shipped callers pass a real selector, which is
  // why nothing caught it; a test that measured a bare element did, immediately.
  var found = clipSelector ? section.querySelectorAll(clipSelector) : [];
  var f, b, c, k, box, rect, limit, boxOver, blocks, pending, contentBottom, stack, node, child, r, outer, chrome, anc, cur, deeper;
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
    pending = [];
    contentBottom = limit + (boxOver > 0 ? boxOver : 0);
    stack = [box];
    while (stack.length) {
      node = stack.pop();
      for (c = node.children.length - 1; c >= 0; c--) {
        child = node.children[c];
        if (isChrome(child)) continue;
        // A descendant that is ITSELF a measured box is walked as that box. Descending
        // into it here would list the same blocks under two boxes and stamp them twice.
        if (child !== box && candidates.indexOf(child) !== -1) continue;
        if (isTextBlock(child)) {
          r = child.getBoundingClientRect();
          if (r.height <= 0) continue;
          // DO NOT STAMP YET. This walk runs on every strict slide, and the first cut
          // stamped `data-trim-id` here — so a slide that FITS, and that this pass
          // will not touch at all, still got an attribute written on every one of its
          // text blocks, and that attribute shipped in the exported artifact. MR4's
          // premise is that a fitting slide is byte-identical to one rendered before
          // this feature existed, and the relation could not see the violation
          // because it models numbers, not the DOM. Stamping is deferred to the
          // `boxOver > TOL` check below, so only a box we actually plan against is
          // ever written to.
          pending.push(child);
          // THE BLOCK'S OWN CHROME BOTTOM — the deepest border-box edge of any
          // ancestor between it and the measured box.
          //
          // A text block is almost never what actually touches the bottom of a clip
          // cell: a card's padding and border sit outside it. The first fix for that
          // used ONE global scalar (`box.contentBottom` less the deepest block) and a
          // third review reproduced its failure: with two side-by-side stacks, chrome
          // belonging to the stack that is NOT the deepest is invisible to a global
          // number, so the planner under-reserved, shipped a sheared card, AND printed
          // "Those slides FIT" one line above the frame check reporting that same page
          // as overflowing. Per block there is no such blind spot — each block carries
          // the bottom of its own card, and a clamp shrinks that card with it.
          // THE BLOCK'S OWN CHROME — the padding and borders that sit below it and
          // shrink with it. Accumulated, never measured as a bottom-edge difference.
          //
          // Two shapes break the obvious readings. A raw `ancestor.bottom - r.bottom`
          // sweeps up STRETCH: a grid row-mate is stretched to the row's height, so a
          // short card reported 393px of chrome that in fact collapses the instant its
          // tall neighbor is clamped — and the planner refused a cut that would have
          // worked. Climbing to the box unconditionally sweeps up a SIBLING's height:
          // on a two-up slide the flex row is held open by the other column, and the
          // left card was credited 531px it does not own. Padding and border are
          // neither: they are the space this block's own containers reserve below it,
          // they move when it moves, and they are what actually shears when the
          // planner forgets them.
          chrome = 0;
          cur = child;
          for (anc = child.parentElement; anc && anc !== box; anc = anc.parentElement) {
            // Stop where a SIBLING holds the parent open — that parent's own bottom
            // padding is not space this block can recover.
            deeper = false;
            for (k = 0; k < anc.children.length; k++) {
              if (anc.children[k] === cur) continue;
              if (anc.children[k].getBoundingClientRect().bottom
                  > cur.getBoundingClientRect().bottom + 0.5) { deeper = true; break; }
            }
            if (deeper) break;
            chrome += px(anc, 'paddingBottom') + px(anc, 'borderBottomWidth');
            cur = anc;
          }
          outer = r.bottom + chrome;
          blocks.push({
            id: '',
            role: trimRoleOf(child),
            top: r.top,
            bottom: r.bottom,
            outerBottom: outer,
            lineHeight: lineHeightOf(child),
            // Symmetric with `padTop` below. It was `paddingBottom` alone, so a block
            // with a thick BOTTOM border had its line count overstated by up to a
            // line — the same asymmetry that let the border box hang past the limit.
            padBottom: px(child, 'paddingBottom') + px(child, 'borderBottomWidth'),
            // The block's TEXT starts below its border-box top by this much. Omitting
            // it made `room` and `linesBefore` both too large, so the planner clamped
            // to more lines than fit and still declared the box fitting — measured at
            // 26px still over on a card body with 30px padding and a 6px border.
            padTop: px(child, 'paddingTop') + px(child, 'borderTopWidth'),
            chars: (child.textContent || '').trim().length,
          });
        } else {
          stack.push(child);
        }
      }
    }
    if (boxOver > TOL) {
      // Stamp ONCE, and only for a box that is actually in trouble. The guard is on
      // the element's own state, not on the loop, because an element already
      // carrying an id from an earlier sweep must keep it — re-minting would orphan
      // the `data-trim-prior` a previous apply saved against the old id.
      for (c = 0; c < pending.length; c++) {
        child = pending[c];
        if (!child.id && !child.getAttribute('data-trim-id')) {
          while (taken[PRE + idSeq]) idSeq++;
          taken[PRE + idSeq] = 1;
          child.setAttribute('data-trim-id', PRE + (idSeq++));
        }
        blocks[c].id = child.id || child.getAttribute('data-trim-id');
      }
      boxes.push({ id: 'box' + b, limit: limit, contentBottom: contentBottom, blocks: blocks });
      // Idempotent: the runtime's shared observer watches `attributes: true`, and an
      // unconditional write lets it react to its own mutation. The file three lines
      // from this call site says exactly that about class toggles; it is just as true
      // here, and the first cut wrote on every block of every FITTING slide.
      if (box.getAttribute('data-trim-box') !== 'box' + b) box.setAttribute('data-trim-box', 'box' + b);
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
    el = trimBlockEl(root, a.blockId);
    if (!el) continue;
    // Save whatever inline values were there BEFORE, so a clear restores rather
    // than erases. The first version blanked these four properties unconditionally,
    // which destroys a host's own inline `display` or `overflow` on a text block —
    // the docblock claimed it restored the pre-trim DOM and it did not.
    if (!el.hasAttribute('data-trim-prior')) {
      el.setAttribute('data-trim-prior', JSON.stringify({
        display: el.style.display, orient: el.style.webkitBoxOrient,
        clamp: el.style.webkitLineClamp, overflow: el.style.overflow,
      }));
    }
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
function clearTrim(root, only) {
  var marked = only || root.querySelectorAll('[data-lattice-trimmed]');
  var i, el, prior, left;
  for (i = 0; i < marked.length; i++) {
    el = marked[i];
    if (!el?.hasAttribute('data-lattice-trimmed')) continue;
    prior = {};
    try { prior = JSON.parse(el.getAttribute('data-trim-prior') || '{}'); } catch (_e) { prior = {}; }
    el.style.display = prior.display || '';
    el.style.webkitBoxOrient = prior.orient || '';
    el.style.webkitLineClamp = prior.clamp || '';
    el.style.overflow = prior.overflow || '';
    el.removeAttribute('data-trim-prior');
    el.removeAttribute('data-lattice-trimmed');
  }
  // The RECORD tracks what is still clamped. A partial clear that dropped it wholesale
  // would tell the marker nothing was trimmed while a sibling panel still is.
  left = root.querySelectorAll('[data-lattice-trimmed]').length;
  if (left) root.setAttribute('data-lattice-trim', String(left));
  else if (root.hasAttribute('data-lattice-trim')) root.removeAttribute('data-lattice-trim');
  return marked.length;
}

/**
 * Resolve a plan's `blockId` to its element. ONE answer to that question, because
 * two answers is what the second review found: `applyTrim` resolved a synthetic id
 * OR an author's own `id`, while the emulator's revert loop open-coded only the
 * first — so a block carrying an author `id` was clamped and could never be undone,
 * and the export then reported the failed trim as a success.
 *
 * Matching `data-trim-id` by ATTRIBUTE COMPARISON rather than by a built selector is
 * the other half of the same finding. `'[data-trim-id="' + id + '"]'` is string
 * concatenation into a selector: an author writing `<p id='a"]'>` on an overflowing
 * slide threw `SyntaxError: not a valid selector` out of `querySelector` and aborted
 * the entire export with no PDF produced.
 *
 * Closure-free — injected by `.toString()`.
 */
function trimBlockEl(root, blockId) {
  var all = root.querySelectorAll('[data-trim-id]');
  var i;
  for (i = 0; i < all.length; i++) {
    if (all[i].getAttribute('data-trim-id') === blockId) return all[i];
  }
  // The author's own id. `CSS.escape` is correct here and was already used; the
  // try/catch is belt-and-braces for an engine without it.
  try { return root.querySelector('#' + CSS.escape(blockId)); } catch (_e) { return null; }
}

/**
 * Undo the clamps belonging to the named boxes, and nothing else. THE revert policy
 * — one implementation, both render paths (HARD RULE #1).
 *
 * Two defects live here in history. The export open-coded a per-box revert whose
 * element resolution disagreed with `applyTrim`'s (see `trimBlockEl`) and which
 * called `clearTrim(el.parentElement)` — clearing every trimmed SIBLING under that
 * parent, including ones belonging to a box that fitted. The runtime, meanwhile, did
 * `if (measureTrim(...).boxes.length) clearTrim(section)`: a whole-section revert,
 * which the export's own comment names as "the mechanism by which `guards: strict`
 * quietly becomes inert on exactly the split layouts it was meant to help". Same
 * deck, two answers, and the kernel was single-sourced while the POLICY was not.
 *
 * Closure-free — injected by `.toString()`.
 */
function clearTrimBoxes(root, plan, boxIds) {
  var want = {};
  var els = [];
  var i, a, el;
  for (i = 0; i < boxIds.length; i++) want[boxIds[i]] = 1;
  for (i = 0; i < plan.actions.length; i++) {
    a = plan.actions[i];
    if (!want[a.boxId]) continue;
    el = trimBlockEl(root, a.blockId);
    if (el) els.push(el);
  }
  return clearTrim(root, els);
}

/**
 * Strip the SCAFFOLDING once a render is final, keeping the record.
 *
 * `data-trim-id`, `data-trim-box` and `data-trim-prior` exist to let this pass
 * measure, address and undo its own work. None of them means anything to a reader,
 * a reviewer, or any consumer — and `data-trim-prior` is a JSON blob of an element's
 * prior inline styles, which was shipping inside every delivered `--player` artifact.
 * `data-lattice-trimmed` and `data-lattice-trim` are the RECORD (rule 6) and stay.
 *
 * Export-only: the runtime re-measures on later sweeps and needs the scaffolding to
 * survive between them.
 *
 * Closure-free — injected by `.toString()`.
 */
function finalizeTrim(root) {
  var junk = root.querySelectorAll('[data-trim-id], [data-trim-box], [data-trim-prior]');
  var i, el;
  for (i = 0; i < junk.length; i++) {
    el = junk[i];
    el.removeAttribute('data-trim-id');
    el.removeAttribute('data-trim-box');
    el.removeAttribute('data-trim-prior');
  }
  return junk.length;
}

module.exports = {
  TRIM_TOLERANCE,
  FIT_EPSILON,
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
  trimBlockEl,
  clearTrimBoxes,
  finalizeTrim,
  // Function source for verbatim injection into browser-string contexts, the same
  // contract overflow-probe.js uses — keeps the LOGIC single-sourced (HARD RULE #1).
  ROLE_SRC: trimRoleOf.toString(),
  MEASURE_SRC: measureTrim.toString(),
  APPLY_SRC: applyTrim.toString(),
  CLEAR_SRC: clearTrim.toString(),
  FIND_SRC: trimBlockEl.toString(),
  CLEAR_BOXES_SRC: clearTrimBoxes.toString(),
  FINALIZE_SRC: finalizeTrim.toString(),
};
