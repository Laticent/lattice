studio: +500
playground: +550
home: +550
The plugin boundary (#2630). Site code that asks "does this deck use math" reads math's detectors from a generated per-plugin detector table (`lib/plugins/detect.generated.mjs`, one named export per plugin, so a bundle keeps only the ones it imports) instead of importing the math plugin's folder; the rest is the plugin kit's per-concern wrapper modules (`lib/plugin-kit/*.js`) in the chunks that bundle the engine. Measured against main at 089fd230e after rebasing (docs build, both trees): studio eager +22 B gz, playground +0.1 KB, home +0.1 KB, declared with headroom for gzip spread. The first version read the whole grammar table and measured +849/+655/+652 B; the detector table gave that back.

The plugin contract on top (2026-11-01-plugin-contract-hollywood.md) adds the state facade every plugin syntax rule now runs through (`lib/plugins/state-facade.mjs`, imported by the boundary parser's block installer and the generated grammar), so a rule never touches markdown-it's live state. Measured by CI against main at b7b80b7 on 7c48490: studio +390 B gz, playground +435, home +449, nearly all of it `slide-boundaries` (+369, the facade) and `math.syntax` (+43); declared with headroom for gzip spread.


The engine bundle (`engineJsGz`, ledger-checked against its ceiling): the base plugin ctx carries only the vocabulary every render reads (status marks, record shapes, the video provider table). The diagram vocabulary reaches the Mermaid bake and pass through their own ctx, and the old video fence step lives in the video plugin's own folder, so none of them rides into the engine. Measured locally on `esm/engine.js`'s static closure (gzip -9): 301.8 KB on main at b7b80b7, 308.3 KB before this scoping, 304.8 KB after it.
