- **Fixed: a class directive written across lines places a picture beside the text.**
  `<!--\n_class: image\n-->` is applied by the engine, but the CLI read only one-line directives, so
  the picture filled the slide instead. A front-matter `class: image`, which the engine does not
  apply as a deck class, no longer leaves an empty panel on the slide.
