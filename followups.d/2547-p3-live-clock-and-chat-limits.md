---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Live session clock and chat: the limits the inversion review logged

why now   — round 3 of the adversarial review listed limits that do not bite at four people and minute-resolution times, but should not be forgotten:
            1. The 5-sample clock window is measured with `Date.now()`; a device clock step (NTP) leaves stale offsets in it for up to ~2.5 min.
            2. On a slow relay the offset error is up to half the round trip (it only matters for the cross-device "editing" mark).
            3. Catch-up returns at most the last 500 lines (`CHAT_KEEP`), and the host re-seals the whole chat on every line.
            4. Notes stamped before the first clock sample keep the device clock's time.
            5. Leave closes the transport 300 ms after the goodbye; rejoining the same room inside that window is unconfirmed safe.
where     — docs/src/lib/tavola/session.ts (clock), docs/src/components/studio/live/live-controller.ts (chat, notes, leave).
done when — each is either fixed (monotonic `performance.now()` for the round trip; incremental seal; re-stamp early notes) or written into the design note as an accepted limit.
evidence  — a unit test per fix.
verify    — self-review with the gates.
