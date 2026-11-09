---
origin: 3095
priority: P1
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-09-type-voices.md
deferred: large — two new front-matter keys with Studio inspector and completion, curated fonts shipped and embedded in every export, and owner decisions on defaults still open
---

# Curated type voices for chrome and the eyebrow

why now   — the owner judged #3095's chrome correct but not crafted: every small text, the eyebrow included, speaks in one monospaced voice, so content and chrome look alike. Agreed: the eyebrow is content and must read apart from chrome; chrome shares one style; both become curated author choices (autocomplete, deck-settings inspector, presets), never free font knobs.
where     — `eyebrow:` register (lib/core/resolve-eyebrow.js) grows to face · ink · mark axes; a new chrome voice key (name open) over the header, meta, footer, page number and divider count (base.modifiers.css, stage.css, meta.css, pagination.css, divider.styles.css); the Studio deck settings and editor completion; presets.
done when — an author can pick a chrome voice and an eyebrow style from completion and the inspector; no combination lets the eyebrow share both face and ink with the chrome; each voice is verified at every size, in light and dark, and in PDF, editable PPTX and ODP; the owner has decided the defaults.
evidence  — the A/B/C and E0–E3 mockups and their CSS in the decision note; renders in each voice for a board deck and a festival deck.
verify    — tier 2: maker-checker on the registers and the runtime; the owner's taste call on the voices with light and dark artifacts.
