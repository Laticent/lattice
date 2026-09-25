---
origin: 2375
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2375
---

# A Studio tab left open across a deploy 404s every theme it has not fetched yet

why now   — Found on the owner's iPhone during #2375: an open Studio tab showed "This preview couldn't render — theme indaco (404)" and fell back to the palette it had cached (cuoio), so every export from that tab silently used the wrong theme. Every deploy to production does the same to a long-lived tab.
where     — `docs/src/pages/studio.astro` builds `themeBase` from `assetBase()` (`docs/src/playground/asset-version.mjs`), which is `playground/v/<hash>/`. A deploy removes the old `<hash>` folder, and `docs/src/lib/theme-fetch.ts` fetches `themeBase + name + '.css'` on first use, so a tab from before the deploy asks for a folder that no longer exists.
done when — A Studio tab opened before a deploy either loads a theme it has not fetched yet (for example by retrying against the current version once on a 404, or by keeping old version folders served) or tells the reader to reload. It never renders with a different theme than the deck names.
evidence  — On the #2375 branch alias, `/playground/v/81c33a8fcbbe/themes/indaco.css` returns 200 and `/themes/indaco.css` returns 404. The HTML is `must-revalidate`, so only a tab that is not reloaded is affected.
verify    — Open the Studio, deploy a build with a different asset hash, then in the same tab switch the deck to a theme it has not loaded. It must render that theme or prompt a reload.
