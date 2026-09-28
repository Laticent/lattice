- **Seven chart pane budgets are measured now, and scatter's is tighter.** `calibrate-capacity
  --pane` builds bar, bullet, funnel, piechart, scatter, waterfall, line, stacked-bar, slope,
  radar, heatmap and map panes, and a step fails when its text falls under the type floor or the
  chart stops painting a label, as well as when it clips. bar, piechart, scatter, line, heatmap,
  map and radar turned `measured`. A scatter pane now warns past 8 points side by side (was 12)
  and 10 stacked (was 12): the ninth and eleventh points lose their labels.
