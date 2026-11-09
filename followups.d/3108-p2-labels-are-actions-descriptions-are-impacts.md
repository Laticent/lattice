---
origin: 3108
priority: P2
recorded: 2026-11-09
area: website
severity: medium
swimlane: engineering/gotchas/studio-playground.md "A screen reader's description changes with how the button was reached"
deferred: large — about 530 labeled controls and ~1,960 e2e lookups by name; the owner chose a new PR after #3108
source: https://github.com/Laticent/lattice/pull/3108
---

# Labels are actions, descriptions are impacts: every control, Studio first

why now   — the owner listened to the Studio with VoiceOver on an iPhone (PR #3108) and set the rule: a control's
            LABEL says what it does, its DESCRIPTION says what will change. A control with no description gets
            VoiceOver's generic hint ("double-tap to activate") after its name. #3108 fixed the descriptions that were
            wrong (repeats, raw ids, open-only tooltips, palette rows); this applies the rule to every control.
decided   — owner, 2026-11-09, one question round on #3108:
            1. TOGGLES keep a stable label ("Coach"); VoiceOver adds "selected" from `aria-pressed`. The description is
               the impact and flips with the state: "Shows the Coach panel beside the deck" / "Hides the Coach panel".
            2. CHOICES (a slide pill, a deck row, a palette swatch, a tab) are named by the thing; the description says
               what choosing it does ("Shows this slide in the preview"). No verb on these.
            3. ONE TABLE for the copy: a typed table keyed by action holding { label, impact }, read by the bar button,
               the drawer row and the palette command for the same action, so they cannot drift. It grows out of
               `COMMAND_DESCRIPTIONS` (docs/src/components/studio/studio-commands.ts).
            4. A NEW PR after #3108 merges, cut from main: a short design note first, then Studio chrome (header, icon
               bar, slide strip, phone drawer, palette: about 150 controls), then the panels, then the site.
where     — docs/src/components/studio/** (467 `aria-label=`), docs/src/components/{site,ui,playground}/** (64),
            65 `Tip` labels; e2e/studio-fixture.ts `CHROME` and every `getByRole(..., { name })` a renamed label reaches.
done when — every interactive control in the Studio and on the site has a label that is an action (or names the
            thing, for a choice) and a description that states its impact; e2e/studio-descriptions.spec.ts requires a
            description on every control in the surfaces it opens, and still rejects a repeat, a raw id and an
            unnamed dialog.
evidence  — the inventory before and after (controls, with a description, verb-first), from Chromium's computed
            accessibility tree at phone and desktop width with each surface open; the owner's VoiceOver pass.
verify    — tier 1 checker per slice; the owner's VoiceOver pass on a real iPhone (no runner reaches VoiceOver).
