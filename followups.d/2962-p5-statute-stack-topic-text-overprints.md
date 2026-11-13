---
origin: 2962
priority: P5
recorded: 2026-10-29
area: anchor
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §13
deferred: large — topic's footer is the legacy absolute footer; ending the overprint means moving topic onto the Form footer band, a migration of a sovereign frame
---

# topic's footer note prints over the basis line at a large venue

why now   — two of the three overprints this item recorded are fixed by the text-room work (§13): statute-stack's status pill no longer runs under its citation chip, and a `topic fact` eyebrow that wraps no longer prints over the topic name. The third is left: topic is not a `.form` slide, so its `<footer>` is the legacy absolute one, anchored at the bottom and growing upward as it wraps. At hall a long footer note (the gallery's own, four lines at story@hall) prints over the `fact` basis line. The fit probe does not see it because it leaves chrome out of the overlap check. Giving the legacy footer the stage footer's one-line ellipsis was tried and reverted: the content-clip probe reads an ellipsized legacy footer as clipped CONTENT (it knows only the Form footer band as chrome), so it would put a "Content clipped" tag on real decks and raised topic's clip count at portrait@hall.
where     — lib/components/anchor/topic/topic.styles.css and lib/forms/cell/stage/stage.css (the footer band), or lib/core/overflow-probe.js if the legacy footer is to count as chrome.
done when — a `topic` slide's footer never draws over its content at square, portrait or story at hall, checked on the rendered page, and the fit ratchet's counts for topic do not rise.
evidence  — renders of topic gallery slide 3 at story@hall and portrait@hall before and after.
verify    — npm run fit:harness -- --only anchor/topic/ --sizes square,portrait,story --venues hall --packs none --edits none --ratchet test/fit/baseline.json
