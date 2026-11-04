---
origin: 3021
priority: P10
recorded: 2026-11-03
area: engine
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: blocked — no continuous slide host exists yet; the document view that would be one is not built
source: https://github.com/Laticent/lattice/pull/3021
---

# A document view declares data-lattice-flow="continuous" when it is built

why now   — #3021's fit check holds a narrow layout on a slide when it would overflow; a continuous host skips that, because its page grows. The fluid view is NOT such a host: each slide is one screen (100dvh) and clips, so it stays paged, and it now re-runs the hold when a slide's box changes size (the decision doc's "The fluid view is a paged host"). The Studio's Read · Article view projects to prose, not slides. Only the Frame Lab declares itself continuous today.
where     — the document view, wherever it lands; the attribute goes on its root, beside data-lattice-view.
done when — a document view renders slides that grow with their content, sets the attribute, and its tables and card rows reflow on width alone.
evidence  — a document-view render of examples/responsive-tables.md at phone width, every narrow layout standing, none clipped.
verify    — render the deck in the document view at 390px and look at the table slides.
