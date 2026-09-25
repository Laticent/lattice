- **Fixed: Vetrina's word lookup (`findCueWord`) no longer stalls on a long run of punctuation
  inside a word.** Its trailing trim was a regex that retried the run from every position: 2 s
  for a 40,000-character run. It is now a linear scan (~2 ms), the same rule as
  `@laticent/ltt`'s `normalizeMatch`, and a test pins that the two agree.
