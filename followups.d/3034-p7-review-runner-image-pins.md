---
origin: 3034
priority: P7
recorded: 2026-11-05
area: infra
severity: low
swimlane: engineering/development.md § Platform suites
deferred: blocked — a review is due each quarter, and GitHub's runner-image retirement notices set the deadline
---

# Review the pinned runner images each quarter

Since 2026-11-05 every workflow names its runner image (`ubuntu-24.04`, `macos-26`, `windows-2025`) and `checkRunnerPins` rejects
`-latest`. Dependabot does not bump runner labels, so nobody moves them unless someone looks. Each quarter, or when GitHub announces
a retirement for one of these images (github.com/actions/runner-images, "deprecation"), move to the newer image in one PR: check the
Playwright pin supports it (engineering/gotchas/ci.md, the ubuntu 26.04 entry), and that the iOS suites' Xcode is still a 26.x
(docs/scripts/ios-safari/run.sh refuses Xcode 27).

done when — this file is replaced by a dated review note (and a new p-file for the next quarter), or by a scheduled reminder.
