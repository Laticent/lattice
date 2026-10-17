---
origin: 2748
priority: P2
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §7 (slice 1)
source: https://github.com/Laticent/lattice/pull/2748
---

# `asset:` in a CLI render is unsupported: it passes through as a dead reference

why now   — A deck that names a Library photo with `asset:team-shot` renders the photo in the Studio and not in the CLI, where
            `resolveAssetUrl` has no `assetUrls` map and returns the reference untouched. §7 slice 1 owed "asset: resolving in
            the CLI against a deck-folder map"; PR #2748 built the table rows but not this.
where     — `lib/core/bg-image.js` `resolveAssetUrl` (the `asset` branch returns `url` without a map);
            `lattice.js` (`engine.render` is given `samplesUrl` and `baseUrl` but no `assetUrls`).
done when — the CLI builds an `assetUrls` map from a folder beside the deck (the name a decision settles, for example
            `assets/`) and passes it to `engine.render`; a name the folder lacks draws the stand-in and `lint:deck` names it;
            a CLI PNG of a deck using `asset:` shows the picture.
verify    — render a deck with `![](asset:hero)` beside an `assets/hero.jpg` and look at the PNG.
