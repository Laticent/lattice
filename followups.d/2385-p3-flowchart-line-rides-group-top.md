---
origin: 2385
priority: P3
recorded: 2026-09-26
---

# A flowchart line past the work budget can run along a group's title band

why now   — On the typing test deck's Services slide (17 shapes, compact, past
            `solveRoutes`' BUDGET), `Fraud -review-> Checkout` leaves Fraud upward and
            runs 19 units inside the Payments group's top edge, through its title band
            but clear of the title. At that chart's scale it reads as a doubled border.
            #2385 found it and left it: it predates the title-band fix there, and no
            quality count sees it.
where     — lib/components/chart/_chart-family/graph-layout.js: `solveRoutes` costs a
            run along a band only when it leaves the title no slot; nothing charges a
            run that rides a group border it does not cross.
done when — a run parallel to a group's border within its title band (or within ~6 of
            the border) costs enough that the Services chart routes `review` another
            way, a `measureQuality` count holds it to zero across the unit gallery,
            and the dense-chart fuzz stays within budget.
evidence  — the Services chart from the typing test deck: route points
            [1360,54.9]→[1360,25]→[932.5,25]→[932.5,278.4]; Payments group top y=6.
verify    — render the Services slide and look; `node --test
            test/unit/components/graph-layout.test.js`.
