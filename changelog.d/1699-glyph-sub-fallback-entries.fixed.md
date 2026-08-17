- **Fixed: chart labels containing `―`, `→` or an ideographic space no longer
  risk running past their box on hosts that paint those characters wide.** The
  per-glyph advance table that estimates how wide an uppercase tracked quadrant
  or radar label paints mapped those three characters *narrower* than the
  fallback it already applies to anything unmapped, so the mapping — not the
  fallback — was the thing under-counting them. They are in neither shipped
  font, so the host paints them and the mapped values could only ever be a
  reading of one machine. All three entries are dropped; they now bill the
  fallback, which is a bound rather than a guess. Rendered output is unchanged:
  every shipped deck with a quadrant or radar slide renders byte-identically,
  as does a fixture whose labels do carry these characters.
