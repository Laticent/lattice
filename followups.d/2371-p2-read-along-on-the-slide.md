---
origin: 2371
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# Word read-along on the slide text, driven by the LTT

why now   — the owner asked for word highlight on the content, as the Studio does on captions.
            `expressive` turns it on (§6); restrained and somber keep it off.
where     — present-guide.ts `textGeometry` / `sentenceRange` (word ranges already measured);
            CSS Custom Highlight (`::highlight()`), so slide markup is never rewritten (#22);
            engineering/decisions/2026-09-25-vetrina-delivery-presets.md §5.1, §8 step 6.
done when — while an expressive deck plays in Present, each spoken word lights on the slide in
            step with the caption, and a word split across inline markup lights as one word.
evidence  — a screen recording from the built Studio; iOS Safari marked UNVERIFIED unless driven.
verify    — maker-checker.
