---
origin: 2992
priority: P2
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-07-calco-native-shapes.md
deferred: off-path — pre-existing on main (117ddbd renders the same), in Calco's generated-text materialization and layout probe, which PR 2992 does not touch; the fix changes a safeguard every deck goes through and needs its own tests
source: https://github.com/Laticent/lattice/pull/2992
---

# An editable file hides a row's pill labels under a picture of the row's counter

```text
  P2 · [no ticket] a counter ::before in a grid row stays in the picture, which then covers the row's text
       why now   — gallery slide 107 (regulatory-update): in the editable PPTX/ODP the three "Effective …" pills show
                   empty in LibreOffice and Quick Look. The labels are in the file; a picture written after them covers
                   them. Gallery slide 26 has the same shape of defect. Found while checking PR 2992's Quick Look run.
       cause     — each <li> is a grid whose ::before is the counter ("01", decimal-leading-zero), an in-flow 27x32 grid
                   item. Materializing it (reader.ts, GENERATED TEXT) is undone because the stand-in shifts the row's
                   <strong> by 2 px as the grid re-sizes its tracks, past the 0.5 px "moved" guard. The pseudo then
                   stays in the picture, and pseudoRect gives a NON-absolute pseudo its host's whole box (1152x116),
                   so the row is "covered by its own pseudo": the pills stay in the picture, and that picture is
                   written after the cards' text. measurePseudo fails the same guard.
       where     — docs/src/lib/calco/reader.ts: materializeTextPseudos (the moved check), pseudoRect, measurePseudo.
       done when — slide 107's pills are shapes with their labels on top in the .pptx and .odp, no picture overlaps
                   earlier text on any gallery slide (a scan of the gallery export finds 2 today: 26, 107), and the
                   change in the guard is pinned by a reader test that fails without it.
       evidence  — .scratch-reproducible: LATTICE_KEEP_HTML=1 export of the gallery, readSlide(..., {diagnose:true})
                   on slide 107 lists "li.::before pseudo:text" and "li covered by OWN pseudo:li::before".
       verify    — tier 2 maker-checker (Calco reader, every editable export).
```
