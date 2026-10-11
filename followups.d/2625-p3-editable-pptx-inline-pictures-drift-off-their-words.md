---
origin: 2625
priority: P3
recorded: 2026-10-11
area: engine
severity: medium
swimlane: engineering/pipeline.md
source: https://github.com/Laticent/lattice/pull/2625
---

# Editable PPTX: an inline picture in the middle of a sentence drifts off its words

why now   — found while verifying #2625 (avatars). Pre-existing: inline icons (`^{bucket}`) drift
            identically, so it is off-path for #2625 under HARD RULE #18 and is logged, not fixed.
where     — the `--editable` PPTX writer. Text becomes real text boxes that the opening app lays out
            with its own font metrics; an inline image (icon, avatar, spark) stays an absolutely
            placed picture at the x Chromium measured. Any reflow moves the words and not the picture.
repro     — a deck with `Our raw files land in `^{bucket, c4}` S3 and load into `^{warehouse, c5}`
            Snowflake every night` → `lattice deck.md out.pptx --editable` → open in LibreOffice
            (`soffice --headless --convert-to pdf`). The bucket covers "in", the warehouse covers
            "into". A picture at the START of a line (a bullet's leading icon or avatar) does not drift.
unknown   — LibreOffice substituted the deck's serif display font, so part of the reflow is font
            fallback. Real PowerPoint with the embedded fonts was not checked; it may drift less.
done when — an inline picture mid-sentence stays beside its words in the editable PPTX in PowerPoint
            and LibreOffice, or the writer refuses to split such a paragraph and bakes it as one
            picture with a stated reason.
evidence  — the editable PPTX rendered through LibreOffice and PowerPoint, before and after.
verify    — EXPORT-BYTES change: it stops for the owner's sign-off (CLAUDE.md QUALITY BAR).
