---
origin: 3471
priority: P3
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §11
deferred: blocked — four of the twelve library manifests (markup, lastra, segno-markdown, lente) are being edited by #3451, the Segno rename and #3456 before the Wed Nov 25 freeze
source: https://github.com/Laticent/lattice/pull/3471
---
# Ship each library's CHANGELOG.md in its npm tarball

why now   — `changeset version` writes docs/src/lib/<name>/CHANGELOG.md, but each library's `files` list
            omits it and npm 10 does not add it, so an npm reader of a library sees no changelog.
where     — the `files` array of each publish-set library's package.json.
done when — `npm pack --dry-run -w @laticent/<name>` lists CHANGELOG.md for all twelve, and CHANGELOG.md
            (root index) says each tarball carries its own.
evidence  — the twelve dry-run listings.
verify    — tier 0 gates, because it adds one file per tarball.
