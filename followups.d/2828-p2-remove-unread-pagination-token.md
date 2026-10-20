---
origin: 2828
priority: P2
recorded: 2026-10-20
area: engine
severity: low
swimlane: engineering/typography.md
---

# Remove `--marp-slide-pagination-font-size`, which nothing reads

#2828 found that `--marp-slide-pagination-font-size` is declared in `lib/base/base.tokens.css`
and `themes/cuoio/cuoio.css` and read nowhere in `lib/`, `themes/` or `tools/`. The page number
takes its size from `--chrome-fs` now. Off-path for #2828, which did not touch either declaration.

why now   — a reader who edits this token expects the page number to change and sees nothing.
where     — `lib/base/base.tokens.css` and `themes/cuoio/cuoio.css`, the one line each, and the
            sentence naming it at `design/design-principles.md:226`.
done when — both declarations are gone, `npm run build:check` and the unit suite pass, and
            `export-to-Marp` still renders its page number at the same size.
evidence  — the Marp bundle (`lib/core/marp-bundle.js`) rendered before and after, page number
            measured at the same size.
verify    — tier 0 gates, because it deletes two unread lines; the Marp bundle is the one
            reader that could exist outside `lib/`, so check it first.
