---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# panes still fail on three surfaces: the player's article view, Export-to-Marp, and Present's split

why now   — verified by the pane-follow-ups PR (artifacts in its body), examples/panes.md renders
            legibly on the CLI PDF, the PPTX (one image per slide), the image set (.zip), the
            player's Present view, and the Studio at 1440, 820 and 390px (docs/e2e/
            pane-split-index.spec.ts). Three surfaces are still open:
            - the player's Read · Article view draws a CHART pane unstyled: black bars and
              labels at several times their size, where a chart slide in the same article is
              styled. Present and Read · Slides are fine. Reproduced on main (pre-existing): a
              deck of one `bar` slide and one `bar` pane, `--player`, Read · Article.
            - Export-to-Marp cannot carve a pane (marp-core has no carve); it should degrade to
              the two panes' content, stacked, and a pane marker must not become a Marp speaker
              note. Changes exported bytes: dark + light renders go to the owner for sign-off.
            - the Studio's Present overlay (PresentOverlay.tsx) shows a split panes slide's FIRST
              pane only: its navigation has no page step. The editor preview's map
              (pane-pages.ts `paneSplitCounts`) and page step (StudioShell `stepDeck`) are the
              pieces to reuse.
            And a nit: the Studio slide strip labels a panes slide "text".
where     — the player's article projection (flat sheet + its chart handling: lattice-emulator.js
            --player, lib/export/cli-deck-sheet.js flat mode), lib/core/marp-bundle.js /
            tools/export-marp.js, docs/src/components/studio/PresentOverlay.tsx, lint.ts slideClass.
done when — each renders examples/panes.md legibly (or degrades as stated), with an artifact per
            surface (HARD RULE #23).
evidence  — decision note §4 "Not verified"; the pane-follow-ups PR body.
verify    — `--player`, Read · Article, on examples/panes.md; the Marp bundle rendered with
            marp-cli; Present on a 9:16 panes deck stepping into the second pane.
