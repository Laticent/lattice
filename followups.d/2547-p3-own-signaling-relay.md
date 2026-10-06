---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Run a Nostr relay we control: for CI, and as an option for self-hosting

why now   — real two-browser tests run only on demand over public relays (tools/live-session-check.mjs), so they cannot run in CI; and a company cannot allowlist one domain for signaling. A relay we control fixes both (roadmap §2, step 1).
where     — docs/src/lib/tavola/adapters/trystero.ts already takes relayUrls; a CI job would start a local relay (for example nostr-rs-relay in a container) and point the check at it.
done when — the live-session-check runs against a local relay in a CI job, and the Studio can be configured with a relay URL.
evidence  — a green CI job that drives two browsers through the relay. Adding a CI job is the owner's call (CLAUDE.md second filter).
verify    — tier 1 checker.
