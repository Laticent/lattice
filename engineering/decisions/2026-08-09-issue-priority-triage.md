---
status: proposed
summary: A priority pass over the 156 open issues, run against the actual CI record rather than the issue text. Three corrections change the order. (1) The Studio E2E nightly has been red for 30 consecutive nights and, since 2026-08-05, has not run a single test — its Playwright webServer dies at startup because the workflow installs only `docs/` dependencies while `lib/core/boundary-parser.mjs` resolves `markdown-it` from the repo root. Nothing tracks this; the six filed spec-level cards describe the earlier era and cannot be confirmed or closed while the suite is dark. (2) Three `priority:high` cards — #683, #793, #732 — are rolling nightly markers whose gates have been green for 6–8 straight nights; they are the #441 pattern the 2026-06-26 triage already closed once, and they inflate the high band by 15%. (3) 65 of 156 cards (42%) carry no priority axis at all, so "work the queue by priority" currently addresses under 60% of it. Recommended order: restore the signal, close the false highs, then security (#1246, #1458, #617), then the one critical card (#1437), then the crashes, then the silent-wrong-output cluster. Recommendation only — no tracker changes applied.
---

# Issue queue: a priority pass against the CI record (2026-08-09)

**Why:** the open queue is at **156** and the `priority:` axis is the only
ordering anyone has. Before working it top-down, the labels themselves need to
be true. This pass checks the highest cards against what CI actually did over
the last 30 nights, rather than against what each issue says.

Method: read every open card's labels, then verify the load-bearing claims —
"failing on main", "red", "regression detected" — against the workflow run
history and job logs. Three of the checks came back different from the label.

---

## The queue as labeled

| Band | Cards |
|---|---|
| `priority:critical` | 1 (#1437) |
| `priority:high` | 20 |
| `priority:medium` / `priority:low` | ~70 |
| **no priority axis** (`needs:triage`) | **65** |

The last line is the headline for anyone planning to work by priority: **42% of
the queue is invisible to that ordering.** `BACKLOG.md`'s last sync counted 58
untriaged against 141 open; both numbers have grown since.

---

## Correction 1 — the Studio E2E nightly is dark, and nothing tracks it

**The suite has failed 30 nights running** (every run back to 2026-07-11, the
full window the API returns). That much is visible from the board. What is not
visible is that the failures split into two different eras:

| Era | What happens | Evidence |
|---|---|---|
| → 2026-08-04 | Tests **run** and some fail | 2026-08-03 run uploads a **1.78 GB** trace/video artifact |
| 2026-08-05 → now | Tests **never start** | 2026-08-09 run dies 2s into the step, uploads **199 KB** |

The current failure is not a spec failure at all:

```
[WebServer] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'markdown-it'
            imported from /home/runner/work/lattice/lattice/lib/core/boundary-parser.mjs
Error: Process from config.webServer was not able to start. Exit code: 1
```

**Cause.** `studio-e2e-nightly.yml` runs `npm ci` with
`working-directory: docs` only — the repo-root dependencies are never
installed. That was survivable while the docs dev server imported nothing from
outside `docs/`. It stopped being survivable on 2026-08-05, when `fc75546`
(#1433) landed `lib/core/boundary-parser.mjs`, which imports `markdown-it`.
Node resolves that from the importing file's own directory upward —
`lib/core/` → `lib/node_modules` → `<root>/node_modules` — and never consults
`docs/node_modules`. `markdown-it` being present in `docs/package.json` is why
this reads as impossible at a glance, and why it is worth writing down: the
package is installed, just not anywhere the importer can see it.

**Consequence for this priority pass.** Six open cards describe specs failing
in the *first* era — #1493, #1424, #1208, #1315, #1426, and #1471. None of
them can be confirmed, fixed, or closed until the suite runs again, and one of
them (#1493, filed 2026-08-09) describes a run that could not have happened
that night. They are not independently workable items right now; they are one
blocked cluster behind one workflow fix.

This is the single highest-leverage item in the queue and it had **no issue**.
Per HARD RULE #18 a defect found off-path gets logged rather than carried in a
doc, so it is now **#1498**.

## Correction 2 — three `priority:high` cards are stale nightly markers

The nightly workflows open **one rolling self-labeled issue** off a title
marker and append to it; the step is skipped when green, and nothing closes the
issue when the gate recovers. So a green gate leaves a `priority:high` card
sitting on the board forever. Current state:

| Card | Its claim | The gate, last 6–8 nights |
|---|---|---|
| #683 | `[integration-nightly]` render-regression tier failing on main | **green**, 6 for 6 |
| #793 | `[preview-e2e]` playground gallery preview fails to render | **green**, 8 for 8 |
| #732 | `[perf-nightly]` docs perf regression detected | **green**, 8 for 8 |

This is exactly the case the 2026-06-26 triage made for closing #441
("artifact, not a task… it self-reopens on a genuine sustained regression").
The same reasoning retires these three. Closing them removes **15% of the high
band** and, more usefully, stops three green gates from outranking real work.

Between corrections 1 and 2, the `priority:high` band's top entries were
pointing at three gates that are fine and away from the one that is broken.

## Correction 3 — the untriaged 42%

65 cards carry `needs:triage` with no `area:`/`type:`/`priority:`. Several are
plainly not low priority — #1463 (a tab crash), #1281, #1295, #1294 (Present
and navigation defects), #617 (zip-slip on filesystem-backed import), #680 (a
chart unreadable at presentation size). Ordering by priority silently buries
them. Cheapest durable fix is a labeling sweep, not a re-litigation of each.

---

## Recommended order

**P0 — restore the signal.** Nothing else in the queue can be trusted while the
only suite watching the Studio is dark.

1. **#1498** — add a root `npm ci` to `studio-e2e-nightly.yml`. Small,
   mechanical, and it is what makes items 2–3 knowable.
2. **Re-run, then re-triage the spec cluster** — #1493, #1424, #1208, #1315,
   #1426, #1471. Expect this to collapse: six cards, one dark suite, and at
   least #1493 duplicates #1424 + #1208 by construction.
3. **#1324** (docs suite flaky on main, ejecting unrelated PRs) and **#1328**
   (`studio.theme-depth` flakes and masks real failures) — the same family as
   1–2 and worth one window.

**P0 — bookkeeping, minutes, removes false highs.**

4. Close **#683**, **#793**, **#732**.
5. **#1491** — five Dependabot PRs that can never go green (astro 7 gated on
   Starlight). Permanently-red PRs in the merge train are noise the auto-merge
   class cannot clear itself.

**P1 — security.** All three put untrusted input on a same-origin surface that
holds a user's OpenRouter key.

6. **#1246** — Mermaid renders *after* `sanitizeSlideHtml`, so a diagram can
   put `javascript:` into the preview frame. This is a hole in HARD RULE #22's
   own gate, which is what lifts it above the other two.
7. **#1458** — untrusted theme CSS reaches the Studio preview.
8. **#617** — zip-slip / path traversal on filesystem-backed (desktop, CLI)
   `.lattice-*.zip` import.

**P1 — the one critical card.**

9. **#1437** Configure Release Pipeline. Labeled `priority:critical` and
   genuinely gating, but it gates *shipping*, not correctness — which is why it
   sits behind a live XSS and behind restoring CI, not ahead of them.

**P2 — user-facing and broken.** Ordered by whether the user loses work.

10. **#1463** scrolling the add-slide gallery during search crashes the tab.
11. **#1281** reshape broken · **#1295** Present screen · **#1294** navigation ·
    **#1284** autocomplete · **#680** quadrant chart unreadable at size.

**P2 — silent wrong output.** These ship a wrong artifact with no error, which
is the failure mode least likely to be caught downstream.

12. **#1388** a BOM'd deck exports in the wrong palette; a CRLF deck emits a
    CRLF `.md`.
13. **#1406** a relative `logo:` resolves against the output directory, so
    every out-of-tree render silently drops the logo.
14. **#1350** structured comment pragmas leak into every exported
    presenter-notes field.
15. **#1430** 14 base `:root` tokens override the palette's curated values on
    the export path.

**P3 — contrast and a11y correctness.** #1411, #1412, #1348, #1410, #1457 —
one theming window; they share the categorical-token contract.

**P3 — engine and infra debt that buys a gate.** #1442, #287, #1364, #1459.

**P4 — the remainder**, as labeled today.

---

## Recommended actions (gated — nothing here is applied)

1. ~~File the studio-e2e-nightly break as its own card~~ — **done, #1498**
   (`area:infra` · `type:fix` · `priority:high`). Fix it first.
2. **Close** #683, #793, #732 with a one-line note pointing at the green runs
   and at #441's precedent.
3. **Label sweep** over the 65 untriaged cards so the priority axis covers the
   whole queue.
4. **Re-triage** the six-card studio-e2e cluster once the suite runs, expecting
   to close or merge most of it.

Steps 2–4 mutate the tracker and are the human's call. Step 1 is logging a
defect found off-path, which HARD RULE #18 already dictates.

## What would make this pass unnecessary next time

Both corrections have the same root: **a card's claim outlived the condition
that produced it, and nothing re-checked it.** The rolling nightly markers
never close on green, and a "failing on main" card stays authoritative-looking
for a month. Two cheap options, neither adopted here:

- have the nightly workflows **close** their rolling issue on a green run, the
  way they open it on a red one; and
- **date-stamp** the claim in `[…-nightly]` card titles, so a stale one reads
  as stale on the board.
