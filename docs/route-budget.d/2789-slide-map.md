studio: +2000
playground: +2500
home: +300
The slide map adds a toggle and a few hooks to the Studio and Playground shells (the keep-mounted helpers, a lucide icon, the persisted choice and the breakpoint observer), and the Playground bridge now carries the lazy index thunk. The rail, the hub, the rendered index, the outline and the preview pool load only when the map is opened (dynamic imports), and the index code now loads when a map first asks. Given back first: the outline and index imports in the Playground bridge were static and are now dynamic. Home moves by a shared-chunk boundary, not by new home code.
