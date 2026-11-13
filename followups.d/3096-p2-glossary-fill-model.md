---
origin: 3096
priority: P2
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The glossary on the content rules
deferred: large — an engine, lint, Studio and CLI change; #3096 is the design note that decided it
source: https://github.com/Laticent/lattice/pull/3096
---

# The glossary fills an empty slide the author places last, instead of inserting one

why now   — glossary: auto inserts slides the source lacks, so four modules trim them out (withoutAutoGlossary) and two
            count them in (autoGlossarySections). The agenda's fill model removes the need for all six.
where     — lib/core/glossary-auto.mjs, lib/authoring/lint-core.js (applyFix needs a two-part fix), the six sites,
            narration, Present, the closing check and the exported term list.
done when — an empty _class: glossary slide fills from acronyms: definitions, paged by venue; lint warns when a filled
            glossary is not the last slide(s); a one-time autofix writes the slide at the end and drops the key; the old
            key is honored meanwhile; the six trims and counts are gone.
evidence  — the owner's picks D2 (2026-11-08) and the last-slide rule (2026-11-09) in the note.
verify    — video narration, Present, the closing check and the term export each checked on their real surface (#23);
            a demo deck under examples/ (#9).
