// The deck the @visual pixel baselines are taken against.
//
// WHY THIS IS NOT `DECKS[0]`. The baselines used to screenshot the Studio on its
// seeded welcome deck, whose editor pane is a third of the shot — so every word of
// that deck's copy was baked into three committed PNGs. One line of it is worse than
// copy: the `stats` slide reads "61 — components / 14 — themes", and those numbers
// are the LIVE catalog, held current by `test/unit/playground/welcome-deck-counts.test.js`
// ("If that test fails, update the number here; don't relax the test"). So shipping a
// 62nd component forces an edit to `decks.ts`, which turns three @visual baselines red
// in a PR that never touched the Studio's chrome — and the only available answer is to
// re-bless, which is the ritual the spec's own header says never to perform casually.
// A baseline that has to be re-blessed for reasons unrelated to what it measures stops
// being read.
//
// WHAT IT IS INSTEAD: a deck frozen here, next to the snapshots it explains. It carries
// no number the repo tracks — no catalog count, no theme count, no date, no version — so
// the only thing that can move these pixels is the thing the spec exists to catch: the
// Studio's own chrome and rendering.
//
// It deliberately keeps the SHAPE of the deck it replaces — seven slides, the same seven
// components, comparable prose lengths — because the shot is a layout test: the editor's
// line count, the slide rail's chip widths and the preview's aspect all have to keep
// exercising what they exercised before. Each slide is authored to its component's
// contract (HARD RULE #6) and every one of the seven has a live example in
// `test/integration/baseline-decks/gallery.md`.
//
// CHANGING THIS FILE MEANS RE-BLESSING. That is the point: the re-bless is now a
// deliberate edit to a fixture, not a side effect of unrelated work.

/** The fixture's deck id in `localStorage` — `lattice-studio-src-<id>`. */
export const VISUAL_DECK_ID = 'visual-baseline-fixture';

/** The deck's name. Must BE the first slide's `h1`: a deck is named by its first heading
 *  (`studio-store.titleFromSource`), so a disagreement would show in the top bar. */
export const VISUAL_DECK_TITLE = 'Northbank transit plan';

const SLIDES = [
	`<!-- _class: title -->\n\n# ${VISUAL_DECK_TITLE}\n\n\`Fixture · pixel baseline\`\n\nA deck held still, so the picture answers for the chrome alone.`,
	`<!-- _class: big-number -->\n\n\`The whole idea\`\n\n- 4\n  - new stations opened without closing a single line.`,
	`<!-- _class: stats -->\n\n\`Where the plan stands\`\n\n## Four numbers the board asked us to hold.\n\n1. 92%\n   - on-time arrivals\n2. 18 min\n   - average crossing\n3. 3.4M\n   - riders a month\n4. 7 yr\n   - payback horizon`,
	`<!-- _class: cards-grid -->\n\n## Four moves, from plan to platform.\n\n- Survey.\n  - Walk every corridor and record what the current line already carries.\n- Cost it.\n  - Price the route against the two alternates before anyone draws a map.\n- Build in phases.\n  - Open each segment as it finishes; nothing waits on the whole works.\n- Hand over.\n  - Transfer operations once a full timetable has run for a season.`,
	`<!-- _class: split-compare -->\n\n\`The route decision\`\n\n## Widen the old line, or dig the north crossing.\n\nBoth carry the projected load. Only one of them still works when the load doubles.\n\n- Widen the old line\n  - Cheaper to start, and the corridor is already ours\n  - Closes the line for two summers running\n  - Caps out near today's peak, with nowhere to grow\n- Dig the north crossing\n  - Runs beside the old line, so nothing closes\n  - Costs more up front and opens a year later\n  - Doubles capacity and leaves room for a fourth branch\n\n> Dig the crossing — the cheaper route buys a decade, and we are planning for three.`,
	`<!-- _class: list-steps timeline -->\n\n## From survey to first timetable.\n\n1. Survey\n   - *Walk the corridor and record what the line carries today.*\n2. Build\n   - *Open each segment the season it finishes, not at the end.*\n3. Run\n   - *Hand over once a full timetable has held for a season.*`,
	`<!-- _class: closing -->\n\n## Approve the north crossing.\n\n\`The ask\``,
];

/** How many slides the fixture has — the spec asserts this against the slide rail, which is
 *  the cheapest thing that can ONLY be true if the seeded source actually loaded. */
export const VISUAL_DECK_SLIDES = SLIDES.length;

/** The fixture as deck source — the shape `lattice-studio-src-<id>` holds. */
export const VISUAL_DECK_SOURCE = SLIDES.join('\n\n---\n\n');
