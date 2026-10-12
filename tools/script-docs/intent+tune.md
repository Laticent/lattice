---
group: Test & verify
---
Coordinate-descend the recommender's facet weights against the DEV half of the fit benchmark, over cached feature vectors so the search is free. DEV ONLY — the chosen weights go into tools/intent-bakeoff/fit-search.ts and the TEST split is reported once, afterwards, by `intent:fit`. Its verdict on the facet layer was to zero `whenToUse`, `antiPatterns` and the function cues outright; that negative result is documented in fit-search.ts's header.
