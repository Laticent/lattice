- **The theme, layout and package gates refuse an address inside `image()`.** A stylesheet that wrote a web address as a
  string inside a function other than `url()` or `image-set()` (`src: image("//…")` in an `@font-face`) passed the gates,
  and Chromium, WebKit and Firefox all fetched it. The gates now refuse an address-shaped string inside any function.
- **The gates and the code door read CSS with the renderer's own reader.** They used to walk CSS by hand to find an
  address held in a custom property; they now read it from the shared CSS reader, which reports the declaration each
  string sits in. Nothing a shipped theme, layout or package does changes.
