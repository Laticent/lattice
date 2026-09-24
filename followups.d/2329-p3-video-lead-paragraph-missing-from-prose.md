---
origin: 2329
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# A video slide's lead paragraph is missing from the prose article

why now   — found while fixing the card-head eyebrow (followup 2329-p5, closed). A
            `video companion` slide's lead sentence ("One screen, one story.")
            reaches narration but not the Read · Article view: the media branch
            (`projectMedia`) re-hosts the figure and drops the prose in
            `.video-lead`. Pre-existing on main; off that fix's path.
where     — `projectMedia` in lib/transformers/prose-projection.mjs; `video` is in
            the MEDIA set, so `projectGeneric` never runs for it.
done when — the prose projection of a `video companion` slide carries its lead
            paragraph once, after the heading, with the eyebrow still the kicker.
evidence  — a unit arm rendered through the engine, failing on the old code.
verify    — tier 0.
