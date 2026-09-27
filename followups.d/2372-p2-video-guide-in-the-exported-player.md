---
origin: 2372
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# The Guide's gestures in the exported player, so the video gets them (fork 8)

The owner ruled on 2026-09-27 (video note §6, fork 8): bring the Guide into the exported player.

why now   — the owner expects the video to gesture as Present does, and only this delivers it.
where     — docs/src/components/studio/present-guide.ts → a shared kernel the player inlines
            (lib/export/player-core.mjs), the way it inlines positionAt; the capture then records it.
done when — a new decision record states the kernel's boundary and cost; an exported deck and its
            video both gesture where Present does; asides still hide the Guide (#2371).
evidence  — the same sentence's pointer in Present, the HTML export and the MP4; dark + light
            exports for sign-off (export bytes change).
verify    — adversarial trio: new engine surface in every narrated export.
