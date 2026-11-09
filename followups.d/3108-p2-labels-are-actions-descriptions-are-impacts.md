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

# Labels are actions, descriptions are impacts (where the impact is not obvious), Studio first

why now   — the owner listened to the Studio with VoiceOver on an iPhone (PR #3108) and set the rule: a control's
            LABEL says what it does, its DESCRIPTION says what will change. A control with no description gets
            VoiceOver's generic hint ("double-tap to activate") after its name. #3108 fixed the descriptions that were
            wrong (repeats, raw ids, open-only tooltips, palette rows); this applies the rule to every control.
best practice — the owner chose to follow it (2026-11-09). The rule matches Apple's label/hint model, which iOS uses for a
            web page's name and description: the label names the control or its action, short, never its type; the
            hint (our description) states the RESULT, starts with a verb, and is used only when the result is not
            obvious from the label. The ARIA Authoring Practices agree (names concise and functional; descriptions
            optional and supplementary, not repeated chrome), and WCAG 2.2 requires a name (4.1.2), a label that
            describes purpose (2.4.6), and that a control's spoken name contain its visible text (2.5.3 Label in
            Name), so a voice-control user can say what they see. So: no description where the label already says it
            ("Next slide", "Close"); VoiceOver users who find its stock hint noisy turn hints off in Verbosity.
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
            5. FOLLOW BEST PRACTICE (above): an impact description only where the result is not obvious from the
               label, and every renamed label keeps its visible text inside the spoken name (WCAG 2.5.3).
where     — docs/src/components/studio/** (467 `aria-label=`), docs/src/components/{site,ui,playground}/** (64),
            65 `Tip` labels; e2e/studio-fixture.ts `CHROME` and every `getByRole(..., { name })` a renamed label reaches.
done when — every interactive control in the Studio and on the site has a short label that is an action (or names
            the thing, for a choice) containing its visible text, and a description stating its impact wherever the
            result is not obvious from the label, with none that is generic. e2e/studio-descriptions.spec.ts keeps
            rejecting a repeat, a raw id and an unnamed dialog, adds WCAG 2.5.3 (a visible label not contained in the
            name), and requires a description on every control listed in the shared { label, impact } table as having
            a non-obvious result.
evidence  — the inventory before and after (controls, with a description, verb-first), from Chromium's computed
            accessibility tree at phone and desktop width with each surface open; the owner's VoiceOver pass.
verify    — tier 1 checker per slice; the owner's VoiceOver pass on a real iPhone (no runner reaches VoiceOver).
