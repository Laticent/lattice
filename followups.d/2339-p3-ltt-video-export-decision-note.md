---
origin: 2339
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2339
---

# Write the deck-to-video export decision note (LTT step 3)

why now   — video export is the owner's stated goal and the reason the LTT is seekable;
            the encoder, muxer and frame rate were deliberately left out of the LTT note.
where     — engineering/decisions/2026-09-24-lattice-timing-track.md §5 (the video row),
            §8 step 3, §10 and §11; the headless Chromium already used by the export path.
done when — a decision note (status: proposed) choosing the encoder, muxer and frame rate,
            describing the simulated transport over `timeline` + `positionAt`, and stating
            what video export guarantees and does not (guardrail G5: no Anima motion, no
            mid-travel cursor position in 1.0), with the forks put to the owner.
evidence  — a measured spike: one short narrated deck rendered to MP4 plus `.vtt`, sent via
            SendUserFile, with the frame-accurate caption timing checked against the LTT.
verify    — tier 2 adversarial trio, because it brings a new external dependency (a muxer)
            and a new export surface.
