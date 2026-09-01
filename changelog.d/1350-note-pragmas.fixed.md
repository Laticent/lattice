- **Fixed: internal pragmas no longer ship as the speaker note.** A `<!-- tier: short -->`,
  `<!-- galleryAuthored: … -->` or `<!-- color-mode: dark -->` comment fell through into the
  presenter-notes field of every exported format, so slides whose author wrote no note shipped
  one made of build markers. They are now classified as pragmas. Matching is constrained by
  value as well as key, so a real note that opens with one of those words — `<!-- tier: we
  should discuss the pricing tier -->` — is still a note.
