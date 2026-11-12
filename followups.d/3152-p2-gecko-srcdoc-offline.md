---
origin: 3152
priority: P2
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/gotchas/browser-engine.md
deferred: large — a preview-builder design change at the HARD RULE #22 sink, with its own trio review
source: https://github.com/Laticent/lattice/pull/3152
---

# Offline on Firefox, the Studio preview frame loads nothing

why now   — PR #3152 registered studio-warm-offline.spec.ts's "never rendered online" case on `@gecko` and
            `@webkit-tablet`. WebKit and desktop Chromium pass. Firefox is `test.fixme` (the line above it says why):
            offline, the preview frame never loads `playground/v/<hash>/lattice-runtime.js`, so nothing in the
            preview hydrates.
cause     — Gecko gives a `srcdoc` frame its parent's service-worker controller but never routes the frame's requests
            through the worker. Four probes, offline after a controlled online session (2026-11-12):
            1. the runtime IS in the worker's cache;
            2. the frame reports `navigator.serviceWorker.controller` set;
            3. `fetch(runtimeUrl)` from inside the frame fails for every cache mode (default, no-cache, reload, no-store);
            4. the same URL fetched from the top page returns 200 from the worker. `page.goto` in place of a reload
               changes nothing.
            Write-up: engineering/gotchas/browser-engine.md ("Firefox: offline, a Studio preview frame loads nothing").
where     — the preview builders that write the frame's `srcdoc` (runtime `<script nonce src>`, theme sheets, fonts):
            the parent, whose fetches the worker serves, supplies those bytes instead of the frame loading them by URL.
            It is a HARD RULE #22 preview-builder sink (`SANCTIONED_PREVIEW_BUILDERS`), so it gets the adversarial trio.
done when — the fixme in docs/e2e/studio-warm-offline.spec.ts (`diagramDrawsOffline`, `browserName === 'firefox'`) is
            removed and the case passes on `--project=gecko --retries=0`, 10 runs alone and under load.
evidence  — that run, and the trio's report on the builder change.
verify    — cd docs && npx playwright test e2e/studio-warm-offline.spec.ts --grep 'never rendered online' --project=gecko
