---
origin: 3605
priority: P1
recorded: 2026-11-28
area: docs
severity: medium
swimlane: engineering/decisions/2026-11-28-libraries-apache-license.md §5
deferred: blocked — the owner's call on canonical licensing text (D3 on the ❓ card)
source: https://github.com/Laticent/lattice/pull/3605#issuecomment-7232315237
---

# Say which license a contribution comes in under, now that 15 libraries are Apache-2.0

why now   — CONTRIBUTING.md lines 40–42 say every accepted contribution is "inbound = outbound
            under AGPL-3.0-only". For the 15 Apache-2.0 libraries that is no longer true, and
            TRADEMARKS.md lines 5–6 say "The AGPL-3.0 license covers the code".
where     — CONTRIBUTING.md §License of contributions; TRADEMARKS.md opening paragraph.
done when — both say a contribution comes in under the license of the part it changes, as
            LICENSING.md maps it, and TRADEMARKS cites Apache-2.0 §6 for the libraries.
evidence  — the owner's approved wording, and a grep for "AGPL" in both files.
verify    — a contributor reading CONTRIBUTING.md can tell which license covers a change to
            docs/src/lib/segno/ without opening another file.
