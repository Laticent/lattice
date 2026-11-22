---
origin: 3216
priority: P1
recorded: 2026-11-17
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §6.2
deferred: off-path — the landing page's hero preview in an old engine, not the old-browser notice; it hangs with the notice skipped too
source: https://github.com/Laticent/lattice/pull/3216
---

# In Chromium 101 a second navigation right after the landing page loads never fires `load`

```text
  P1 · [no ticket] find what keeps the landing page's `load` from firing on a quick second visit in Chromium 101
       why now   — Found while verifying #3216 on real Chromium 101 (playwright-core 1.21): `goto('/')` loads,
                   but a `goto` straight after it (to `/` or `/?lob-debug`) times out at 15 s waiting for `load`.
                   Requests still pending at the timeout were the hero preview's Playground assets
                   (`/playground/v/<hash>/newcomer/light/`, `/playground/v/<hash>/themes/lattice.css`), which the
                   server answers in under 40 ms by curl. NOT caused by #3216: the same hang at c01d5eb without the
                   day's changes, with the service worker removed, and with the old-browser notice skipped (the
                   "Continue anyway" flag set before load). A 1.5 s pause between the two visits makes it pass.
                   Current Chromium 153 passes the same sequence.
       where     — the landing page's HeroPreview island (docs/src/components/landing/), the runtime it boots in an
                   about:srcdoc frame, and the service worker's precache (docs/public/sw.js).
       done when — the cause is named and either fixed or shown to be a Chromium 101 + headless artifact a reader
                   never meets (the page itself renders; only `load` stays pending).
       evidence  — scratch scripts nav.js / nav-nosw.js / nav-cont.js from the #3216 session, re-creatable from
                   this description.
       verify    — the same two-visit sequence in Chromium 101, with and without the fix.
```
