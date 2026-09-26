---
origin: 2361
priority: P2
recorded: 2026-09-26
---

# Decide whether the agentic-practices talk presents at a venue, and trim for it

why now   — the talk (PR #2361) is the deck `venue:` was built for, and it went back to scale 1
            because STEP made it pulse. Under the one-size rule it now renders uniformly, but at
            `venue: conference` every slide lands at 1x until its densest slides are trimmed. The
            owner put this question on hold on 2026-09-26.
where     — the talk's front matter and slides
            (engineering/decisions/2026-09-24-agentic-practice-audit/agentic-engineering-practices.md,
            on main once #2361 merges).
how       — measure the room: back-row distance ÷ projected image height. At 4.5 or less, keep
            `laptop`. Otherwise set the venue and trim the slides the export's `↓ SCALE` line names.
            At `venue: conference` on 2026-09-26: for 1.15x, trim pages 4, 6, 21, 28, 39, 46, 48,
            51, 53, 55, 64, 65, 66, 69; for 1.3x, also 2, 9, 11, 23, 32, 33, 34, 37, 40, 42, 47,
            58, 67, 70.
            Update 2026-09-26: the owner says the talk will be given in a huddle room. At
            `venue: huddle`, after the blank slide 10 was removed and five slides were polished,
            the export asks to trim pages 4, 6, 20, 27, 31, 38, 45, 47, 50, 54, 56, 65, 66, 67 and
            70 for 1.15x. `lint:deck` flags 17 slides with `capacity-scale`, mostly five-item
            lists (a list holds about 3 items at huddle size) and the four long kit code pages.
            The conference page numbers above predate that removal and are one too high past
            page 9.
done when — the owner has picked a venue (or laptop), and the talk renders at it in one size with
            no clipped pages.
evidence  — the rendered PDF, light and dark, and the export's SCALE line.
verify    — tier 0: `lint:deck --strict` plus looking at every page; content edits are the owner's
            to review.
