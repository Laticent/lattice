---
origin: 2959
priority: P1
recorded: 2026-10-29
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §5
deferred: blocked — the fix is either a skip on CI or a CI job change, and both are the owner's call (❓ D1 on PR 2959)
source: https://github.com/Laticent/lattice/pull/2959
---

# Firefox cannot open a WebRTC connection on GitHub's runners

```text
  P1 · [no ticket] make filo-live.spec.ts connect in Firefox on the GitHub runner
       why now   — seven runner probes (runs 40807145457 to 40819691890, 2026-10-29) pass
                   in Chromium and WebKit and fail in Firefox only. Firefox's own log
                   (MOZ_LOG nicer) names the cause: "UDP socket error: Internal error at
                   UDPSocketParent.cpp:250", then "failed to find default addresses" and
                   "ICE FAILED: Couldn't gather ICE candidates", on every connection.
                   Locally the same spec passes 6 of 6 in all three engines.
                   Tried and not enough: mDNS off, loopback and link-local candidates on,
                   the socket process and its sandbox off, a held fake microphone.
       where     — docs/e2e/filo-live.spec.ts (sessionBrowser); the studio-e2e-nightly job
       done when — a runner probe of filo-live is green in all three engines, or the
                   owner has chosen to run the Firefox arm off CI with its reason.
       evidence  — the probe run link.
       verify    — tier 1 checker, because it touches CI.
```
