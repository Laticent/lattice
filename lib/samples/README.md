# Sample art

Every picture Lattice ships for demonstration lives in this one flat folder: the photos,
portraits, logos and video poster that the component templates, the galleries and the example
decks show. A deck names one with `sample:` and the file name:

```markdown
![bg](sample:photo-wide.svg)
- ![Acme](sample:logo-acme.svg)
  - ![](sample:portrait-ada.svg)
logo: sample:logo-acme-mark.svg
```

The CLI reads a `sample:` file from this folder, wherever the deck sits, and its PDF, HTML,
player and Export-to-Marp outputs all carry the picture. The Playground, the Studio and the
component pages load it from the copy the site stages beside its themes, and the Studio's
exports embed or rasterize it. Both Export-to-Marp producers copy the file into the bundle's
`assets/` and rewrite the reference, because Marp cannot read `sample:`. One place cannot show
it: an editor preview that does not run Lattice's engine, such as the Marp for VS Code
extension, opening a deck that still names `sample:`. A deck's own pictures keep using
ordinary relative paths.

| Prefix | What it is |
|---|---|
| `photo-` | Stand-in photographs, one per shape: `wide`, `tall`, `pano`, `square`, `column`. Each shape comes as an SVG; `wide`, `tall`, `pano` and `square` also come as a JPEG, for testing the raster path. |
| `portrait-` | Team portraits for `team-profile`. |
| `logo-` | Brand marks for `logo-wall`. `logo-acme-mark.svg` is the deck-logo placeholder. |
| `video-poster.svg` | The poster still for `video`. |

**Rules.** The folder is flat: a name is one path segment, so `sample:people/ada.svg` is not a
sample reference. A new picture needs a name that says what it is, using the prefixes above.
`test/unit/core/sample-images.test.js` fails when a shipped deck or template names a sample
that is not here. The design record is
`engineering/decisions/2026-10-07-sample-images.md`.
