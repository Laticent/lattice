---
origin: 2771
priority: P3
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2771
---

# The CLI builds file URLs by string concatenation, which is not valid on Windows

why now   — `lattice.js` loads its output page with `page.goto('file://' + path.resolve(outHtml))` (and the same shape at its other
            navigations). On Windows that gives `file://C:\…`, not `file:///C:/…`. The `export-confine` platform suite therefore lists
            macOS only (a Windows leg would fail on this, not on the confine code). Until the CLI renders on Windows the platform-suites
            registry cannot carry a Windows leg for any CLI-render suite.
where     — `lattice.js` `page.goto` calls (search `'file://' +` and `` `file://${`` ``); any other string-built `file:` URL in `lib/export/`.
done when — each uses `pathToFileURL(...).href`; a Windows leg is added to a CLI-render suite in `.github/platform-suites.json` and runs
            green on `windows-latest`, or the entry records what else still blocks it.
verify    — dispatch `platform-suites` with a Windows suite and read the run.
---
