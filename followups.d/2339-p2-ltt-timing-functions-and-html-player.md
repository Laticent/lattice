---
origin: 2339
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2339
---

# Build LTT step 2: `positionAt` / `timeline` and the HTML player reading the packed LTT

why now   — the first production caller of the format (guardrail G2), and the prerequisite
            for video export; blocked on P1 (`2339-p1-ltt-package-spec-and-drift-fix.md`).
where     — engineering/decisions/2026-09-24-lattice-timing-track.md §4.3–§4.5, §5 and §8
            step 2; `lib/export/player-core.mjs` (`narrationBlocks`, `speakSlide`,
            `nextCue`, `endSlide`, `capKernel`); `test/unit/export/inlinable-kernels.test.js`.
done when — conformance fixtures pin the player's current timing (no hold on slide 1, one
            arrival hold on every later slide, `hold` segments, breaths including the one
            after a slide's last sentence, silent-cue holds, lead trim); `makeCursor` moves
            whole into `ltt`; the player embeds the packed LTT and drives its crawl from
            `positionAt`; the fixtures pass against the INLINED, MINIFIED copy; `isStale`
            lands with callers in the export pipeline and the Studio (G3).
evidence  — a representative narrated demo deck exported to HTML in dark AND light mode,
            sent via SendUserFile, played end to end in a real browser; the fixture run.
verify    — tier 2 adversarial trio, because it changes exported bytes and the player's
            transport. EXPORT-BYTES change: stops for the owner's sign-off.
