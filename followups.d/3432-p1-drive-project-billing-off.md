---
origin: 3432
priority: P1
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-22-local-first-drive-storage.md §6.3
deferred: blocked — a setting in the owner's Google Cloud console, which no session can reach
---

# Keep the Drive OAuth project's billing account unlinked

why now   — Google plans to bill Drive API use over a daily threshold "later in 2026", with at least 90 days'
            notice and no prices yet. With no billing account on the project that owns Lattice's client ID, going
            over quota should make calls fail with 403 or 429, which the sync engine backs off from, rather than
            charge the owner. That is unconfirmed until Google publishes its billing terms (see `done when`).
where     — Google Cloud console → Billing → the project that holds the Lattice OAuth client ID ("Account
            management" / "Link a billing account"). The design's §6.3 "Quotas and cost" has the numbers.
done when — The owner has confirmed the project shows "This project has no billing account", and has written down
            here who may link one and when. When Google publishes the billing details, someone re-reads them and
            records here whether an unlinked project is still throttled rather than billed.
evidence  — A screenshot of the project's billing page, kept by the owner (it names the project, so it stays out of
            the repo), and a dated line in this file.
verify    — The owner opens the billing page again after Google's billing announcement and confirms the project is
            still unlinked and the rule still holds.
