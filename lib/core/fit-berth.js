/**
 * fit-berth — the overflow marker's chrome, EMITTED WITH THE SLIDE instead of
 * conjured by a watcher.
 *
 * Three empty, out-of-flow, `display: none` elements land as the last children
 * of every slide `<section>`:
 *
 *   .overflow-tab   "Overflows" / "Content clipped" — the geometry/clip marker
 *   .illegible-tab  "Type 3px · floor 8.4px"        — the §8-rule-8 type floor
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

// Ordered, because the CSS stacks the corner tabs in this order when a slide
// trips more than one register at once.
const BERTHS = ['overflow-tab', 'illegible-tab', 'fixme-tab'];

// `aria-hidden` because an EMPTY tab is announced as nothing useful, and a FULL
// one is a duplicate: the marker's text is a QA annotation about the slide, not
// part of it, and the same fact reaches assistive tech through the export's
// stderr warning and the author's own tooling. Note this is the one direction
// `aria-hidden` is safe here — `overflow-probe.js` refuses to treat the
// attribute as a general "not content" signal, and these are excluded from both
// probes by NAME (MARKER_CHROME_SELECTOR), not by their aria state.
const BERTH_HTML = BERTHS.map((c) => `<div class="${c}" aria-hidden="true"></div>`).join('');

/** Has this slide's inner HTML already been berthed? */
function hasBerth(inner) {
  return inner.includes('class="overflow-tab"');
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
 * Live-DOM adapter — the preview / published-HTML runtime. Same berth, same
 * order, same idempotency guard.
 */
function applyToDom(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  for (const s of doc.querySelectorAll('section[data-lattice-slide]')) {
    for (const cls of BERTHS) {
      if (s.querySelector(`:scope > .${cls}`)) continue;
      const el = doc.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      s.appendChild(el);
    }
  }
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
  const found = section.querySelector(`:scope > .${cls}`);
  if (found) return found;
  const d = doc || section.ownerDocument;
  if (!d || typeof d.createElement !== 'function') return null;
  const el = d.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  section.appendChild(el);
  return el;
}

module.exports = {
  BERTHS,
  BERTH_HTML,
  applyToHtml,
  applyToDom,
  berth,
  // Function source for verbatim injection into browser-string contexts — the
  // emulator's inline watcher, which must reach the SAME berth this runtime does
  // or a `--fluid` export ends up with two markers (HARD RULE #1). Pure and
  // closure-free for exactly that reason, like overflow-probe.js's PROBE_SRC.
  BERTH_SRC: berth.toString(),
};
