---
origin: 2358
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2358
---

# Decide whether the player export fetches pictures from other sites

why now   — the Studio player export embeds pictures from the Studio's own origin only. A deck
            that shows `![](https://images.example/x.jpg)` in the preview (after the reader chose
            to load that site) exports it as the placeholder, and the toast says so. Fetching the
            other site at export time is a request made on the author's behalf, and the owner
            reserved that decision. The kernel already takes an `origins` list, so the change is
            which origins `shareHtmlPlayer` passes.
where     — the `origins` argument of `withMedia` in docs/src/components/studio/share-export.ts;
            the candidate list is `options.webOrigins` (what the reader already allowed in the
            preview). Many hosts send no CORS header, so a fetch from the page fails for them:
            measure how many common image hosts do before promising it.
done when — the owner has picked a posture, and a player export follows it with a test arm.
evidence  — the decision recorded in engineering/decisions/2026-09-01-export-remote-subresource-posture.md.
verify    — owner decision; export bytes change if the posture widens.
