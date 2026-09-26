---
origin: 2396
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2396
---

# onyx `--state-warn-ink` reads 3.56:1 as text on onyx light

why now   — found while building hub-spoke (#2396): the at-risk status word measured 3.56:1 on onyx light, under the 4.5:1 text floor. hub-spoke worked around it (names never take state ink; its status word mixes state ink toward the heading color), but every other member that sets text in `--state-warn-ink` on onyx light still fails.
where     — `themes/onyx.css` (the `--state-warn-ink` token and whatever derives it); grep `state-warn-ink` across lib/ for text consumers.
done when — `--state-warn-ink` clears 4.5:1 as text on onyx light and still reads as warn beside the other state inks.
evidence  — contrast numbers for every state ink on onyx and onyx-dark, before and after, plus a rendered slide carrying a warn status.
verify    — theme token change: a checker pass plus visual review on onyx light and dark.
