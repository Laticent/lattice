/**
 * split-facts.js — the STANDING ORACLE's resolver (§8 rule 5 / rule 11 of
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md).
 *
 * Rule 5 asks for "a committed, blessed golden of {component → (axis, read-across,
 * cover-class, reshape-class)}, gated in `build:check`, so a later DOM refactor that
 * drifts a *default* fails CI — parity-at-migration is necessary but not sufficient."
 * Rule 11 adds that the golden RECORDS a verified default and never mints one.
 *
 * This module is the recompute half: given a component manifest it derives the split
 * facts the split registry will actually act on. The gate diffs that against the
 * blessed record (test/oracle/split-oracle.json); `npm run oracle:bless` rewrites the
 * record as a deliberate act.
 *
 * WHY this exists, concretely. §0c assigns every component a treatment in prose, and
 * nothing checked the manifests against it — so `matrix-2x2` (resolved "atomic text
 * grid, ring on overflow") and `split-compare` (resolved "read-across, keep whole")
 * both shipped carrying a live split axis, and a portrait render duly shredded a 2×2
 * into three pages showing two of four quadrants. §0c's own follow-on list named the
 * first and missed the second. A prose table cannot fail CI; this can.
 *
 * The axis resolution below deliberately MIRRORS lattice-emulator.js's SPLIT_CAP
 * builder (`m.capacity?.axis ?? m.adapt?.capacity?.axis`) rather than defining its own
 * — the oracle has to describe what the engine really does, including that a split
 * axis has three possible declaration sites. `declaredIn` records WHICH one, because
 * that is precisely the drift that bit us: an axis under `adapt.capacity` reads as a
 * harmless per-family count estimate but the registry consumes it as an opt-in switch.
 *
 * Pure + fs-free: manifests are passed in.
 */

// §0c's treatment assignment. This map is now the SOURCE of §0c's table, not a
// transcription of it: `tools/build-split-treatments.js` renders the doc's table from
// here (+ TREATMENT_LABELS / TREATMENT_NOTES below) and `build:check` fails on drift.
// The hand-maintained direction was tried first and rotted exactly as you would
// expect — the prose claimed "all 59 components" against a catalog of 61, placed
// `roadmap` as atomic a release after the code moved it to read-across, and never
// mentioned `matrix-grid` or `premise` at all. A count in prose is a constant nobody
// re-derives; this one is derived on every build.
// Adding a component to the catalog without placing it here fails the gate (rule 11:
// an entry is a RECORD of a verified placement, so a new component must be placed
// deliberately, not defaulted).
const TREATMENTS = Object.freeze({
  // Anchor — never splits.
  title: 'anchor', closing: 'anchor', divider: 'anchor',
  // viewBox graphic — container-responsive + legibility floor → ring (rule 8, P-floor).
  piechart: 'graphic', quadrant: 'graphic', radar: 'graphic', 'word-cloud': 'graphic',
  funnel: 'graphic', map: 'graphic', diagram: 'graphic', scene: 'graphic',
  'state-chart': 'graphic',
  // Bitmap asset — responsive, no split.
  image: 'asset', video: 'asset',
  // Atomic — whole slide, overflow → ring. Single text units + shared-geometry grids
  // that can neither scale nor split.
  'big-number': 'atomic', quote: 'atomic', math: 'atomic', 'citation-card': 'atomic',
  contact: 'atomic', wifi: 'atomic', 'matrix-2x2': 'atomic',
  'obligation-matrix': 'atomic', gantt: 'atomic',
  // matrix-grid: a positional grid, same reasoning as obligation-matrix — a row
  // or column carries meaning only alongside every other row/column; splitting either
  // axis destroys the read the whole component exists to give. (roadmap shared this
  // reasoning until #1209 moved it to read-across, which turns on a transposed card
  // form matrix-grid has no equivalent of — so matrix-grid stays atomic.)
  'matrix-grid': 'atomic',
  // logo-wall: MOVED list-light → atomic (2026-09-01). Its members are not independent —
  // the component's whole claim is the WALL ("trusted by", all of them, at once), so one
  // logo per slide says something the author did not write, and any packing at all is the
  // thing the single-element rule forbids. That leaves exactly one honest treatment: keep it
  // whole and ring on overflow, which is what it already did by having no axis. This records
  // the reason so the next sweep does not "fix" the omission by enrolling it.
  'logo-wall': 'atomic',
  // List → item. ONE member per slide, like every other treatment that splits.
  // The light/heavy distinction is retired (2026-09-01): it existed only to say how MANY
  // members a page packed — heavy atomized, light packed to its authoring comfort — and
  // nothing packs any more, so the two named the same behavior. `logo-wall` left this group
  // in the same pass (below): it was never a list of independent members.
  list: 'list-light', checklist: 'list-light', content: 'list-light',
  agenda: 'list-light', 'list-criteria': 'list-light', inventory: 'list-light',
  'cards-grid': 'list-heavy', 'cards-stack': 'list-heavy', actors: 'list-heavy',
  kpi: 'list-heavy', stats: 'list-heavy', 'q-and-a': 'list-heavy',
  'policy-recommendation': 'list-heavy',
  // Record-shaped → 1 per slide.
  glossary: 'record', 'list-tabular': 'record', 'regulatory-update': 'record',
  'statute-stack': 'record',
  // Connected / related → 1/slide + a relationship signal (§0b, rule 12a — BUILT).
  // §0b is explicit that atomizing these WITHOUT the →next / ↻loop / compare-N-of-M
  // adornment is what makes atomization unreadable, so `perPage: 1` and the signal
  // landed in the SAME slice, exactly as the P-envelope entry required. The four with a
  // `capacity` contract now declare `capacity.relationship`; `journey`, `timeline-list`
  // and `pricing` carry no capacity at all (they ring today) and receive theirs with the
  // §0c "opt-in backfill" follow-on, which is where their treatment is decided.
  'list-steps': 'connected', cycle: 'connected', 'authority-chain': 'connected',
  'verdict-grid': 'connected', pricing: 'connected',
  // timeline-list MOVED connected -> atomic (2026-09-02). It was placed 'connected' on the
  // strength of its DOM — `.timeline-spine > .timeline-item`, N clean repeated blocks — and
  // the placement was never rendered. It is one figure over a shared axis, and the CSS is
  // where that shows: `.timeline-spine::before` draws ONE horizontal rail across the whole
  // set (timeline-list.styles.css:60-76), and the dot spectrum is `:nth-child(6n+k)` on an
  // element carrying no index (:117-122). Sliced to one item per page, the rail renders
  // full-width under a single dot — measured on a real render — and every page is
  // `:nth-child(1)`, so the cat-1..6 sequence collapses to cat-1 on all of them. The rail
  // can be hidden and the index can be stamped, but a timeline with its spine removed and
  // one milestone per page is not a timeline: the left-to-right reading IS the component.
  // Same conclusion as matrix-grid and gantt, reached from a render rather than a DOM shape.
  'timeline-list': 'atomic',
  // Read-across → keep whole / carousel.
  'compare-prose': 'read-across', 'compare-table': 'read-across',
  decision: 'read-across', redline: 'read-across', 'split-compare': 'read-across',
  'split-panel': 'read-across', 'compare-code': 'read-across', kanban: 'read-across',
  // roadmap MOVED atomic → read-across (2026-07-27, #1209, owner's call).
  // §0c placed the roadmap TABLE as atomic, and that reasoning holds for the table:
  // paginating a workstream x phase grid destroys the cross-reading (the #1193 class).
  // But roadmap has a SECOND rendered form. At portrait `chart-family.js` auto-selects
  // `horizons`, which transposes the grid into N independent `.horizon-card` phase
  // units — each already self-contained, exactly as kanban's `.kanban-column` lanes
  // are. There is no cross-reading left to destroy once the transpose has run, so the
  // seam is real in the card form and only there.
  //
  // 'read-across' is the treatment that REQUIRES a strategy rather than permitting a
  // bare axis (see treatmentViolations below), which is precisely the guarantee wanted
  // here: roadmap can never paginate by a plain axis, only through `roadmap-horizons`,
  // and that splitter returns null unless it finds a `.horizons` grid. So the table
  // still rings on overflow. Before this, `atomic` + NEVER_SPLIT made any split a gate
  // failure — which is why the portrait clip could only be sanctioned, not fixed.
  roadmap: 'read-across',
  // premise: same functional shape as split-panel — one claim beside the points that
  // substantiate it — and declares no independent split axis of its own.
  premise: 'read-across',
  // journey MOVED connected -> read-across (2026-09-02), for roadmap's reason and by roadmap's
  // route. It was placed 'connected' — 1/slide plus a "→ next" pointer — and could never act on
  // it: journey declares no axis, so nothing opted in and the placement was inert.
  //
  // The placement was also wrong for the LANDSCAPE form, which is one figure over a shared axis:
  // `.journey-board` sets `--task-count`, every task carries an ABSOLUTE `--col`, and the stage
  // ribbon spans its tasks with `grid-column: span var(--span)` (journey.styles.css 339/346/382/389).
  // A slice of that leaves a page drawing tasks into columns that are no longer there — the
  // #1193 class, and the same test matrix-grid and gantt fail.
  //
  // But journey has a SECOND rendered form, exactly as roadmap does. At portrait
  // `journey.transform.js` emits `ol.journey-vstack > li.journey-vstage > ol.journey-vrows`, and
  // the vertical rules are flex throughout: `--span` is a growth factor, `--col` is not read, and
  // no rule below journey.styles.css:800 uses a counter, `:nth-child`, or a sibling combinator
  // (measured). A stage is a genuine unit there — own band label, own rows, a per-task mood mark
  // instead of one polyline across the set — so the seam is real in the vertical form and only there.
  //
  // 'read-across' is the treatment that REQUIRES a strategy rather than permitting a bare axis
  // (treatmentViolations below), which is the guarantee wanted: journey can never paginate by a
  // plain axis, only through `journey-stages`, and that splitter returns null without an
  // `ol.journey-vstack` — so the landscape grid still rings, untouched.
  //
  // AN EARLIER ENROLLMENT OF journey WAS BACKED OUT, and the record of WHY was wrong. It was
  // enrolled under "split what can be split", backed out on a bucket rule, re-enrolled when that
  // rule was corrected, and never re-rendered in between; on the render it produced a run whose
  // every body page carried the whole board, identical. The cause recorded here was that
  // `countAxis` reads an authored collection the transform has discarded. It does not: `countAxis`
  // reads rendered markup. The real cause is that `firstList` takes the list with the most `<li>`
  // children, and on a rendered journey that is the MOOD LEGEND (one item per mood level), not
  // the stages — so the envelope was built from the legend's length while the body was never
  // sliced at all. That is a fact about `lib/core/collections.js`, not about journey, and it is
  // why this enrollment goes through a STRATEGY (which reads `ol.journey-vstack` by name) rather
  // than an axis (which would ask `firstList` again and get the legend again).
  journey: 'read-across',
  // Code → code-cards (PROPOSED, unbuilt).
  code: 'code',
  // progress: PLACED atomic (2026-09-02), closing the last 'needs-call'.
  //
  // It was the one component of the four whose CSS is genuinely slice-clean: no counter, no
  // structural selector, no sibling combinator, no count-derived container property, and
  // deliberately NO connector — `.progress-track` is a transparent positioning context that
  // draws no rail (progress.styles.css:44-49). The track is the `1fr` of a section-relative
  // template, so a bar on page 1 and a bar on page 5 are drawn against identical lengths: the
  // numbers stay technically comparable across pages.
  //
  // It is placed atomic anyway, and the render is why. A progress chart is a COMPARISON — the
  // slide says "92 on-track, 68 at-risk, 12 blocked" and the reader takes the ranking in one
  // look, off a shared left baseline. Rendered one bar per page, that read is gone: the deck
  // now asks the reader to hold three numbers across three page turns to learn what one slide
  // showed at a glance. "Comparable if you remember the previous page" is not the read this
  // component gives. Bars share a baseline the way roadmap's table shares an axis.
  //
  // So the honest treatment is the one it already had by accident — keep the slide whole, ring
  // on overflow — recorded here as a decision rather than an omission (§8 rule 11), with the
  // reason, so the next sweep does not enroll it on the strength of a clean DOM.
  progress: 'atomic',
});

// Treatments that must NOT opt into splitting at all: splitting them destroys the only
// thing they say (a quadrant read, a single figure, one number) or there is nothing to
// split. An axis or a strategy on one of these is the #1193 defect class.
const NEVER_SPLIT = Object.freeze(['anchor', 'graphic', 'asset', 'atomic']);

// The display half of TREATMENTS: §0c's own row labels, in §0c's own order. Kept
// HERE rather than in the generator so a new treatment cannot be added to the map
// above without deciding how the doc says it — `tools/build-split-treatments.js`
// renders §0c's table from these two objects and hard-fails on a treatment with no
// label. Order is the order §0c lists its rows in.
const TREATMENT_LABELS = Object.freeze({
  anchor: '**Anchor — never splits**',
  graphic: '**viewBox graphic — container-responsive + legibility-floor→ring**',
  asset: '**Bitmap asset — responsive, no split**',
  atomic: '**Atomic — whole slide, overflow→ring** (single text units + shared-geometry grids that can\'t scale or split)',
  'list-light': '**List → item · light** (1/slide; a light member is one bullet or tile)',
  'list-heavy': '**List → item · heavy** (1/slide; a heavy member carries a title AND a body)',
  record: '**Record-shaped → 1 per slide** (glossary pivots via its table transform; the rest are `ol/ul>li` → list-item split)',
  connected: '**Connected / related → 1/slide + relationship signal**',
  'read-across': '**Read-across → keep whole / carousel**',
  code: '**Code → code-cards** (by line / block — PROPOSED)',
  // 'needs-call' RETIRED 2026-09-02 — the category is empty. It held the components §0c's sweep
  // could not place without a render, and `progress` was the last of them; the generator hard-
  // fails on a label with no component, so the row goes rather than rendering an empty heading.
  // It is not reserved: a future component with no placement is a MISSING entry, which
  // `treatmentViolations` already reports by name — a holding pen made that look decided.
});

// Per-component annotations §0c's table carried by hand. They are real content — the
// relationship a connected member signals, a caveat on a placement — so they survive
// the generator rather than being dropped into prose that then drifts from the row it
// annotates. Anything with no entry renders as a bare component name.
const TREATMENT_NOTES = Object.freeze({
  'state-chart': 'JS-scaled; no-JS UNVERIFIED',
  'logo-wall': 'by image',
  stats: 'tile — watch',
  'list-steps': '→next',
  cycle: '↻loop',
  'authority-chain': 'governs↓',
  journey: 'PORTRAIT ONLY — the vertical `journey-vstack` slices by stage; the landscape grid is one figure over a shared `--col` axis and rings',
  'timeline-list': 'the spine IS the component — one rail across the set, and a `:nth-child` dot spectrum that collapses to cat-1 when sliced',
  'verdict-grid': 'compare N/M',
  pricing: 'compare N/M',
  kanban: 'per-lane — loses the cross-lane read; a keep-whole is arguably better',
  roadmap: 'the TABLE rings; only the transposed `horizons` card form has a seam (#1209)',
  premise: 'one claim beside the points that substantiate it — same shape as split-panel',
  'matrix-grid': 'a positional grid — a row means nothing without every other row',
  'split-compare': 'examined for enrollment 2026-09-02 and declined: N is 2 by contract, the `.verdict` is a sibling of `.options` so a slice repeats it on every page, and one `.option` in a `1fr 1fr` grid leaves half the slide empty at landscape',
  progress: 'CSS bars, not a viewBox graphic — so NOT "scale like a graphic". Slice-clean CSS, but the bars share a baseline and the comparison IS the read, so the slide stays whole',
});

// The width-REDUCING strategies (2026-06-25): they re-author a side-by-side layout to
// one panel/card per page, so they are the only ones that can fix HORIZONTAL overflow.
// Everything else paginates a vertical collection. Preserving this class is §8 rule 2's
// requirement for any future `split.strategy` retirement, so the oracle records it.
const WIDTH_REDUCING = Object.freeze(['cover-code', 'cover-sides', 'cover-cards']);

/** The split facts the registry will act on, derived from one manifest. */
function splitFactsFor(m) {
  const cap = m.capacity || {};
  const adaptCap = m.adapt?.capacity || {};
  const split = m.split || null;
  // Mirrors lattice-emulator.js SPLIT_CAP: top-level wins, then the per-family adapt
  // block. `split.axis` is the carousel recipe's own axis, used once enrolled.
  const axis = cap.axis ?? adaptCap.axis ?? null;
  const declaredIn = cap.axis ? 'capacity' : (adaptCap.axis ? 'adapt.capacity' : null);
  const strategy = split ? (split.strategy || null) : null;
  return {
    treatment: TREATMENTS[m.name] ?? null,
    axis,
    declaredIn,
    // ENROLLED is the real gate the engine applies: an axis OR a split recipe.
    enrolled: Boolean(axis || split),
    strategy,
    reshape: strategy ? (WIDTH_REDUCING.includes(strategy) ? 'width-reducing' : 'paginator') : null,
    // The cover class the run will carry — the universal field for the plain/paginate
    // paths, or the strategy's own per-layout cover (which is why the rule-9 invariant
    // gate must key on a ROLE, not on `lat-split-cover`: it cannot see these).
    coverClass: !split || split.strategy === 'cover-paginate' || split.strategy === 'cover-cards'
      ? (axis || split ? 'lat-split-cover' : null)
      : `${m.name}-cover`,
    perPage: cap.perPage ?? (split ? (split.perPage ?? null) : null),
    // The declared CONNECTED-MEMBER relationship (§0b, §8 rule 12a). Recorded because it is
    // exactly the kind of derived default rule 5 exists to pin: silently dropping it would
    // strip the "→ next / ↻ loop / governs ↓ / Option N of M" adornment from a split run with
    // NOTHING failing — the pages would still render, just as an unreadable set of unrelated
    // slides, which is the outcome §0b rejects.
    relationship: cap.relationship ?? null,
  };
}

/**
 * Consistency between a component's §0c treatment and what its manifest declares.
 * These are the invariants a prose table cannot enforce; each returns a message.
 */
function treatmentViolations(m, facts) {
  const out = [];
  if (!facts.treatment) {
    out.push(
      `${m.name}: no §0c treatment placed. Every component in the catalog has one — ` +
      `add it to TREATMENTS in lib/core/split-facts.js so its split behavior is a decision, ` +
      `not a default (§8 rule 11), then run \`npm run split:treatments\` to re-render §0c.`,
    );
    return out;
  }
  if (NEVER_SPLIT.includes(facts.treatment) && facts.enrolled) {
    out.push(
      `${m.name}: §0c places it as '${facts.treatment}' (never splits — overflow rings), but the ` +
      `manifest opts INTO splitting (axis=${facts.axis} in ${facts.declaredIn}, ` +
      `strategy=${facts.strategy}). The split registry reads either as an opt-in, so this ships ` +
      `a split that destroys the component's meaning — the #1193 defect class (matrix-2x2 was ` +
      `shredded into 2-of-4 quadrants this way). Remove the axis/strategy, or change the ` +
      `treatment deliberately in §0c AND here.`,
    );
  }
  if (facts.treatment === 'read-across' && facts.axis && !facts.strategy) {
    out.push(
      `${m.name}: §0c places it as 'read-across' (keep whole / carousel), but it declares a bare ` +
      `'${facts.axis}' axis with no split strategy — so it paginates BETWEEN members, which is ` +
      `exactly the cross-reading that makes it read-across. Give it a carousel strategy or drop ` +
      `the axis (split-compare shipped this way).`,
    );
  }
  return out;
}

module.exports = {
  TREATMENTS, TREATMENT_LABELS, TREATMENT_NOTES, NEVER_SPLIT, WIDTH_REDUCING,
  splitFactsFor, treatmentViolations,
};
