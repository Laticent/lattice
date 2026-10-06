---
origin: 2504
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2504
---

# Icons phase 2, the rest: `icon=` and `icon-only` on hub-spoke

why now   — the flowchart and the state chart take icons (engineering/decisions/2026-09-29-inline-icons.md
            § 13). Hub-spoke is the third chart § 5.3 names, and the Studio picker (phase 3) offers what
            the charts accept.
where     — lib/core/hub-spoke-model.js reads a row's pills, where a bare `{icon=x}` span is already an
            icon-only PILL, so the spelling needs deciding first: `icon=` inside the row's existing record,
            or a hub-spoke reading of the pill. Then lib/components/chart/hub-spoke/hub-spoke.transform.js
            (server-built SVG, no harness): the icon inside the disc, knocked out of the disc's fill, sized
            from its radius; `icon-only` drops the label from the placer and keeps it as the disc's title.
            The manifest declares `"plugins": { "optional": ["icons"] }`; the drawing comes from
            lib/components/chart/_chart-family/graph-icons.js's host call.
done when — a hub or spoke draws its icon; `icon-only` keeps the name as the accessible name and title; every
            geometry invariant in hub-spoke.transform.js's header still holds; the hub-spoke gallery renders
            byte-identical with no icon written.
evidence  — a demo slide rendered light and dark; the gallery diff.
verify    — tier 1 checker.
