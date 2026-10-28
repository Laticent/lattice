- **Changed: the Playground no longer loads or runs its lint while the editor is hidden.** In Explore and on a phone's
  preview pane the editor is not on screen, but it still fetched the 279 KB lint core and linted the draft in one long
  task. It now waits until the editor is shown and lints then, with no edit needed. Edit-first visits lint as before.
