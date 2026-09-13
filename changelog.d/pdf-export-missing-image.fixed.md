- **Fixed: an image the export cannot fetch no longer costs you the whole file.**
  One unreachable path — a `logo:` written relative to the deck file, which the CLI
  resolves and the web cannot — used to fail the PDF, the PowerPoint and the image
  set outright, with no artifact at all. The picture is now left out, the file
  lands, and the toast names the path that is missing. That covers the full-bleed
  `![bg](…)` panel too, which is a CSS background rather than an `<img>` and used to
  vanish from an export with nothing said anywhere.
