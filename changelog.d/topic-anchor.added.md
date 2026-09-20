- **New `topic` anchor** — marks a topic WITHIN a section, where `divider` marks the boundary
  BETWEEN sections. A horizontal cut: the topic's name and one-sentence claim above, the
  section's topics as a scale below with the current one lit on the seam.
- **The sibling track is DERIVED, not authored.** `lib/transformers/topic-track.js` reads the
  `## heading` of every `topic` slide in a section and builds each slide's track, the way
  `lib/forms/tile/progress` derives section position one level up. Renaming a topic is a
  one-slide edit, and the track cannot go stale or mark the wrong item. Authoring a `<ul>`
  on a `topic` slide overrides the derivation for that slide.
- **`topic fact` variant** — one flat canvas with the type hierarchy inverted: the claim takes
  the display tier and the name demotes to a label on a rule, with a mono provenance line at
  the foot. For when the room needs the finding rather than the label.
- `findTopLevelH2` moved from the masthead kernel to `lib/core/top-level-h2.js` so both callers
  share one depth-aware heading reader instead of cloning the depth-blind regex.
