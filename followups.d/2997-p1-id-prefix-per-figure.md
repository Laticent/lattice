---
origin: 2997
priority: P1
recorded: 2026-11-02
area: engine
severity: high
swimlane: engineering/decisions/2026-11-02-slide-facts-for-kinds.md §5, §7.2
deferred: large — its own PR by the owner's split decision (2026-11-02); it changes every chart id's spelling, so it needs export sign-off
source: https://github.com/Laticent/lattice/pull/2997
---

# Hand each figure a unique id prefix, and make the id state per-render

why now   — every kind conversion after it names parts under the prefix; doing it first means each kind is touched once
where     — lib/core/render-ids.js (module globals become a per-render object the host creates); the host chart frame
            hands `lat-r<render>-s<slide>-f<figure>-`; every kind and shared module that calls nextRenderSeq or trialIds
done when — no kind or shared module imports render-ids; two panes of one kind on one slide and two charts in the
            browser runtime mint no duplicate id; dark and light demo exports signed off by the owner
evidence  — the two-pane and runtime fixtures; the before/after id diff on the corpus; the signed-off exports
verify    — `npm run identity:check` names every deck whose output moved (it compares hashes and shows no diff), and the
            corpus diff with ids normalized away shows nothing else moved; npm test
