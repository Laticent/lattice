studio: +131
playground: +105
The preview pool (`preview-pool`, +131) chooses a frame by the deck's look as well as the tile's shape: it reuses a frame no tile can patch into before it grows, gives a busy shape a new frame instead of rewriting another shape's, and keeps one spare frame past its ceiling while a grid mixes shapes, so reopening the Add slide gallery rewrites no kept frame. The Playground (`PlaygroundIsland`, +105) writes a pick's pointer when the pick is made, and a pick whose plan fails puts back the component last settled, walking it again when nothing is on screen.
