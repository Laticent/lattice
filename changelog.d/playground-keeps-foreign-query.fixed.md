- **Fixed: the Playground no longer drops address-bar parameters it does not own.** Walking the Playground rewrites
  the address to its position (`?c=…&view=read`), and leaving Explore cleared the query. Both threw away every other
  parameter, so a `?tier=unsupported` pin lost the race to the device-tier check that reads it once the page is idle, and
  the decline screen could vanish. The Playground now replaces only its own keys (`c`, `view`, `s`, `v`).
