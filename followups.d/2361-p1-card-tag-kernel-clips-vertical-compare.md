---
origin: 2361
priority: P1
recorded: 2026-09-27
---

# The card-tag kernel (#2428) clips every `compare-prose vertical` slide that has an insight box

why now   — after #2428 merged, six slides of the agentic-practices talk clip in the export
            (pages 4, 6, 27, 45, 51 and 61 at commit 7657cd1). Every one is
            `compare-prose vertical` with an `insight-*` box under it. The gap around the chevron
            between the two cards grew, so the second card runs into the insight box and loses
            its bottom border. Rendering the same deck with #2428 reverted locally clips nothing,
            so #2428 is the cause. The compare-prose gallery has no vertical slide with an
            insight box, which is why its re-bless did not show it.
where     — lib/base/base.card-tag.css (the tag reserve and padding, in em of the tag text) and
            the `vertical` rules in lib/components/comparison/compare-prose/.
done when — a `compare-prose vertical insight-so-what` slide with two one-line cards fits at
            16:9 4k with the same room it had before #2428, the talk renders with an empty
            OVERFLOW line, and the compare-prose gallery gains a vertical-plus-insight slide so
            this cannot regress unseen.
evidence  — the talk's export OVERFLOW line (empty) and pages 4 and 61 before and after, light
            and dark; the new gallery slide.
verify    — tier 1 checker: the card-tag kernel is shared by eight components.
