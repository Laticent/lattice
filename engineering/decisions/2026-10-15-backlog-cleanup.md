---
status: shipped
summary: >
  Record of the 2026-10-14 backlog cleanup. 25 finished issues closed with proof, 65 priority labels
  written on quoted evidence (26 first-time priorities and 39 changes to an existing one), 6 stray
  label names renamed, and a Swimlane and Done when section appended to 194 issues. GitHub keeps no history of label edits, so this
  note is the audit trail and the undo list.
---

# Backlog cleanup, 2026-10-14

Status: applied. Issues stay the source of truth; `backlog.d/` is regenerated from them each night.

## What was done

- **Closed 25 issues** after a check against `main` at `82c72476`. Each closing comment lists the
  requirements checked and the proof. 20 closed as completed, 5 as not planned (the thing they asked
  to change was deleted or a shipped decision retired it): #477 (not planned), #511, #867 (not planned), #1246, #1366 (not planned), #1413, #1858, #1955 (not planned), #2010, #2041, #2017, #2032, #2033, #2096, #2183, #2205 (not planned), #2280, #2284, #2458, #757, #1514, #1952, #2120, #2180, #2228.
- **Priorities.** A first scoring pass read only the first few hundred characters of each issue; it was
  reverted in full. The second pass read each full body and every comment, and changed a label only when
  a sentence quoted from the issue proved the new class. A script checked each quote against the live
  text. 65 labels landed, listed below: 26 first-time priorities and 39 changes. 66 other re-scored
  issues kept the owner label because no sentence in the text proved a change, and 3 more
  (#1754, #1867, #2296) were held at the owner label because their quote did not prove the change. #2054 and #2182 went to medium on a reproduced bug, not on a quote.
- **Labels.** 6 label names the repo does not define were renamed to the nearest defined one
  (`type:test` and `type:chore` to `type:infra`, `type:bug` to `type:fix`, `type:feature` to `type:feat`,
  `area:theme` to `area:theming`, `area:components` to `area:engine`), and `priority:p3` was dropped. Four
  others were left alone because no defined label fits: `documentation`, `bug`, `security`, `type:perf`.
  The 31 issues missing an area and the 31 missing a type were filled from the per-issue check, and 3
  issues got `status:backlog`.
- **Swimlane and Done when.** Appended to 194 issue bodies (append only; original text untouched).
  Issues that already had an acceptance section got a `Remaining scope` section instead where the check
  found part of the work shipped. Held back: 12 issues whose check was not high confidence, 6 bot-owned trackers, and #2275.
- **Not done.** No duplicates were closed. Three pairs are candidates at medium confidence and need a
  full read first: #1558 with #1578, #1562 with #1865, #2286 with #2231.

## Undo

- **Priority changes.** Put the "from" value back on the issue. Issues that had none: remove the priority label.
- **Appended sections.** Delete the `## Swimlane`, `## Done when`, `## Remaining scope (checked 2026-10-14)`
  and `## Already shipped` sections at the end of the body.
- **Closures.** Reopen the issue.

## Priority changes applied

| Issue | From | To |
|---|---|---|
| #667 | high | low |
| #783 | medium | low |
| #1252 | high | medium |
| #1257 | medium | high |
| #1398 | high | low |
| #1410 | medium | high |
| #1579 | medium | low |
| #1591 | medium | low |
| #1617 | medium | low |
| #1640 | high | medium |
| #1683 | low | high |
| #1745 | p3 | high |
| #1749 | medium | low |
| #1848 | high | medium |
| #1854 | high | medium |
| #1860 | high | medium |
| #1869 | medium | low |
| #1874 | medium | low |
| #1875 | medium | high |
| #1886 | medium | high |
| #1892 | high | medium |
| #1905 | high | medium |
| #1912 | high | medium |
| #1921 | medium | low |
| #1934 | medium | low |
| #1935 | medium | low |
| #1956 | medium | low |
| #1973 | none | medium |
| #1993 | high | medium |
| #2034 | none | low |
| #2053 | none | low |
| #2054 | none | medium |
| #2077 | low | high |
| #2082 | medium | low |
| #2099 | none | low |
| #2137 | none | low |
| #2160 | medium | low |
| #2168 | medium | low |
| #2181 | none | medium |
| #2182 | none | medium |
| #2187 | none | medium |
| #2189 | none | low |
| #2190 | none | medium |
| #2191 | none | low |
| #2192 | none | medium |
| #2203 | none | medium |
| #2213 | medium | low |
| #2240 | medium | low |
| #2254 | none | medium |
| #2256 | medium | low |
| #2258 | medium | low |
| #2277 | none | low |
| #2278 | none | low |
| #2295 | medium | low |
| #2299 | medium | low |
| #2301 | medium | low |
| #2337 | none | low |
| #2438 | none | low |
| #2449 | none | low |
| #2475 | none | low |
| #2511 | none | low |
| #2578 | none | low |
| #2604 | none | low |
| #2643 | none | low |
| #2644 | none | low |
