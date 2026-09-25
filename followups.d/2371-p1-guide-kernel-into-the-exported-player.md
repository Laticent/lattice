---
origin: 2371
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# The exported HTML player plays delivery presets — the shared Guide kernel lands with it

why now   — a board member or a prospect opens the sent `.html` with no Studio. Today the player
            highlights caption words only, so every preset, the salience plan and the content marks
            exist only in the Studio. Owner rulings 2026-09-25: embed opt-in when a deck sets
            `delivery:` (Fork 3a), and extract the kernel together with this step (reorder).
where     — docs/src/components/studio/present-guide.ts (resolver, planSlide, markContent) →
            a shared DOM-only module; lib/export/player-core.mjs (inline into the one hashed script,
            the Anima-bundle pattern at :2483-2513); engineering/decisions/2026-09-25-vetrina-delivery-presets.md §7.2, §8 steps 3 and 8.
done when — an exported deck with `delivery: somber` marks the named items while it plays, one with
            no `delivery:` is byte-identical to today's export, and the Studio and the player import
            the same kernel.
evidence  — dark and light exports of a representative deck sent for sign-off (Quality Bar export
            rule); html-player golden diff; size measured (Vetrina alone is 47,104 B minified).
verify    — adversarial trio (#25): shared kernel plus exported bytes.
