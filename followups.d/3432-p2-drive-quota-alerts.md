---
origin: 3432
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-22-local-first-drive-storage.md §6.3
deferred: blocked — alert policies live in the owner's Google Cloud console, which no session can reach
---

# Alert the owner on Drive API quota use, somewhere other than email

why now   — Every user's Drive calls count against one Cloud project. The owner wants to see usage climb before a
            limit or a future charge, without watching an inbox.
where     — Google Cloud console → Monitoring → Alerting, on the project that holds the Lattice OAuth client ID. The
            metric is `serviceruntime.googleapis.com/quota/rate/net_usage` for `drive.googleapis.com`. Usage is also
            visible under APIs & Services → Google Drive API → Metrics and Quotas.
done when — Alert policies fire at 50% and 80% of the per-minute project quota (1,000,000 units) and of the daily
            billing threshold (400,000,000 units), and at 50% of the daily egress (1 TB). They notify a channel that
            is not email: the Google Cloud mobile app's push notifications, Slack, or SMS.
evidence  — A test notification received on the chosen channel, with its date written here.
verify    — Lower one threshold far enough to fire on today's usage, confirm the push arrives, then restore it.
