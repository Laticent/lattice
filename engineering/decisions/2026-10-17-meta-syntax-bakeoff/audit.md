# Harness audit and fixes

An independent checker audited the harness before its results were used (pre-registration §8). It found eleven
issues. The weights and gates in the pre-registration are unchanged; every fix below changes a *measure* or a
*bug*, and each was made before the writer test was read. The checker's own scratch run printed numbers, and so did
mine while debugging, so "before any result was read" is not claimed: the claim is that no fix was chosen by
looking at which candidate it would help.

| # | Finding | Disposition |
|---|---|---|
| 1 | Criterion 2 always put a blank line between records and body, hiding adjacency breakage | Fixed. `run.mjs` renders four layouts per slide (blank line, directly above body, directly above an image, directly after the first paragraph) and adds a structure-intact measure |
| 2 | The shared scanner punished only C0 on "in list item" (no list-continuation state) | Fixed. The scanner tracks list continuation and blockquote prefixes for every candidate |
| 3 | C0's writer did not quote values with edge whitespace, which its reader accepts | Fixed |
| 4 | Field-name case differed per syntax (`focusSteps` vs Segno's lowercase) | Fixed. Canonical names are kebab-case (`focus-steps`) for all six; C0 maps them back to camelCase comment keys. The unscored "aliased" side measure was removed |
| 5 | Gate G3 (no silent loss) was not implemented | Fixed. Probes for an unterminated record, two records on one line, a malformed field, a duplicate key and trailing text. The scanner now emits `unreadable-record`; C5 rejects malformed attributes and trailing text; Segno records and C5 report duplicate keys; a container-embedded fence no longer leaves a stray fence open |
| 6 | C3's terminator (a fence line) was never probed | Fixed. Note paragraphs of ```` ``` ```` and `~~~` added; C3 writes a longer fence when content has a fence-like line; "in other fence" is scored by whether a later record still reads |
| 7 | The two-paragraph-note slide merged two comments; the image-bg rule is not enforced as "directly above" | Note slide fixed (`kaizen-craftsmanship.md#1`). The image-bg rule is **relaxed on purpose**: no slide in the corpus has the image on the line right below the class comment, so the rule picks a slide that has both. Disclosed here |
| 8 | Criterion 2 half implemented, a divide by zero when two candidates show no junk, scripts missing | Fixed. `rubrics.mjs`, `grade-writers.mjs`, `score.mjs` written. Criterion 2 uses an absolute scale (see `score.mjs`), a rule the pre-registration left under-specified |
| 9 | Writer-test leniency differs by syntax | Partly fixed: C5 is as strict as the others; the C0 sheet and spec now name the `stress-slide` marker and the camelCase mapping. Residual: C0 drops some malformed input silently, and that is now scored by G3 |
| 10 | `catalog.mjs` parsed the `preset:` table as a register | Fixed |
| 11 | Cosmetic: `meta` fence info-string boundary, C4 never writes a one-line form, the C1 sheet's double-backtick wording, G2 true by construction | The info-string boundary is fixed. The rest are left and noted: C4 has no one-line form by design; G2 is a construction check, not a discriminating measure |
