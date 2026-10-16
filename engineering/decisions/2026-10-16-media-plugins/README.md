# Reference looks for the media plugins (2026-10-16)

The frames, photo finishes and tones the owner approved on 2026-10-16 were picked from a throwaway prototype. This
folder keeps that prototype, so the build starts from the approved looks instead of re-deriving them. The decision
itself is `../2026-10-16-media-plugins.md` (§4.7 for the vocabulary, §4.9 for the fixes the build owes).

| File | What it is |
|---|---|
| `looks.css` | The prototype's CSS, exactly as it rendered when the owner approved it: five frames (`mat`, `keyline`, `float`, `device`, `corners`), three finishes on the photo (`nimbus`, `halo`, `meridian`), two tones (`duotone`, `grayscale`), and the poster's play badge and the QR code's paper tile |
| `render.mjs` | Rebuilds the reference sheets from `looks.css`: fetches the two photographs, writes one scratch deck per theme, and renders it with the CLI into `.scratch/media-looks/`. On demand only. Its output matched the approved render pixel for pixel on 2026-10-16 |
| `reference/*.jpg` | The approved renders, downscaled: the frames in light, dark and a warm palette; one frame around a photo, a clip and a code; the finishes on two photographs; the tones in dark mode; and `mat` with `nimbus` in a real slide |

**How to use it.** Treat `looks.css` as the design source for each look's values: the shadows, the paddings, the
blend modes and the color mixes. The plugins' styles will be organized differently (the plugin's own class names,
theme tokens, `padding` and `gap` only, HARD RULE #20), but a frame or finish should land on the same pixels as these
renders, apart from the fixes in §4.9. To check, render the plugin's demo deck beside `node render.mjs` and compare.

**What it is not.** It is not shipped code and no build reads it. It uses a few fixed colors (the device bezel's grays,
the QR paper, duotone's two anchors) that the build turns into tokens or allowlisted fixed colors (HARD RULE #3).

**The photographs** are Lorem Picsum images 1011 and 30, which serve Unsplash photographs under the Unsplash license;
`render.mjs` fetches them and the repository does not store them, apart from the downscaled reference renders.
