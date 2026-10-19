---
origin: 2786
priority: P2
recorded: 2026-10-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2786
---

# `npm run build` aborts on Windows at `tools/check-ownership.js`

why now   — A `windows-latest` runner got through `npm ci` (so `tools/prepare.js` works there) but `npm run build` stopped with "build aborted:
            ownership guard failed" (platform-suites run 39197530212, job 117883739719). The gates build a repo-relative path with
            `path.relative(...)` and compare it to forward-slash allowlists (`SANCTIONED_HEX`, `SANCTIONED_PREVIEW_BUILDERS`,
            `SANCTIONED_SNAPSHOT_SINKS`, the OPEN_ROUTER_KEY sanctions) and report every entry "stale"; 76 call sites use `path.relative`
            and about half do not convert `\` to `/` (the rest do: `.split(path.sep).join('/')`). Nothing that needs a built CLI can run on
            Windows until it passes, which is why the Windows leg of `export-confine` is not in the registry.
where     — `tools/check-ownership.js` (`grep -n 'path.relative(' tools/check-ownership.js`); then re-add `windows-latest` to `export-confine`.
done when — `npm run build` is green on `windows-latest` and `export-confine` lists it, with the run linked.
            Options if the whole guard is too much: a `build` field on a registry entry that runs `node tools/build.js --only-uncommitted`
            (what `npm ci` already ran) instead of `npm run build`. That edits a workflow step, so it is the owner's call.
verify    — dispatch `platform-suites` with `suites=export-confine` and read the Windows job.
---
