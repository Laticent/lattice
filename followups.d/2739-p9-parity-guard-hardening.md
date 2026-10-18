---
origin: 2739
priority: P9
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# Keep the two hosts' player files equal as the runtime grows

why now   — the #2739 inversion lens: the Studio reaches parity by running the live runtime and then undoing what it wrote (slide `style` restored, the card-tag equalizer re-run, `data-lattice-image-text` removed, a 784 px drawing stage), so any NEW runtime stamp on a slide or inside one is a byte only the Studio's file carries. The one guard, docs/e2e/player-host-parity.spec.ts, covers three decks and runs inside the nightly Studio suite, whose step overran its 45-minute limit on most recent nights.
where     — docs/src/components/studio/export/deck-export.js `finishBake`; lib/plugins/mermaid/mermaid.hydrate.js `exportStage` (it inherits the frame body's text styles, where the CLI worker's container sits in a bare page); .github/workflows/studio-e2e-nightly.yml.
done when — the parity spec runs in its own nightly job (owner approved this on 2026-10-17: a separate job of about 5 minutes, like the `security` job, in its own PR), the stage resets inherited text styles with the 25-deck corpus still byte-identical, and §11.9 names the structural alternative: a Webpage bake frame that runs the CLI's runtime-free export page instead of subtracting the runtime.
evidence  — a nightly run of the spec that finished; the corpus result after the stage reset.
verify    — tier 1 checker.
