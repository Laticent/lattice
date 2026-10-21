---
origin: 2739
priority: P14
recorded: 2026-10-20
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/issues/2758
---

# A top-to-bottom Mermaid diagram inside a quote or a list item overflows the slide, in both hosts

why now   — found while sizing quoted figures in the Studio (followups.d/2739-p11). A nested figure takes the container's
            full width and the height its viewBox gives, the CLI's baked shape (`.mermaid-svg`), so a `flowchart TB` with four
            nodes under `>` draws about 1,570 px tall on a 720 px slide. The CLI's PDF flags the page OVERFLOW, and since the
            p11 fix the Studio flags it the same way. A top-level figure does not, because it is a flex item of the slide
            and shrinks to the space left.
where     — lib/plugins/mermaid/mermaid.styles.css: the `.mermaid-svg` rules (CLI and player) and the nested-figure rule
            added for p11 (Studio). A cap on the nested figure's height (the slide's remaining stage, or a share of the
            canvas) in both, so the two hosts still agree.
done when — a quoted `flowchart TB` with four nodes fits the slide in the CLI's PDF and in the Studio, and the host-parity
            spec stays byte-identical on `examples/mermaid-quoted-fence.md` with such a slide added.
evidence  — the CLI PDF page and the Studio preview, before and after.
verify    — tier 1 checker; CLI PDF bytes change for decks with that shape, so it stops for the owner's export sign-off.
