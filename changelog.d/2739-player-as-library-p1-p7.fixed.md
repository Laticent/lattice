- **Fixed: a Mermaid diagram inside a quote or a list item draws at its natural size in the Studio.** It kept a fixed
  1152×480 box meant for pages that are not slides, filled the stage, pushed the paragraphs after it off the slide and
  flagged the slide as overflowing, where the CLI's PDF fit. The Studio's webpage export now matches the CLI's
  `--player` file byte for byte on such decks. And a diagram fence indented under a bullet now stays inside its list
  item in the CLI's PDF instead of breaking the list.
- **Fixed: a `![bg]` picture on an `image` slide lands on the slide the engine says it is on.** The engine now draws
  the image panel from its own reading of the deck, so a setext heading (`Title` over `---`), a `***` rule, a `---`
  inside `$$` or a class directive indented as code no longer puts the panel on the wrong slide or on none. A picture
  inside a line of prose on an `image` slide becomes the panel too, instead of the slide's background. Two shapes are
  now plain text, as markdown reads them everywhere else: a `![bg]` written inside a raw HTML block, and a URL with a
  space in it (write `![bg](<my photo.jpg>)`).
- **Fixed: an `image` pane on a tall deck draws its photo in the image layout's panel.** On a 9:16 (or square,
  portrait, mobile) deck, panes become one page each, and the image pane's photo filled the whole page behind its
  title. It now takes the image layout's composition, as an `image` slide does. A 16:9 deck that lays the panes out
  side by side is unchanged.
