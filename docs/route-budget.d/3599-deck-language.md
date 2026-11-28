studio: +17
playground: +9
home: +9
The source editor's tree is built from the deck model now (Segno P4b, #3599). Its code and the inline pass ride only the deck language's own chunk; what reaches the eager chunks is the import of that chunk and the chunk names it moves. Given back first: the inline pass was +10,189 B on each route when read through the package entry, and an export added for it to the outline's module is gone.
