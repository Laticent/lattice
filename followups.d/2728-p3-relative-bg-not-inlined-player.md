---
origin: 2728
priority: P3
recorded: 2026-10-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# A relative `![bg left:40%](a.jpg)` may reach the player un-inlined and unreported

Reported as plausible by the #2728 checker: the section carried `background-image:url("a.jpg")`, which `inlineFileUrls` does not handle because it only rewrites `file://` URLs. It was not listed in `missing` either. The PDF path was not checked.

done when — reproduced or ruled out; if real, the image is inlined, or listed as missing in the export report.
