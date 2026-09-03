- **Fixed: a table's last row no longer draws a rule into the slide's own chrome.** Every
  `td` carries a `border-bottom`, so the final row's hairline was the table's outer bottom
  edge — measured 25.5px above the below-note hairline on `compare-table`,
  `statute-stack.lane` and a stage-filling plain table, and 25.0px on `obligation-matrix`.
  Two rules that close together with nothing between them read as one thick doubled line.
  The rule is now cleared on `tbody tr:last-child`, taking the clearance to 133-135px;
  `glossary` and `math.derivation` already did this and are unchanged. `roadmap` is
  deliberately untouched — its cell border is grid structure, not a row separator.
