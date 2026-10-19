---
origin: 2749
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# Finish the npm door's admission: the download, the explicit list, and two open calls.

Triaged 2026-10-18: the three rules are enforced in the door and tested (`test/unit/cli/npm-plugin-admission.test.js`,
`test/integration/export/npm-plugin-admission.test.js`): refuse at OFF and on a failed probe, admit bytes against a pinned hash with
nothing left external, and never load a plugin in Node. What remains is the part that produces those entries.

why now   — phase G cannot open without something that builds the `source: 'npm'` entries the door now checks.
where     — a new loader beside lib/packages/ (download one bundle, compute its hash, read the project's explicit plugin list);
            lib/packages/cli.js (`lattice packages trust` could refuse an npm plugin at OFF at approval time, not only at run time).
done when — (1) the loader downloads one self-contained bundle per listed plugin, runs no `npm install`, and hands its bytes and
            the list's pinned hash to the door; a test shows the loader never executes the bytes. (2) The owner decides whether
            `unmeasured` should be admitted on macOS and Windows (today it is: there is no /proc to probe and Chromium's sandbox is on by
            default; decision 7 says a failed probe counts as OFF and does not say which). (3) `lattice packages trust` refuses an npm
            plugin at OFF, if the owner wants the refusal at approval as well.
evidence  — the loader test; the owner's answer to (2).
verify    — tier 2 adversarial trio, because the loader decides what code reaches a user's machine.
