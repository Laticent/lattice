---
origin: 2789
priority: P2
recorded: 2026-10-21
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md
source: golden-diff job 119030836730 on #2826, cancelled at its 25-minute timeout
---

# `golden-diff` renders every changed deck with no cap, so a PR that edits many decks times out

why now   — `affectedGoldens` (tools/lib/golden-affected.mjs) caps gallery renders at 40 but adds every changed deck markdown to `decks` uncapped, and `golden-diff` renders each against the base. #2826 edits about 130 decks (it removed 232 retired `_paginate` lines), so the job printed its base line and then ran silent until the 25-minute timeout cancelled it, on CI and locally (28 min, `timeout` exit 124). No comment posts, so the demo deck's PDF is not linked (HARD RULE #9) and the nightly bless's rule 4 sees none of those decks as shown.
where     — tools/lib/golden-affected.mjs `affectedGoldens`: spend what the galleries leave of the cap on decks, new decks first (a PR's own demo deck), and report the rest as omitted, as galleries are; tools/golden-diff.mjs prints a progress line per render so a slow run is not a silent one.
done when — a PR that changes 130 decks finishes `golden-diff` inside its timeout, links its new deck's PDF, and lists the decks it left to the nightly bless.
evidence  — the job's wall time on such a PR before and after, and the comment it posts.
verify    — tier 1 checker; it changes what the per-PR job renders, which rule 4 of the nightly bless reads.
