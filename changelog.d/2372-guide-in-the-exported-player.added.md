- **A narrated HTML export now points along with its narration, as Present does, and so does its
  video.** A narrated export carries Present's Guide: as each sentence plays, the bullet, row, card
  or chart mark it names stays lit while the rest of its group recedes, and the hand draws where the
  preset asks. `lattice video` records it. It is an export option, on by default: the Studio's
  webpage export has a **Guide** switch beside Captions and Narration audio, and the CLI takes
  `--no-guide`. The deck's `delivery:` picks the style (`restrained` when it names none). The viewer
  has a Guide switch beside Play. An export without narration, or made with the Guide off, is
  unchanged, byte for byte.
- **`lattice video --no-captions`** writes the video with no caption track and no `.vtt` beside it.
  Captions stay on by default.
