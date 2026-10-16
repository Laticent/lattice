---
origin: 2436
priority: P2
recorded: 2026-09-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-27-guide-in-the-exported-player.md
source: https://github.com/Laticent/lattice/pull/2436
---

# Play a narrated export's Guide on Safari/iOS, and a `lattice video` MP4 in PowerPoint and Keynote

why now   — #2436 put Present's Guide into every narrated HTML export (on by default) and made
            `lattice video deck.md` a one-command path to an MP4. Both were verified in Chromium only.
            Safari is a real risk for the export: the Guide bundle runs inside the player's one
            CSP-hashed script, guarded by its own try, so an engine that cannot run it loses the Guide
            and keeps the player; an iPhone already showed the Guide's underline overshooting its text
            in the Studio (followups.d/2393-p2-ios-underline-and-phone-cursor.md). PowerPoint and Keynote
            are where a board deck's video ends up, and neither has been tried; the `.vtt` sidecar is the
            stated fallback for captions.
where     — lib/export/player-core.mjs (the Guide's hooks), lib/export/guide-player-bundle.generated.mjs,
            docs/src/lib/vetrina/stage.ts; lib/export/video.mjs + lib/export/tx3g.mjs for the MP4.
done when — (a) the Q3 fixture's narrated export plays on a real iPhone and in Safari on macOS with the
            Guide focusing as in Chromium, or each difference is filed; (b) its MP4 plays in PowerPoint
            and Keynote with sound in sync and the captions either offered or attached from the `.vtt`.
evidence  — screen recordings or photos from each real device and app, with its version.
verify    — tier 0; this is observation on real surfaces, not a code change. A fix it finds gets its own tier.
