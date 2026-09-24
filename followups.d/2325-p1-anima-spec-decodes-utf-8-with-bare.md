---
origin: 2325
priority: P1
recorded: 2026-09-24
---

# The anima spec decodes its UTF-8 with a bare atob

why now   — it is the same defect #2325 fixed for functionplot: the `anima` fence packs its
            spec with `lib/core/base64-utf8.js`'s `toBase64`, and `hydrate.ts` reads it back
            with `atob`, so any non-ASCII text in a scene (a label `é`, `²`, `—`) mangles
where     — docs/src/lib/anima/hydrate.ts:90; the committed lib/export/anima-player-bundle.generated.mjs
            is built from it (tools/build-anima-player.js), so the fix regenerates that bundle
done when — a scene whose spec holds `x²` draws `x²` in the Studio and in a --player export, and
            a test goes red with the bare atob restored
evidence  — the exported player grepped for the codepoint before and after
verify    — tier 1 checker, because the generated player bundle ships in every --player export
