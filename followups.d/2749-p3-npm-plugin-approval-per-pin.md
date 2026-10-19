---
origin: 2749
priority: P3
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.5
---

# Keep one approval per pinned npm plugin bundle, not one per plugin name.

Found by the inversion review of the npm loader (2026-10-19).

why now   — `grantTrust` keeps one digest per `plugin/<name>`, so two projects that pin different versions of one
            npm plugin replace each other's approval at every `lattice packages fetch`, and a render in the other
            project fails until the user approves again. It fails safe, and it will read as "npm plugins are broken".
where     — lib/packages/trust.js (`grantTrust`, `isTrusted`, `readTrust`); lib/packages/code-door.js `untrustedCodePackages`;
            the layer pin each approval carries.
done when — approving a second pin of a plugin keeps the first, a render of either project runs without a new prompt,
            `untrust plugin/<name>` withdraws every pin, and a code package's approval behaves as today.
evidence  — a unit test with two projects at two pins; the trust file's shape before and after.
verify    — maker-checker, because the trust file is what every code door reads.
