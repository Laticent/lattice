---
origin: 3294
priority: P2
recorded: 2026-11-23
area: engine
severity: medium
swimlane: engineering/development.md (the Node matrix and engines)
deferred: off-path — main had it before #3294; #3294 fixed only its own instance (css-tokens.js, now CommonJS), and this one is a different module the change does not touch
---
# On Node 24, requiring lib/ while an import of front-matter-fence.mjs is still loading throws

why now   — Node 24 refuses to `require` an ES module that an `import` is still loading (ERR_REQUIRE_ESM_RACE_CONDITION).
            lib/core/front-matter-fence.mjs is imported by six ES modules and required by 28 CommonJS files, so a
            caller who starts one of those imports and then requires lib/ before it settles crashes. Reproduced on main
            099acad7 with Node 24.22.3: start `import('lib/core/boundary-parser.mjs')`, then `require('lib/core/auto-split.js')`
            throws. The merge queue's `unit (node 24)` leg ejected #3294 on the same race through the CSS tokenizer,
            which #3294 fixed by making that one file CommonJS (test/unit/core/css-tokens-load-race.test.js). The bundled
            CLI is not affected (esbuild loads nothing at run time); a consumer loading lib/ unbundled on Node 24 is.
            PR CI runs Node 22 only, so a new instance reaches the merge queue before anything sees it.
where     — lib/core/front-matter-fence.mjs (and any other `.mjs` under lib/ that a CommonJS file requires and an ES
            module imports: front-matter-keys.mjs and css-comments.mjs are the next to check).
done when — every `.mjs` under lib/ is reached by one load path (CommonJS like css-tokens.js, or ES-only), and a test
            like css-tokens-load-race.test.js holds each one on Node 24; or the owner decides the unbundled Node 24
            path is not supported and says so in engineering/development.md.
