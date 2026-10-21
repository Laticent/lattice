studio: +10
playground: +3
The agent toolbox now imports the comment-directive registry (`LOCAL_KEYS`, `GLOBAL_ONLY_KEYS` from `lib/core/meta-keys.mjs`) to tell a bare carry-forward directive from a slide-local one, instead of keeping a key list of its own (which `test/unit/core/meta-keys.test.js` forbids). The registry was already in both routes; the growth is the two extra named exports kept by the bundler.
