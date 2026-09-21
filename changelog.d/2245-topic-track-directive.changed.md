- **Breaking: the `topic` anchor's track override is now the `_track` directive, not an authored list.**
  Write `<!-- _track: Cost to win | Lifetime value | [Payback] -->` on the slide — pipe-separated
  labels, the current topic in square brackets. A markdown list on a `topic` slide is ordinary
  content now: the slide renders it AND derives its own track below it, and `npm run lint:deck`
  flags the old shape (`track-list`) with the directive that replaces it. Decks that never
  overrode the track are unaffected — derivation from each topic slide's own `## heading` is
  unchanged.
- **Changed: the track's marker is read from the directive, so nothing infers it from markup.**
  Bold no longer marks an item, and neither does a label matching the slide's heading. The
  bracketed label is lit; marking none draws the scale with no column lit. The engine emits every
  track it draws, override or derived, so the string and DOM render arms read one `data-track`
  string instead of two readings of one `<ul>` — which is where half the defects in this
  component's review history came from.
- **Changed: `_track` on `topic fact` is now documented and linted.** The variant's flat canvas
  drops the track, so the directive draws nothing there — and the slide still stops contributing
  its heading, which quietly shortens every sibling's scale. `lint:deck` warns, as it does for a
  `_track` naming fewer than two labels, one that marks no current topic, and one on a slide that
  is not `topic`.
- **Changed: the track's CSS is scoped to `ul.tile-track`.** A stray list on a `topic` slide is no
  longer styled as a scale it is not.
