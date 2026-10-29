- **Fixed: in a deck that splits on headings, the slide actions act on the slide you see.** A deck written
  without `---` is one block that renders as several slides. Before this fix, Duplicate copied the whole block,
  Move did nothing, a new slide landed at the end and Delete was refused. Now each action cuts the block at that
  slide's heading, which renders the same, and acts on that one slide.
