---
origin: 2583
priority: P3
recorded: 2026-10-07
area: infra
severity: low
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.2
source: https://github.com/Laticent/lattice/pull/2583
---

# golden-diff calls any package.json edit a dependency change, and reports main's stale goldens as the PR's

why now   — tools/golden-diff.mjs line 408 sets `depChange` when `package.json` changes at all. On
            #2583, whose only package.json edit is one `scripts` line, that widened the render scope
            to a "shared change" and skipped the base render that separates "this PR moved it" from
            "stale on main", so the PR comment listed 46 changed slides. The same tool, run on the
            branch without that line, reported 0 goldens affected, and Segno's read.cjs (the only
            render input the PR touches) builds byte-identical before and after. A reviewer reading
            the comment would hold a PR that cannot move a pixel.
where     — tools/golden-diff.mjs `depChange` (and the render-scope rule that consumes it): compare
            the dependency fields (`dependencies`, `devDependencies`, `overrides`, the lockfile)
            rather than the whole file.
done when — a PR whose package.json diff touches only `scripts` gets the base render and the
            stale-on-main split, pinned by a unit test.
evidence  — #2583's golden-diff comment beside a local `node tools/golden-diff.mjs --render-affected`
            run on the same tree without the scripts line.
verify    — tier 0 gates.
