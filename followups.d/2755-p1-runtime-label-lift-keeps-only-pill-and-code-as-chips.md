---
origin: 2755
priority: P1
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-pills-plugin.md
source: https://github.com/Laticent/lattice/pull/2755
---

# the runtime's actors label lift keeps only `code` and pills out of the label, the engine keeps every trailing directive

why now   — the engine's `slot_label_lift` runs before `lattice_inline_pills`, so every trailing
            inline kind on an actors row (pill, avatar `!{…}`, icon `^{…}`, spark `~{…}`, the
            `@kind{…}` form) stays a sibling of the `<strong>` label. The runtime builds those
            elements first, then lifts, and `lib/runtime/index.js` (the chip-tail loop, near
            line 1290) exempts only `CODE` and `span.lat-pill`. PR #2755 closed the gap for
            pills; an avatar, icon or spark last on an actors row would still land inside the
            `<strong>` in a Marp export. The independent checker found it by reading the code
            and could not reproduce it, because its harness drew no avatars, icons or sparks.
where     — `lib/runtime/index.js` chip-tail loop; `lib/integrations/markdown-it/plugins.js`
            `slot_label_lift` (the engine side, ~line 1602).
done when — a `slotLabelLift` probe in `test/unit/core/marp-fidelity-render.test.js` ends an
            actors row on an avatar and on an icon, the engine and the runtime bundle agree,
            and the probe fails without the fix.
evidence  — the checker's report on #2755 (a trailing `!{Ada}` stays `<code>` in the jsdom
            harness while the engine draws `span.lat-avatar`); it predates the pills work.
verify    — export a deck whose actors row ends on an avatar with `npm run export:marp`, render
            it with marp-cli, and check the avatar sits right-aligned beside the title.
