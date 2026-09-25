---
origin: 2356
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2356
---

# Cadenza reads a month abbreviation such as "Jan" as the bare syllable

Raised in #2356. The owner deferred it to its own session and PR.

why now   — chart axes and gantt windows use "Jan", "Feb", "Sept"; the narrator speaks them as
            written, so a listener hears "jan" rather than "January".
where     — docs/src/lib/cadenza/lexicon.ts (BASE_CASED, so the lower-case words "may" and "mar"
            never fire) and normalize.ts if a month-plus-year form needs a pattern.
done when — capitalized Jan–Dec abbreviations (and "Sept") read as the full month, lower-case
            words stay untouched, "May" is unchanged, and tests pin each.
evidence  — heard in the #2356 audio renders.
verify    — npm test on the normalize suite, plus one rendered clip of a gantt slide.
