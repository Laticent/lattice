playground: +59
The Playground's snapshot capture now dedupes on the pane's size as well as the time, so a reload soon after the first
capture keeps a snapshot measured at the current pane width and the pre-paint replay can paint it (the studio-smoke
"pre-paint replay never ran" flake, followups.d/2908-p1). Given back first: the refusal message keeps its old, shorter text.
