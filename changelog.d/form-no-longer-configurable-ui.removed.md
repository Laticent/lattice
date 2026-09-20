- **Removed: the Form on/off controls in the Studio and the Playground.** Form is
  the composition model, not a setting — so the Studio Inspector's **Deck chrome**
  toggle, the Playground Deck-settings **Form** select, and both editors' `form:`
  autocomplete (the key hint and the `off`/`standard` value list) are gone. The
  **Section rail** control is a different register (`class: no-progress`) and is
  unaffected. A leftover `form:` line in an existing deck is preserved verbatim by
  the settings panel rather than rewritten or dropped.
