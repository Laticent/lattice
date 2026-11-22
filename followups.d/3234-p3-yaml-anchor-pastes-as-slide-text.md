---
origin: 3234
priority: P3
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/decisions/2026-11-15-compose-markdown-clipboard.md §5
deferred: off-path — logged from a session archive sweep; Compose's paste reader is not touched by the PR that records it
source: https://github.com/Laticent/lattice/pull/3234
---

# A YAML anchor in pasted front matter pastes into Compose as slide text

why now   — Valid YAML front matter with an anchor on a list key, `class: &anchor` followed by `- lead`, pastes
            into Compose as slide text instead of settings. `isSettingsBlock` treats the `&anchor` as a value on
            the key's line, and a column-0 list item under a valued key reads as a slide's bullet. The failure
            is the visible one (the author sees the text and can undo it), so it is trivial, but it is wrong.
where     — docs/src/lib/compose/markdown-clipboard.ts `isSettingsBlock`, the `valued` test
            (`/^[ \t]*:[ \t]*(?:#.*)?$/`), which does not allow an anchor (`&name`) or a tag (`!tag`) alone.
done when — a paste whose front matter is `class: &anchor` then `- lead` applies `class` to the deck, and
            `footer: Acme` then `- lead` still pastes as slide text; both pinned in markdown-clipboard.test.ts.
evidence  — the reported case from #3234's review; the regex above is the cause by reading.
verify    — the unit test, then paste the case into Compose in the real Studio (Chromium and WebKit).
