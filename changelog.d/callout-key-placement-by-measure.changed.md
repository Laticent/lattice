- **Changed: a heatmap's callouts and band key sit where they leave the grid largest.**
  The engine lays the heatmap out with the notes beside or under the grid and the key beside or under
  it, and keeps the layout that leaves the most grid at the slide's shape: 16:9 usually keeps both beside
  the grid, 1:1 and 4:5 usually set the key (and sometimes the notes) under it. A layout that would drop
  a note never beats one that draws it. Square heatmaps with a key, and any heatmap with callouts
  where another layout keeps over 10% more of the grid, render differently; a heatmap with no callouts
  and no key, and a keyed one at 16:9, 4:3 or portrait without callouts, are unchanged. (`lib/plugins/callout/callout.docs.md`,
  `engineering/decisions/2026-10-20-callout-placement.md` § 5.)
