---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Build S1: the roster-gated Yjs provider over Trystero

why now   — S2 (link, lobby, knock, co-editing: the "share a link and we're in"
            moment) cannot start without it.
where     — new `docs/src/components/studio/collab/`; local test relay
            `tools/collab-signal-dev.mjs`; governing note
            `engineering/decisions/2026-10-06-studio-live-collaboration.md` §4.4, §6, §7.
done when — a provider carries y-protocols sync + awareness over Trystero data
            actions, sends nothing to ids off the host's roster, enforces the 4-person
            cap, and has protocol tests that run against the local relay only (no
            public relay traffic from tests or CI).
evidence  — a Playwright run with 2–4 Chromium contexts on the local relay: admit,
            deny, roster refusal, sync, cap; the run's log in the PR body.
verify    — tier 2 adversarial trio, because it is novel, security-relevant, and puts
            third-party relays in the path (HARD RULE #25).
