studio: +41
The Studio's preview holder now wears the zoom cursor over a collage photo (and the pointer cursor over a code copy button) while the pointer is over it, because the preview frame takes no pointer events and its own `cursor:` never applies (`onHover` in StudioShell). The engine CSS that carries the ring and the lift is not part of this route's JS.
