---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# The voice should say common business abbreviations without the author spelling them out

why now   — owner, testing #2393's board-update deck: "Jan" (a short month) and "EMEA" should be
            said out loud properly. That deck only reads well because its front matter spells five
            terms out by hand (`acronyms: ARR: A R R, SMB: S M B, EMEA: E M E A, APAC: A P A C,
            LATAM: la tam`). A deck author should not have to know that. These are words every
            board deck uses, so they belong in the engine's built-in pronunciation list.
where     — docs/src/lib/cadenza/lexicon.ts (the built-in list; adding a term is a data edit).
            Checked against the test deck, it already covers ARR, SMB, KPI, GTM, CEO and Q1–Q4.
            It does NOT cover:
              - regions: EMEA, APAC, LATAM (and likely NA, AMER, ANZ, DACH, MENA);
              - short months: Jan, Feb, Mar, Apr, Jun, Jul, Aug, Sep/Sept, Oct, Nov, Dec,
                alone and in forms like "Jan 2026" and "Jan '26";
              - cohort columns: M0, M1, M2 … ("month zero", "month one"), as in the heatmap.
            An author's own `acronyms:` entry keeps winning over the built-in one.
watch out — "Mar" and "May" are also ordinary words ("mar the result", "may slip"). Short months
            belong in the exact-case list (`BASE_CASED`, so "Mar" fires and "mar" never does), and
            ideally only next to a year or a day, or in a table or chart header. `NA` collides with
            "n/a" (not applicable). Decide per term: say it as letters (E M E A), as a word
            (APAC as "ay-pack"), or expand it (Europe, the Middle East and Africa). The house
            default is to EXPAND (lexicon.ts header, §14), which may read long for EMEA.
done when — the board-update test deck, with its `acronyms:` block deleted, speaks every
            region, short month and cohort label naturally, and no ordinary word ("mar", "may",
            "na") changes how it reads.
evidence  — the deck's narration text before and after, per slide (the table, bar, heatmap and
            line slides carry every case), plus unit tests in the lexicon's normalize tests for
            each new term and each collision it must avoid.
verify    — play the deck in the Studio with the voice on and listen to the bar and heatmap
            slides.
