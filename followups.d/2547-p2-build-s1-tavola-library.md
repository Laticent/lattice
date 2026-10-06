---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Build S1: Tavola, the roster-gated collaboration library

why now   — S2 (link, lobby, knock, co-editing: the "share a link and we're in"
            moment) cannot start without it.
where     — new sibling library `docs/src/lib/tavola/` (`@laticent/tavola`), its
            Trystero adapter `adapters/trystero.ts`, and `checkTavolaBoundary` in
            `tools/check-ownership.js`; governing note
            `engineering/decisions/2026-10-06-studio-live-collaboration.md` §4.4, §6, §7.1.
done when — Tavola carries y-protocols sync + awareness over an injected transport,
            sends and accepts nothing for ids off the host's roster, enforces the
            4-person cap, has a package.json/README like its siblings, a boundary gate
            that admits only the Trystero adapter's import, and protocol tests on an
            in-memory transport (no network from tests or CI).
evidence  — the in-memory protocol suite (admit, deny, roster refusal, cap,
            rotation), plus a Playwright run of 2–4 Chromium contexts through the
            Trystero adapter; both logs in the PR body.
verify    — tier 2 adversarial trio, because it is novel, security-relevant, and puts
            third-party relays in the path (HARD RULE #25).
