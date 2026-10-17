- **Fixed: a slide background with a relative path is embedded in the player.** A `![bg]` the engine
  draws as the slide's own background (one with a ratio such as `left:40%`, for example) reached the
  `--player` file as a bare `a.jpg`, which shows nothing once the file is sent, and the run did not
  say so. It is now embedded like any other picture, a missing one is reported, and the file no
  longer carries the path of the author's own folder. A picture used as several slides' background
  is stored once.
- **Fixed: a code sample that shows a `style` attribute is shipped as written.** The player rewrote a
  relative `url()` in such a sample, in inline code, to the path of the author's own folder.
