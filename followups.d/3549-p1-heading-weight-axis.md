---
origin: 3549
priority: P1
recorded: 2026-11-27
area: theming
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §9
deferred: blocked — the owner wants more thought before deciding (D2 on #3549, 2026-11-27)
source: https://github.com/Laticent/lattice/pull/3549
---

# Should heading weight be a public setting, such as a weight word on `typography:`?

why now   — Annual Report sets its headings to 400 through the internal `--heading-weight` preset hook (#3470). The owner asked whether authors should control heading weight through the type set, and answered "we need to think about this more". Today D10 keeps the hook internal to presets.
where     — `lib/base/base.typography.css` (the type sets), the `typography:` register and its docs (`lib/base/base.registers.docs.md`), and #3470's `--heading-weight` hook.
facts     — every heading face ships only 400 and 700 (Playfair, Newsreader, Fraunces), except Barlow Condensed, which also ships 600. A browser draws 500 as 400 and 600 as 700, which was measured on 2026-11-27: only the label digit differed. So a weight word can offer two real steps, regular and bold. The precedent for an axis is the spectrum keys' weight word (`spectrum: solid left band`, #3410). Adding a value is additive, so the decision need not land before 1.0.
done when — the owner decides, with renders of each type set at regular and bold, and the decision is recorded in the study note, plus the register change if they choose one.
