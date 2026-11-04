- **One security policy table.** The tags and attributes the slide sanitizer strips, the attributes that fetch an
  address, and the style tests now live in one file, `lib/core/content-policy.js`, which the renderer reads and the
  linter's coming HTML and CSS rules will read. Nothing a deck renders or exports changes.
- **`lint:deck` warns on a web image.** A new `web-image` warning names each Markdown image, `![bg]` background or
  header and footer image that loads from another site, which the preview shows as a placeholder and the CLI export
  leaves out unless it is run with `--allow-remote`. It is a warning, so `lint:deck --strict` fails on it.
