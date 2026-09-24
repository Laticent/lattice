---
origin: 2347
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2347
---

# The exported player stops narrating when a clip fails to decode, instead of falling back

why now   — engineering/ltt.md transport rule 4 makes the fallback normative, and step 2's
            timeline and step 3's video renderer will follow the spec, not the player. Until the
            player is fixed, the two disagree on every deck with a clip the browser cannot decode.
where     — lib/export/player-core.mjs `nextCue` (~line 1900–1911): `a.onerror` starts the
            estimate fallback, then the rejected `a.play()` promise (`NotSupportedError`) runs the
            autoplay-refusal branch (`setPlaying(false); stopAudio(); clearCaption()`), which
            clears that fallback. The decode path also never sets `silentFrom`, so the crawl
            would not run on the estimate even if the fallback survived.
done when — a clip that fails to decode shows its caption, crawls on the estimate, holds
            `max(300, d||900)` ms and advances, exactly as a cue with no clip does; the autoplay
            refusal path still stops; a test drives a corrupt data-URI clip in a real browser.
evidence  — the PR #2347 checker's repro: a buildPlayerHtml export whose first cue carries
            `data:audio/wav;base64,UklGRg==`, clicked in headless Chrome 131 — `aria-pressed`
            false from the first sample, caption empty, never leaves slide 0.
verify    — changes export bytes: stops for the owner's sign-off on a demo deck in dark and
            light mode (CLAUDE.md §Quality Bar).
