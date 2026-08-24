- **Changed: `check:family-tiers` now says whether a new overflow is a defect or
  baseline drift, and proves which.** The overflow oracle reported every new clip as
  `NEW CLIPS: … Fix the layout; do not bless it away`, at every `@size`. That is true
  only where no split is available: the sweep sets no `autosplit`, so a clip means
  "overflows when the author has not opted in", and a component that declares a split
  path may paginate instead. The verdict now separates `NEW CLIPS (ring)` — which
  keeps the fix-the-layout wording — from `NEW CLIPS (may paginate)`. A landscape
  `@size` short-circuits to `ring`, mirroring the engine's own `AUTOSPLIT_APPLIES`.
  Enrollment in `split-oracle.json` is treated as an INDICATION, not proof: it is a
  component-type opt-in from the manifest, and `lib/core/auto-split.js` still rings
  when no seam is available for the content at hand. So the verdict now names a
  falsifiable check — `--verify-paginates <component>@<size>,…` renders each with
  splitting ON and exits non-zero on any that still clips.
- **Changed: the family-overflow oracle is re-blessed after a month of drift.**
  `test/oracle/family-overflow.json` was last blessed on 2026-07-28 (#1236), and it
  records what overflows with pagination disabled, so ordinary spacing and typography
  work moves it. No layout changed: `hd` — the one row where a clip is what a reader
  sees — stays at 0, and all 18 newly-recorded (component, `@size`) pairs were
  rendered with splitting on and produced no overflow. Three entries left the record
  as genuine improvements: `policy-recommendation` (square, story) and `roadmap`
  (square, story, mobile). `matrix-grid` joins the roster because #1627 gave it an
  adaptive arm; it clips nowhere.
