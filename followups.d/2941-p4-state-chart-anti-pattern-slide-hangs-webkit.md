---
origin: 2941
priority: P4
recorded: 2026-10-28
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
source: https://github.com/Laticent/lattice/pull/2941
---

# Loading state-chart's anti-pattern slide directly hangs WebKit (iPhone profile)

why now   — an iPhone-class engine hung on `?c=state-chart&view=read&s=anti-patterns`; the plain `?c=state-chart&view=read` loads and idles fine. Chromium is fine. Not diagnosed, and it could be a sandbox quirk.
where     — the Playground deep link into a late slide of the `state-chart` plan; start by finding what the filmstrip mounts around that slide.
done when — the deep link loads in WebKit with the iPhone 15 Pro profile, or the hang is shown to be this sandbox's.
evidence  — Playwright WebKit, iPhone 15 Pro profile: the page never returned from `evaluate` in two runs.
verify    — run the same deep link in WebKit and on a real iPhone.
