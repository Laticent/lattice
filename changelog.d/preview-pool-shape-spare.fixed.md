- The Add slide gallery no longer rebuilds preview frames each time you reopen it. A busy pool used to give a plain
  slide the one frame built for a Mermaid diagram, and the diagram then rebuilt a plain frame. On a LITE device that
  happened on every reopen and cost about two documents a time, which Safari never frees. The pool now adds a frame
  instead, keeping one spare past its ceiling while the slides on show mix the two kinds, and after a palette or theme
  change it reuses the frames the old look left behind rather than growing past them.
