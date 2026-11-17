---
origin: 3273
priority: P3
recorded: 2026-11-17
area: website
severity: low
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md §4
deferred: large — a two-browser live-session e2e seeded into an empty deck (the filo-live.spec.ts harness), with an IME composition held across a co-editor's change
source: https://github.com/Laticent/lattice/pull/3273#issuecomment-6945732329
---

# The empty state stays right through a refused live merge into an empty deck

why now   — PR 3273 made Compose's empty flag follow the editor's own text. A refused live merge (an IME edit Compose cannot place
            on a co-editor's change) shows the author's text until the held change lands through `resyncFrom`; that path is
            the one the parked-change unit test holds, but no test drives a live session into an empty deck.
where     — docs/src/components/studio/ComposeView.tsx (the live-merge branches of the emit path, `resyncFrom`);
            docs/e2e/filo-live.spec.ts ('an IME edit Compose cannot place on a co-editor's change is refused…').
done when — an e2e in filo-live.spec.ts starts both browsers on an empty deck, refuses the guest's composition against the host's
            first line, and checks the guest's start grid is hidden while its editor shows text and the grid's state matches
            the editor after the held change lands; restoring a `source`-prop effect on the flag turns it red.
evidence  — PR 3273 card: "not run — live merge empty"; decision note §4 says the case rests on the shared resyncFrom path.
verify    — npx playwright test e2e/filo-live.spec.ts --project=desktop, plus the failing arm.
