- The Add slide gallery no longer rebuilds preview frames each time you reopen it. A busy pool used to give a plain
  slide the one frame built for a Mermaid diagram, and the diagram then rebuilt a plain frame. On a LITE device that
  happened on every reopen and cost about two documents a time, which Safari never frees. The pool now adds a frame
  instead, and on LITE keeps one spare frame past its ceiling while a grid mixes the two kinds.
