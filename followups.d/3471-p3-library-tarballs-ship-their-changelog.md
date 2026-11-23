---
origin: 3471
priority: P3
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §11
deferred: blocked — the three manifests left (markup, lastra, segno-markdown) are being edited by #3451 and #3256 before the Wed Nov 25 freeze; #3471 did the other nine
source: https://github.com/Laticent/lattice/pull/3471
---
# Ship markup's, lastra's and segno-languages' CHANGELOG.md in their npm tarballs

why now   — `changeset version` writes docs/src/lib/<name>/CHANGELOG.md, and npm 10 packs it only when the
            package's `files` lists it. #3471 added it for nine libraries; these three were mid-edit in other PRs.
where     — the `files` array of docs/src/lib/{markup,lastra,segno-markdown}/package.json (segno-markdown is
            @laticent/segno-languages after the Segno rename).
done when — `npm pack --dry-run -w <each>` lists CHANGELOG.md, and the root CHANGELOG.md drops its "three
            libraries" exception.
evidence  — the three dry-run listings.
verify    — tier 0 gates, because it adds one file per tarball.
