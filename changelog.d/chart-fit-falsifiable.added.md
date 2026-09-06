- `check-chart-fit` gains a `--style` flag and a falsifiability test. The gate
  learned to skip `visibility: hidden` marks in #2084 — a real fix, since
  `state-chart` keeps a hidden measuring column that was being counted as content
  cut at the stage — but it shipped with no test, and a filter is one edit away
  from swallowing every mark and reporting that everything fits. The test runs the
  gate twice on the same deck: as shipped, and with the scaffold made visible
  through the deck's own `style:`. Verified red under both mutations that matter —
  a filter that counts nothing, and no filter at all.
