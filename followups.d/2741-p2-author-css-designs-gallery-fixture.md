---
origin: 2741
priority: P2
recorded: 2026-10-17
area: infra
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md
source: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §3.7
---

# author-css-designs.cjs fails on the gallery fixture, so "newly wins" is unmeasured

```text
  P2 · `author-css-designs.cjs --gallery-fixture` stops with "author CSS is not contiguous
       before Marp's trailing rules" (line 177): the fixture's `style:` rule and `<style scoped>`
       block do not sit together in Marp's output, and design 1's reference build assumes they do.
       why now   — D2(b) needs to know where each design makes author CSS newly win, and the three
                   example decks with a `<style>` cannot show it. The bridges note §3.7 marks it UNVERIFIED.
       where     — engineering/decisions/2026-10-15-bridges-and-two-hosts/author-css-designs.cjs
                   (the `splice` and `author` slice near line 170); the fixture is built by --gallery-fixture.
       done when — the gallery fixture runs to completion for every design and the results JSON
                   records newlyWins and newlyLoses for the rgb(1,2,3) and rgb(4,5,6) rules.
       evidence  — author-css-results.json with the fixture's rows; §3.7 updated.
       verify    — tier 0 gates, because it is a measurement script.
```
