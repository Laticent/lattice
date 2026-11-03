---
origin: 3021
priority: P10
recorded: 2026-11-03
area: engine
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: blocked — waits on the fluid and document views, which another PR owns
source: https://github.com/Laticent/lattice/pull/3021
---

# The fluid and document views declare data-lattice-flow="continuous"

why now   — #3021's fit check holds a narrow layout on a slide when it would overflow; a continuous host skips that, but only the Frame Lab declares itself continuous today.
where     — the fluid viewer (lib/base/base.fluid-view.css, the runtime's fluid controller) and any future document view.
done when — a continuous host sets the attribute and its tables reflow on width alone.
evidence  — a fluid render of examples/responsive-tables.md at phone width.
verify    — render with --fluid and look at the table slides.
