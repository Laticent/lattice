studio: +222
playground: +202
home: +206
The media source rows (`lib/core/media-sources.js`) now carry `scheme` and a `resolve` function each, so the resolver loops the table instead of branching on a row id. Those functions and the table's scheme lookup ship in the shared `bg-image` core that all three routes bundle. This is real growth, about 200 bytes gzipped, taken from CI's per-PR allowance block on 069bc34. The row functions replace the branches that were in `resolveAssetUrl`, so the net is small; nothing was given back elsewhere.
