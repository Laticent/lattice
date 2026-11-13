- **On a touch screen, a closing sheet no longer hands focus back to a text field.** From Compose that field was the
  editor, so focus landed back in it after every Add slide gallery insert, which on a touch screen can bring the
  software keyboard back up (unverified on a real device: iOS Safari often refuses a keyboard on a focus made outside
  a tap). Focus goes to the button that opened the sheet instead, when it is still there, so a screen reader keeps its
  place. The insert itself already took focus only on a fine pointer; the close now agrees. A mouse still gets its
  caret back, and so does a close made from a hardware keyboard.
- **The slide menu opens on the first press right after it closed.** A closing menu stayed mounted through its fade,
  and its press-outside watcher took the next press on the ⋯ as outside, so the menu opened and shut within 9 ms. The
  strip menu now drops its exit fade, as the Insert menu already did.
