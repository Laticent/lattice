studio: +6
playground: +1
home: +1
getting-started: +5

Select, DropdownMenu and Popover now sit above the toaster (`z-[1000000000]` in place of the shadcn `z-50`), so an open list, menu or popover is never covered by an Undo toast. The longer class string is about 5 gzip bytes in each of `select`, `popover` and `dropdown-menu`'s chunks. Nothing to give back: no class is shorter than `z-50`, and the rule has to live on the primitive.
