---
origin: 2871
priority: P1
recorded: 2026-10-23
area: engine
severity: high
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §9
source: https://github.com/Laticent/lattice/pull/2871
---

# Red-team the web-reference scanners in `lib/core/remote-ref.js`

why now   — #2871 rewrote how `blockWebImages` and `blockWebCss` read CSS and HTML, after 23
            spellings of a web fetch got past the old regex scans (HARD RULE #22). The fix was
            checked by unit tests, a Chromium network-log tier and the real Studio Reading view.
            Its red-team lens never ran: the hostile pass was stopped three times before it ran
            a single probe. Every spelling it tests today is one the maker found, so nothing
            has tried to break the new tokenizer from outside.
where     — lib/core/remote-ref.js (`cssRefSpans`, `scanHtml`, `verifyWithParser`,
            `decodeEntitiesMapped`); the payload table is test/fixtures/web-ref-beacons.js.
done when — an independent pass has tried new spellings against the merged scanners in
            Chromium, and each one that fetches has a fix and a row in the payload table, or
            the pass reports none after covering the classes listed in the evidence README.
evidence  — the probe's per-payload table (control fetches, rewritten does not) for every
            new spelling tried, with the commit it ran against.
verify    — tier 2: the integration tier `test/integration/invariants/web-ref-beacon.test.js`
            and `docs/e2e/read-article-beacons.spec.ts` green with the new rows in the table.
