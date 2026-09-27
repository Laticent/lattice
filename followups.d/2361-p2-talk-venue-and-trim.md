---
origin: 2361
priority: P2
recorded: 2026-09-26
---

# Decide whether the agentic-practices talk presents at a venue, and trim for it

why now   — the talk (PR #2361) is the deck `venue:` was built for, and it went back to scale 1
            because STEP made it pulse. At a venue it now renders every slide at the venue size, and
            the slides too full for it clip until they are trimmed or split. The
            owner put this question on hold on 2026-09-26.
where     — the talk's front matter and slides
            (engineering/decisions/2026-09-24-agentic-practice-audit/agentic-engineering-practices.md,
            on main once #2361 merges).
how       — measure the room: back-row distance ÷ projected image height. At 4.5 or less, keep
            `laptop`. Otherwise set the venue and trim or split the slides the export's
            `⚠ OVERFLOW` line names (a venue is a fixed size since 2026-09-27; nothing steps down).
            Measured 2026-09-27 on the 74-slide version from #2361: huddle clips 17 pages
            (4, 6, 20, 27, 31, 38, 45, 47, 48, 49, 52, 57, 59, 68, 69, 70, 73), conference 31,
            hall 47. The Studio's clip notice splits a slide in one click.
done when — the owner has picked a venue (or laptop), and the talk renders at it in one size with
            no clipped pages.
evidence  — the rendered PDF, light and dark, and the export's OVERFLOW line (empty).
verify    — tier 0: `lint:deck --strict` plus looking at every page; content edits are the owner's
            to review.
