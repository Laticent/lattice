---
origin: 2379
priority: P2
recorded: 2026-09-25
---

# The Studio's Webpage player styles a nested `<section>` as a slide

why now   — the CLI export now unwraps the flat sheet to top-level slides
            (`section:where(:not(section *))`, `lib/export/cli-deck-sheet.js` `unwrap`), and
            the Studio player still deletes the prefix, so the two HTML players are not yet
            byte-comparable and a raw `<section>` in a slide is a slide in one and not the other.
where     — `docs/src/components/studio/share-export.ts` (two `.replace(/article\.lattice\s*>\s*/g, '')`
            sites); `tools/check-viz-render.js` strips the same way for its flat pass.
done when — both players and `check:render` unwrap through one shared function, and a deck with
            a `<section>` nested in a `dark` slide exports the same from the Studio and the CLI.
evidence  — measured on the CLI before its fix: the nested section took the 1280×720 box,
            `overflow:hidden` and the light tokens, and both slides reported OVERFLOW.
verify    — the Studio Webpage export and the CLI `--player` export of that deck, light and dark,
            screenshotted side by side.
