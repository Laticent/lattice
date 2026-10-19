- Fuoco no longer cancels a pending "insert text, then go to it" when a view makes a report that changes nothing, no
  longer judges a report made during a delivery against stale focus, and `reportUnit` takes `quiet`, so a scrolled
  view that cannot centre the focused slide cannot pull the focus back. Five presses of "next" with a scrolled
  preview and a map now publish exactly once each; before, the fifth flickered 5, 4, 5. The hub's new scroll model
  and its failing arms run at 5,000 cases.
