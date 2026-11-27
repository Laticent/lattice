studio: +5
playground: +5
home: +5
The `cover:` key is renamed `cover-layout:` (#3517). The host-register table in lib/plugins/meta.generated.mjs, which every route loads in the meta-keys chunk, now spells the longer key: 5 gzipped bytes. Nothing to give back without a shorter name, and the owner chose this one.
