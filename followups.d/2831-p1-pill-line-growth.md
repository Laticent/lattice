---
origin: 2831
recorded: 2026-10-20
area: engine
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2831
priority: P1
severity: medium
---

# A pill taller than the line box grows its host

Measured on the gallery, 92 of 326 body-size hosts (14 to 16 px at 1280) grow by about 0.40em with no extra line, and every element below moves.

why now   — the owner wants inline objects to draw without disturbing what is around them; this is the most common disturbance left (20% of hosts for a pill, 4% for a disc).
where     — lib/plugins/pills/pills.styles.css; the pill is an inline-block for the text-box trim. Candidate to prototype: an inline pill painted with padding, border and background, which does not enlarge the line box. Note section 5 of the audit note.
done when — tools/audit-inline-objects.js reports the pill's "host taller" count near the disc's, with before and after numbers and a PDF check of the export (Chrome 131).
evidence  — the audit table before and after, and renders of the changed pills in Chromium, WebKit, Firefox and the PDF.
verify    — tier 2: shared pill CSS, every deck with a pill. Needs the owner's call on inline versus inline-block first.
