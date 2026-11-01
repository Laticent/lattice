studio: +300
playground: +300
home: +300
The plugin boundary (#2630). Site code that asks "does this deck use math" reads math's detectors from a generated per-plugin detector table (`lib/plugins/detect.generated.mjs`, one named export per plugin, so a bundle keeps only the ones it imports) instead of importing the math plugin's folder; the rest is the plugin kit's per-concern wrapper modules (`lib/plugin-kit/*.js`) in the chunks that bundle the engine. Measured against main at 089fd230e after rebasing (docs build, both trees): studio eager +22 B gz, playground +0.1 KB, home +0.1 KB, declared with headroom for gzip spread. The first version read the whole grammar table and measured +849/+655/+652 B; the detector table gave that back.
