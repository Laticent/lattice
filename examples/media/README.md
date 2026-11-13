# examples/media

Two real photographs for the media demo decks (`examples/image-plugin.md`, `examples/video-plugin.md`), the same two the
owner approved the frames, finishes and tones on (`engineering/decisions/2026-10-16-media-plugins/`). Both are from Unsplash,
under the Unsplash License (free to use, no attribution required; credited here anyway), fetched at 1600×1000 through
Lorem Picsum.

| File | Photograph | By | Source |
|---|---|---|---|
| `canoe.jpg` | A canoe on a lake | Roberto Nickson | https://unsplash.com/photos/7BjmDICVloE |
| `mug.jpg` | A red mug | Shyamanta Baruah | https://unsplash.com/photos/aeVA-j1y2BY |

Three files are derived from those two for `examples/lastra-image-reading.md`, the image library's demo deck, each a
picture Lattice's old header readers got wrong (engineering/decisions/2026-11-13-image-library.md §5.1):

| File | Made from | What is unusual about it |
|---|---|---|
| `mug-exif-after-frame.jpg` | `mug.jpg`, stored a quarter turn anticlockwise | its EXIF Orientation 6 sits after the frame header |
| `canoe-turned.png` | `canoe.jpg` at 480×300, stored a quarter turn anticlockwise, 128 colors | a PNG `eXIf` chunk with Orientation 6 |
| `canoe.avif` | `canoe.jpg` | an AVIF |
