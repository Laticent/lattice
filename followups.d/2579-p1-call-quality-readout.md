---
origin: 2579
priority: P1
recorded: 2026-10-07
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md §12.2
source: https://github.com/Laticent/lattice/pull/2579
---

# Show each person's call quality: loss, jitter, bitrate

why now   — on the owner's iPhone the call sounded choppy and quiet, and nothing on the page says whether that is the network (packet loss), iOS (WebKit bug 311451) or the bitrate. A readout makes the next device run diagnosable from a screenshot, as the connection readout did for paths.
where     — docs/src/lib/tavola/adapters/trystero.ts (getStats: inbound-rtp packetsLost, jitter, concealedSamples; outbound bytesSent), session.paths()'s shape, LivePanel.tsx person ⋯ menu beside "Connection".
done when — each person's ⋯ shows "Audio: 64 kbit/s · 0.4 % lost · 18 ms jitter" while both are on the call, and nothing when either is off it.
evidence  — the real-WebRTC probe (.scratch/audio-q/probe.mjs shape) shows the readout matching getStats; an owner screenshot from the iPhone.
verify    — tier 0 self-review with the gates.
