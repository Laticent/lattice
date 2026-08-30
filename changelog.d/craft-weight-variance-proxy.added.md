- **`npm run score:variance`** decomposes which scorecard categories actually move a deck's
  Craft and Style grades. It prints each category's share of the summed per-category
  variance, attributes that variance to the rules feeding it by **ablation** (drop a rule's
  findings, re-score, see which category moves — so the tool never restates the scorer's own
  mapping and cannot drift from it), and prints a **perturbation ledger** saying what the
  draft models it compares against are really doing to each category's input. `--json` ·
  `--committed` · `--weighted` · `--depths=` · `--reach`. Findings are counted by identity
  rather than netted per deck, so a swap cannot hide inside a zero.
- The Craft-half variance figures published on 2026-08-25 measured the instrument rather
  than the weights, and the corrected reading now ships with them. Those figures ranked the
  three Craft categories over prefix-truncated decks as a draft proxy, but truncation models
  an *unfinished* deck rather than a badly-written one: across all 202 scorable decks it
  creates 166 `contract` findings and destroys none, while creating **zero** `craftProse`
  findings by line and four by character — all four being one-word fragments left where the
  cut landed inside a heading. The band's endpoints were an unstated parameter besides: cut
  depth alone moves `contract`'s share from 10.3% to 71.2%. So `craftProse` is not "the next
  weight to be suspicious of" — it is the one nothing has yet measured.
- **No grade changes.** No weight, rule, or threshold moved; `craftProse` is left un-priced
  and now labeled as such. Widening `label-title` — which the measurement invites, since it
  accepts 8 of the 1,575 headings it is offered, and only through its single-bare-word branch — would push a
  genre opinion into the profile-blind half of the grade, which is what the Craft/Style
  split exists to prevent. It stays a proposal.
