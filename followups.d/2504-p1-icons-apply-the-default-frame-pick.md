---
origin: 2504
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2504
---

# Apply the owner's pick of the icons' default frame (decision 7), and record the export sign-off

why now   — decision 7 of engineering/decisions/2026-09-29-inline-icons.md chooses the default look
            from renders; phase 1 shipped them (examples/inline-icons.md slide 3: framed vs bare, in
            prose and pills, light and dark) with `framed` as the placeholder. The owner's export
            sign-off on that deck is the other open half of phase 1's acceptance.
where     — lib/plugins/icons/icons.styles.css (the base rule is the default; `bare` undoes it, as
            for sparks), the manifest's `icon:` register (each axis's first word is its default),
            icons.docs.md, the note's § 2 row 7 and § 6 table, examples/inline-icons.md + PDF.
done when — the default the owner picked is the base rule and first register word; the note records
            the pick and the date; the demo deck is re-rendered light and dark.
evidence  — the re-rendered deck sent for a glance.
verify    — tier 1: lint:deck, the icons fixtures, a pixel check of the demo deck.
