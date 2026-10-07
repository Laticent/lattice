---
origin: 2579
priority: P2
recorded: 2026-10-07
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md §12.2
source: https://github.com/Laticent/lattice/pull/2579
---

# A per-person High fidelity switch for calls

why now   — the owner chose per-person quality (2026-10-07, design note §12.2): 64 kbit/s voice by default, and a switch for music or demos that turns voice processing off (echoCancellation, noiseSuppression, autoGainControl) and sends 128 kbit/s stereo.
where     — docs/src/components/studio/live/live-audio.ts (getUserMedia constraints; applyConstraints or a re-capture), CALL_BITRATE / session.setMedia(stream, { maxBitrate }), Tavola's sender params (stereo needs the Opus fmtp `stereo=1`, which Trystero does not expose: check before promising stereo), LivePanel.tsx microphone picker menu.
done when — the microphone menu has "High fidelity (music)", which re-sends at 128 kbit/s with processing off and says headphones are needed to avoid echo.
evidence  — the probe's 14 kHz tone and noise-floor numbers with the switch on and off; send rate from getStats.
verify    — tier 1 checker (it changes what reaches every listener).
