- **Fixed: a Mermaid diagram inside a quote or a list item draws at its natural size in the Studio.** It kept a fixed
  1152×480 box meant for pages that are not slides, filled the stage, pushed the paragraphs after it off the slide and
  flagged the slide as overflowing, where the CLI's PDF fit. The Studio's webpage export now matches the CLI's
  `--player` file byte for byte on such decks. And a diagram fence indented under a bullet now stays inside its list
  item in the CLI's PDF instead of breaking the list.
