---
origin: 3095
priority: P1
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-09-type-voices.md
deferred: large — a typography study, curated content-font pairings, two new front-matter keys with Studio inspector and completion, presets that carry type, a chart type axis, new fonts shipped and embedded in every export, and owner decisions on defaults still open
---

# Curated type: hierarchy first, then content, chrome and chart voices

why now   — the owner judged #3095's chrome correct but not crafted: every small text, the eyebrow included, speaks in one monospaced voice, so content and chrome look alike. Agreed: the eyebrow is content and must read apart from chrome; chrome shares one style; type becomes a curated author choice (autocomplete, deck-settings inspector, presets), never free font knobs. The owner then widened it: study hierarchy, tension and isolation first; let authors choose content fonts from a curated set (Inter, Playfair, Newsreader, Lora, Fraunces, Source Serif 4, Space Grotesk, and Barlow Condensed in place of the proprietary Impact; Times-style serifs and IBM Plex left out; sketch mode excluded, since it owns its own type); have the presets (classic, editorial, brand, minimal) carry type; and treat charts as a third axis beside content and chrome, part by part: heading, axes and scale, category labels, data labels, legend, and the chart's own chrome (source, status, details).
where     — a typography study over the `--fs-*` roles (engineering/typography.md); `--font-display` / `--font-body` pairings (lib/base/base.tokens.css, assets/fonts/); the `eyebrow:` register (lib/core/resolve-eyebrow.js) growing face · ink · mark axes; a chrome voice key (name open) over the header, meta, footer, page number and divider count (base.modifiers.css, stage.css, meta.css, pagination.css, divider.styles.css); `preset:` (lib/core/front-matter-key.js); chart text (lib/plugins/chart-family/chart-family.styles.css); the Studio deck settings and editor completion.
done when — a written hierarchy / tension / isolation study names the rules every pairing keeps; an author can pick a content pairing, a chrome voice and an eyebrow style from completion and the inspector; each preset names its type; each chart part (heading, axes, category labels, data labels, legend, chart chrome) speaks in a decided voice, with tabular figures and its own hierarchy; no combination lets the eyebrow share both face and ink with the chrome; Impact is replaced by an OFL condensed face (it is proprietary and cannot ship or embed); each choice is verified at every size, in light and dark, and in PDF, editable PPTX and ODP; the owner has decided the defaults.
evidence  — the A/B/C and E0–E3 mockups and their CSS in the decision note; the study's measured levels; renders of each preset for a board deck, a festival deck and a chart-heavy deck.
verify    — tier 2: maker-checker on the registers and the runtime; the owner's taste call on pairings and voices with light and dark artifacts.
