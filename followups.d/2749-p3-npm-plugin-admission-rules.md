---
origin: 2749
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# Build the admission rules the owner chose for npm plugins (decisions 7, 8, 9).

why now   — the owner decided on 2026-10-17: npm plugins are refused when the OS layer reads OFF
            (or cannot be determined); a plugin is a self-contained bundle that Lattice downloads
            as it is, and Lattice never runs `npm install` for it; and Lattice never loads a plugin
            in Node. These are the rules phase G (the npm door) opens under.
where     — lib/core/os-sandbox.js (the layer reading), lib/packages/trust.js and cli.js (consent
            and pinning), lib/packages/code-bundle.js (refuses a bundle with anything left
            external, contract note §8), lib/plugins/resolve.js (reads manifests as data); a new G5
            test beside test/integration/export/plugin-fence-door.test.js.
done when — (a) an npm plugin does not run at layer OFF, or when the probe fails (the owner confirmed on 2026-10-17 that a failed probe counts as OFF), with a test for
            each; (b) admission downloads one bundle, verifies its hash, and refuses a bundle with
            anything left external, with no `npm install` anywhere on the path; (c) a test plugin
            whose `index.js` writes a file when loaded leaves no file after admission and render.
            Test (c) is an exit criterion for phase G, like the attack test (owner, 2026-10-17).
evidence  — the three tests, each shown red when its rule is deliberately broken and green when
            restored.
verify    — tier 2 adversarial trio, because it decides what code runs on a user's machine.
