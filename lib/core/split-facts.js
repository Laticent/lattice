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

// §0c's treatment assignment — "every one of the 59 components has a treatment
// (2026-07-22)" — transcribed from the doc's table + its dated Owner resolutions, so
// the prose has a machine-checkable counterpart. Adding a component to the catalog
// without placing it here fails the gate (rule 11: an entry is a RECORD of a verified
// placement, so a new component must be placed deliberately, not defaulted).
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
  'obligation-matrix': 'atomic', roadmap: 'atomic', gantt: 'atomic',
  // List → item · light (pack a fixed uniform count).
  list: 'list-light', checklist: 'list-light', content: 'list-light',
  agenda: 'list-light', 'list-criteria': 'list-light', inventory: 'list-light',
  'logo-wall': 'list-light',
  // List → item · heavy (1/slide, deterministic).
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
  journey: 'connected', 'timeline-list': 'connected', 'verdict-grid': 'connected',
  pricing: 'connected',
  // Read-across → keep whole / carousel.
  'compare-prose': 'read-across', 'compare-table': 'read-across',
  decision: 'read-across', redline: 'read-across', 'split-compare': 'read-across',
  'split-panel': 'read-across', 'compare-code': 'read-across', kanban: 'read-across',
  // Code → code-cards (PROPOSED, unbuilt).
  code: 'code',
  // Needs an opt-in call (§0c follow-on).
  progress: 'needs-call',
});

// Treatments that must NOT opt into splitting at all: splitting them destroys the only
// thing they say (a quadrant read, a single figure, one number) or there is nothing to
// split. An axis or a strategy on one of these is the #1193 defect class.
const NEVER_SPLIT = Object.freeze(['anchor', 'graphic', 'asset', 'atomic']);

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
      `${m.name}: no §0c treatment placed. Every component has one (§0c, "all 59 placed") — ` +
      `add it to TREATMENTS in lib/core/split-facts.js so its split behaviour is a decision, ` +
      `not a default (§8 rule 11).`,
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

module.exports = { TREATMENTS, NEVER_SPLIT, WIDTH_REDUCING, splitFactsFor, treatmentViolations };
