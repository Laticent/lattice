---
group: Test & verify
---
Compares the grammar-driven CSS reference reader (lib/core/css-ref-reader.js over lib/core/css-ref.generated.js) with the hand-written tokenizer at a git ref (default 242de4a, the last commit that had it). Runs `blockWebCss` and `webRefsInCss` from both over every tracked CSS file and every `<style>` body and rendered stylesheet in the golden-corpus decks, with no origin allowed and with one, and compares the JSON; it also compares the spans with the frozen oracle in tools/segno-legacy. `--ref <git ref>`, `--json`. Exit 1 on any difference. On-demand (HARD RULE #22; Segno R2).
