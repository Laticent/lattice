- **A hash collision can no longer show you another deck's slide.** The preview's
  whole-deck memo and its 24-entry slice cache decided a hit from a djb2-32 hash
  of the deck source plus its length, so two decks that collided in 32 bits
  swapped rendered slides — on the surface that ingests decks from a share link
  and from a model. Both caches now confirm a hit against the exact inputs the
  key only hashed; the hash narrows the lookup, the comparison decides it, and a
  mismatch costs a re-render rather than a wrong slide. The same confirmation
  closes the patch fast path's own hashed signature, where a collision left an
  author's live CSS edit silently unapplied.
