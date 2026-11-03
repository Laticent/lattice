studio: +420
playground: +360
home: +340
The measured split (`fit: pack`, engineering/decisions/2026-10-28-fit-everywhere-model.md §16) runs on
every preview surface, so each one carries its eager entry point: a one-line check for a `fit:` line
(`src/lib/fit-pack-wanted.ts`), the lazy `import()` of `src/lib/measured-split.ts`, and the call that
hands it the render, the frame builder and the engine's verdict config. Measured against main with
docs/scripts/measure-route-base.sh: +377 B gz on studio (+283 single-slide-render, the Studio's split
hook, which home also loads: +303 there), +313 on playground (+276 the Playground's render bridge).
Given back first: the exact `fit:` reader, the Studio's per-slide memory and the frame code all moved
into the lazy module, which took home from +1,498 and studio from +104 over a reshuffled shared chunk
to these numbers; a deck without a `fit:` line never loads it. Declared with headroom for gzip variation.
