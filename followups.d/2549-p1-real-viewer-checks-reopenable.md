---
origin: 2549
priority: P1
recorded: 2026-10-06
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-05-reopenable-exports.md
source: https://github.com/Laticent/lattice/pull/2549
---

# Open a re-openable export in the real viewers: PowerPoint, Acrobat/Preview, iOS Files

why now   — the one UNVERIFIED claim on #2549 and #2532. A CLI `--reopenable` PPTX uses the
            same repack (`lib/core/reopenable.js` › `embedInPptxBytes`) as the Studio PPTX the
            owner opened cleanly on 2026-10-06, but no CLI-made file was opened in PowerPoint,
            the PDF attachment pane was never checked in Acrobat or macOS Preview, and the
            Studio's Import deck `accept` was never tried from the iOS Files picker.
where     — `npx lattice examples/studio-present.md out.pptx --reopenable` (and `out.pdf`);
            the Studio's deck switcher › Import deck… on an iPhone/iPad.
done when — PowerPoint opens the CLI PPTX with no repair prompt; Acrobat and Preview list
            `deck.lattice` in the attachments pane; the iOS Files picker offers .pdf, .pptx and
            .lattice files to Import deck… and one imports.
evidence  — a screenshot from each real application or device. Emulation does not count (#23).
verify    — tier 0. It is a read-only observation, not a change. If a viewer is not
            reachable, say UNVERIFIED and move on.
