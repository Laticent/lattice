---
origin: 2361
priority: P3
recorded: 2026-09-26
---

# lint:deck passes a deck with an empty slide

why now   — the agentic-practices talk shipped a blank page 10 for two days. A doubled
            `---` separator made an empty slide that rendered as a bare header, and
            `npm run lint:deck -- --strict` reported no errors or warnings.
where     — lib/authoring/lint-core.js (HARD RULE #7: the rule lives there only).
done when — a slide with no content besides directives, comments and whitespace draws a
            warning that names its slide number. A deliberate spacer can opt out with a
            directive.
evidence  — a unit test with `---\n\n---` in the middle of a deck, and one with a
            directive-only divider that must stay silent.
