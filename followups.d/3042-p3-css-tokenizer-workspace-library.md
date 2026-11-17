---
origin: 3042
priority: P3
recorded: 2026-11-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P5 census
deferred: large — a new workspace library for the CSS tokenizer and the import boundary around it; P5a moves every reader that can import lib/core where it lives
---
# Make the CSS tokenizer a workspace library, so the plugins and @laticent/calco can read CSS through it

why now   — P5 moves every hand-written CSS scan onto one tokenizer (lib/core/css-tokens.mjs). Two readers cannot
            import it where it lives, and `npm run structure` refuses both
            (engineering/decisions/2026-10-11-codebase-structure.md): lib/plugins/mermaid/mermaid.draw-shim.mjs (a plugin
            reaches outside its folder only through ctx, a service or a workspace library) and
            docs/src/lib/calco/reader.ts and picture.ts (@laticent/calco is layer 0; lib/core is layer 1). Until they
            can, each keeps its `url(` regexes, and the census lists them under "Kept until the tokenizer is a workspace
            library".
where     — lib/core/css-tokens.mjs and lib/core/css-ref-grammar.js; tools/build-segno-grammar.js (it writes the
            generated region); tools/structure.js's layer table; the readers named above.
done when — the tokenizer is importable by layer 0 and by plugins under the structure rules, the shim and calco read
            `url()` through it, their SANCTIONED_SPINE_READERS entries are gone, and `npm run structure` holds.
evidence  — `npm run structure` clean; the PowerPoint export byte-identical on a demo deck (calco); the Mermaid face
            list unchanged on a deck with custom faces.
verify    — tier 1: a checker on the package move.
