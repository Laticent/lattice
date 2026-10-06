---
origin: 2558
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# Export-to-Marp: the recipient's marp-cli runs the deck's raw HTML, and it can reach the network

why now   — found by the red team on #2558's P1, then MEASURED on #2565 with real marp-cli 4.3
            (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10). The bundle's
            `npm run pdf` runs `marp --config-file marp.config.cjs --allow-local-files`, and the config
            sets `html: true`. With a probe deck carrying `<script>`, `<img onerror>` and a beacon image:
              · with `html: true` (as shipped) the script and the onerror both RAN in marp-cli's headless
                Chrome, and the beacon reached a local listener (2 requests);
              · with `html: false` all of it printed as text and nothing ran;
              · reading a local file failed both ways (`fetch` and XHR of file:///etc/hostname blocked),
                so the red team's "reads local files" is refuted; network reach is not.
            No VS Code and no setting change is needed: the recipient only runs the bundle's own script.
            Severity is bounded: a bundle's `marp.config.cjs` is already JavaScript the recipient runs,
            so a hostile bundle AUTHOR needs no deck script. The gap is the Studio path, where an AI edit
            or an imported deck can carry a script the author never saw run (the Studio preview
            sanitizes), and it rides into every bundle that author hands on.
where     — lib/core/marp-bundle.js (`marpConfigCjs`, the deck it writes); docs/src/components/studio/
            share-export.ts (the Marp ZIP path); the bundle's runtime `<script>` tags, which are why
            `html: true` is on at all.
done when — the owner decides: drop the deck's own `<script>`, `on…=`, `srcdoc` and `javascript:` URLs from
            the bundled deck while keeping Lattice's runtime tags, or keep it and say in the CLI guide and
            the Share sheet that the bundle runs the deck's HTML when rendered.
            It changes an exported artifact, so the owner signs off before merge.
evidence  — the probe deck rendered with real marp-cli before and after, as above.
verify    — tier 2 trio, because it is a security boundary on exported bytes.
