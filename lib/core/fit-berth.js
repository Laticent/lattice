/**
 * fit-berth — the overflow marker's chrome, EMITTED WITH THE SLIDE instead of
 * conjured by a watcher.
 *
 * Three empty, out-of-flow, `display: none` elements land as the last children
 * of every slide `<section>`:
 *
 *   .overflow-tab   "Overflows" / "Content clipped" — the geometry/clip marker
 *   .illegible-tab  "Text too small · 3pt"          — the §8-rule-8 type floor
 *   .fixme-tab      "Fix Me" / "Likely fix"         — names the culprit cell
 *
 * Nothing reveals them but a class on the section (`.clip-marked`, `.illegible`,
 * `.fit-marked`), so a slide that fits renders exactly as it did before: three
 * hidden empty divs, no ink, no layout, no measurable box.
 *
 * ── WHY THE MARKUP OWNS THE BERTH ───────────────────────────────────────────
 *
 * The watcher used to CREATE this chrome — `document.createElement('div')` on
 * the tick that found an overflow, `.remove()` on the tick that didn't, and for
 * the Fix-Me overlay a full teardown-and-rebuild of every box every time it ran.
 * Two problems, and they compound:
 *
 *   · A DOM WRITER DRIVEN BY A DOM OBSERVER IS A LOOP LOOKING FOR A REASON.
 *     The watcher's scan was scheduled by a MutationObserver that watched
 *     `childList` — so creating a tab scheduled the scan that created the tab.
 *     The Fix-Me overlay shipped exactly that loop (destroy + rebuild at 60fps
 *     for as long as an overflowing slide stayed in view) and was fixed by
 *     adding a painted-signature guard. That fix is correct and it is also the
 *     wrong altitude: it makes every future write site's correctness depend on
 *     remembering a guard. If the element already exists, there is no childList
 *     mutation to observe and the cycle has no edge to travel along.
 *
 *   · TWO PRODUCERS DISAGREED ABOUT THE SAME SLIDE (HARD RULE #1). The runtime
 *     built its tab, `lattice-emulator.js`'s embedded watcher built its own, and
 *     a `--fluid` export ran both — which is why the runtime carries a branch
 *     for "a tab ANOTHER producer already drew, whose wording belongs to a
 *     different level". One berth in the markup gives them one element to agree
 *     about; the only thing either writes is its text.
 *
 * What is left for a watcher to do is set `textContent` and toggle a class on
 * the section. Both are attribute/character writes on an element that is
 * `position: absolute`, so neither creates a node, and neither can change the
 * geometry being measured — the failure mode that once let an unstyled in-flow
 * tab take 50px out of the very `.cell-stage` it was reporting on.
 *
 * ── WHY IT CANNOT RIDE THE MARKDOWN PIPELINE ────────────────────────────────
 *
 * The berth must be a DIRECT CHILD of `<section>` (every rule that reveals it is
 * `section.x > .y`), and the Form composition moves essentially everything else
 * into cells: `masthead-lift` sweeps from the masthead band to the end of the
 * slide into `.cell-stage`, stopping only for a trailing `<footer>`. A berth
 * emitted by `lib/engine/slides.js` would be swallowed into the stage — where it
 * would break its own selector AND become content inside the box being probed.
 * So this runs LATE, after form composition, on both paths.
 *
 * Both adapters are idempotent (guarded on the marker), so a re-render that
 * re-fires them is a no-op.
 */

const { splitSections } = require('./split-sections');

// Ordered, because the two RAILED berths read left-to-right in this order when a
// slide trips both registers at once: the clip fact first, the type-floor fact
// second. `fixme-tab` is not railed — it is a third register on its own edge.
const BERTHS = ['overflow-tab', 'illegible-tab', 'fixme-tab'];

// The two that share ONE capsule, and the element that makes them one.
//
// WHY A CONTAINER AND NOT TWO CENTERED SIBLINGS. The berth is centered on the
// slide, and two absolutely-positioned siblings of unknown width cannot be
// centered AS A GROUP in CSS — each one centers on itself, so the pair reads as
// two pills that happen to be near each other, and the seam between them lands
// wherever the widths put it. One positioned box holding two static children is
// the only shape where the capsule's own width is what gets centered.
//
// WHY NOT COMPOSE ONE LABEL INSTEAD. Cheaper in markup, more expensive
// everywhere else: the two facts carry different colors (a severity channel the
// register has always had) and the type-floor half owns a `title` hint that the
// clip half must not claim. A `::after` can carry neither, and the text would
// then have to be composed by BOTH watchers — the live runtime and the
// emulator's inline copy — which is a second producer to keep in step for no
// gain (HARD RULE #1). Railing them keeps each watcher writing `textContent` on
// its own element exactly as before; only the box around them is new.
const RAIL_CLASS = 'marker-rail';
const RAILED = ['overflow-tab', 'illegible-tab'];

// `aria-hidden` because an EMPTY tab is announced as nothing useful, and a FULL
// one is a duplicate: the marker's text is a QA annotation about the slide, not
// part of it, and the same fact reaches assistive tech through the export's
// stderr warning and the author's own tooling. Note this is the one direction
// `aria-hidden` is safe here — `overflow-probe.js` refuses to treat the
// attribute as a general "not content" signal, and these are excluded from both
// probes by NAME (MARKER_CHROME_SELECTOR), not by their aria state.
// `data-lattice-berth` is what makes a berth IDENTIFIABLE as one, and it is not
// decoration. These three class names are engine-emitted contract markup now, but
// `lib/engine/index.js` sets `html: true`, so an author can type
// `<div class="overflow-tab">CONFIDENTIAL</div>` into their markdown and the
// engine will emit it verbatim. Without a way to tell the two apart:
//
//   · the idempotency test below (a substring search over the slide's whole inner
//     HTML) reads that div as "already berthed" and the slide gets NO berths at
//     all — every register silent on that slide, and the engine's string output
//     out of sync with the DOM output (HARD RULE #1);
//   · `berth()` adopts the author's element and the watcher writes over its text,
//     erasing author content.
//
// Both were found by the HARD RULE #25 red team on real engine renders. The
// attribute settles both: only what this module emitted is a berth, and an author
// div carrying the class is author content — measured by the probes like any
// other content, and never written to.
const BERTH_ATTR = 'data-lattice-berth';
const tag = (c) => `<div class="${c}" ${BERTH_ATTR} aria-hidden="true"></div>`;
// The rail carries the attribute too, so `berth()`'s two-level lookup can require it
// at BOTH levels and an author's own `<div class="marker-rail">` can never be adopted.
const BERTH_HTML =
  `<div class="${RAIL_CLASS}" ${BERTH_ATTR} aria-hidden="true">${RAILED.map(tag).join('')}</div>`
  + BERTHS.filter((c) => !RAILED.includes(c)).map(tag).join('');

/**
 * Has this slide's inner HTML already been berthed?
 *
 * `endsWith`, not `includes`. The berths are appended as the LAST children, so
 * their exact block at the end is the only thing that means "this ran"; a
 * substring search anywhere in the slide is answerable by author content (see
 * BERTH_ATTR above) and by any transform that ever emits one of these classes.
 */
function hasBerth(inner) {
  return inner.endsWith(BERTH_HTML);
}

/**
 * HTML-string adapter — the owned engine path (`lib/engine`, the lattice CLI and
 * the docs playground). Must run AFTER the form transforms, or the berth lands
 * inside `.cell-stage`; see the header.
 */
function applyToHtml(html) {
  if (typeof html !== 'string') return html;
  const pieces = splitSections(html);
  if (!pieces.some((p) => p.type === 'section')) return html;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const inner = hasBerth(p.inner) ? p.inner : p.inner + BERTH_HTML;
    return p.openTag + inner + '</section>';
  }).join('');
}

/**
 * The same pass over a FULLY ASSEMBLED document, rather than a run of slides.
 *
 * The export re-berths after auto-split converges (`lattice-emulator.js`): the
 * splitter re-emits one slide as a cover plus N body pages, and the cover is
 * built fresh — so it carries no berth, and the only thing drawing its marker
 * was `berth()`'s mint-on-miss. That safety net works, and it is documented as
 * a branch that should be unreachable; leaving a KNOWN path through it makes
 * that comment false and quietly turns the net into load-bearing structure.
 *
 * IT CANNOT JUST CALL `applyToHtml`. An assembled document carries embedded
 * `<script>` / `<style>` chrome whose comments mention `<section …>` as prose,
 * and those substrings derail the depth-aware section walker — it never balances
 * a close and bails, returning no sections at all (observed: `splitSections` on a
 * real exported sidecar found zero). `lib/core/auto-split.js`'s then-`resplitDoc` hit
 * exactly this and solved it by slicing the head prefix off at the first real
 * slide; this mirrors that, deliberately, rather than inventing a second answer
 * to the same hazard.
 */
function applyToDocHtml(docHtml) {
  if (typeof docHtml !== 'string') return docHtml;
  const firstSlide = docHtml.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return docHtml;
  return docHtml.slice(0, firstSlide) + applyToHtml(docHtml.slice(firstSlide));
}

/**
 * Live-DOM adapter — the preview / published-HTML runtime. Same berth, same
 * order, same idempotency guard.
 */
function applyToDom(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  for (const s of doc.querySelectorAll('section[data-lattice-slide]')) {
    for (const cls of BERTHS) {
      // Qualified on the attribute: an author div carrying the class is content,
      // not a berth, and must not stand in for one.
      if (findBerth(s, cls)) continue;
      parentFor(s, cls, doc).appendChild(mint(cls, doc));
    }
  }
}

/** A berth element, or null. Two levels and no more — see `berth()`. */
function findBerth(section, cls) {
  return section.querySelector(
    `:scope > .${cls}[${BERTH_ATTR}], :scope > .${RAIL_CLASS}[${BERTH_ATTR}] > .${cls}[${BERTH_ATTR}]`,
  );
}

function mint(cls, doc) {
  const el = doc.createElement('div');
  el.className = cls;
  el.setAttribute(BERTH_ATTR, '');
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Where a freshly minted berth belongs: inside the rail for the two that share a
 * capsule, on the section for the rest. Mints the rail itself on a miss, for the
 * same reason `berth()` mints a tab on a miss — a document that predates this
 * transform must still get its marker rather than going silent.
 */
function parentFor(section, cls, doc) {
  if (!RAILED.includes(cls)) return section;
  let rail = section.querySelector(`:scope > .${RAIL_CLASS}[${BERTH_ATTR}]`);
  if (!rail) {
    rail = mint(RAIL_CLASS, doc);
    section.appendChild(rail);
  }
  return rail;
}

/**
 * Read a slide's berth — and MINT IT IF IT IS MISSING.
 *
 * Every path that renders a slide berths it (the engine's string adapter, the
 * runtime's DOM adapter), so the miss branch should be unreachable. It exists
 * anyway, and it creates rather than returning null, because the alternative is
 * for the marker to go SILENT on a document this transform never touched — a
 * hand-assembled page, an exported artifact from before this change, a test
 * fixture that mounts a bare `<section>`. Every register in this subsystem has
 * been burned once by a code path that answered "nothing to report" when it
 * meant "I was not wired up" (#1299), and a marker that quietly stops marking is
 * the one failure this whole area exists to prevent.
 *
 * Minting here is safe in a way that the OLD create-per-tick was not: it happens
 * at most once per section per document, and nothing observes childList any more
 * (see fit-sweep.js), so it cannot feed back into the scan that called it.
 */
function berth(section, cls, doc) {
  if (!section || typeof section.querySelector !== 'function') return null;
  // `[data-lattice-berth]` at EVERY level, so an author's own `<div class="overflow-tab">`
  // — or their own `<div class="marker-rail">` — is never adopted and never written over.
  // It is their content; this mints its own.
  //
  // TWO LEVELS, BOUNDED, not a descendant search. The railed pair sits one level down and
  // nothing sits deeper, so `:scope .cls` would widen the net for no gain and could reach
  // an author element nested anywhere in the slide that happens to carry both the class and
  // the attribute (the attribute is ours, but the engine emits author HTML verbatim, so
  // "impossible" is a stronger word than the parser earns).
  const found = section.querySelector(
    `:scope > .${cls}[data-lattice-berth], :scope > .marker-rail[data-lattice-berth] > .${cls}[data-lattice-berth]`,
  );
  if (found) return found;
  const d = doc || section.ownerDocument;
  if (!d || typeof d.createElement !== 'function') return null;
  const el = d.createElement('div');
  el.className = cls;
  el.setAttribute('data-lattice-berth', '');
  el.setAttribute('aria-hidden', 'true');
  // Railed berths mint INTO the rail, minting the rail first if it is missing — a tab
  // appended to the section instead would position itself and break the capsule.
  let parent = section;
  if (cls === 'overflow-tab' || cls === 'illegible-tab') {
    let rail = section.querySelector(':scope > .marker-rail[data-lattice-berth]');
    if (!rail) {
      rail = d.createElement('div');
      rail.className = 'marker-rail';
      rail.setAttribute('data-lattice-berth', '');
      rail.setAttribute('aria-hidden', 'true');
      section.appendChild(rail);
    }
    parent = rail;
  }
  parent.appendChild(el);
  return el;
}

module.exports = {
  BERTHS,
  RAIL_CLASS,
  RAILED,
  BERTH_ATTR,
  BERTH_HTML,
  applyToHtml,
  applyToDocHtml,
  applyToDom,
  berth,
  // Function source for verbatim injection into browser-string contexts — the
  // emulator's inline watcher, which must reach the SAME berth this runtime does
  // or a `--fluid` export ends up with two markers (HARD RULE #1). Pure and
  // closure-free for exactly that reason, like overflow-probe.js's PROBE_SRC.
  BERTH_SRC: berth.toString(),
};
