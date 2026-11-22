studio: +140

The start grid in StudioShell (StudioIsland's chunk) now puts the caret on a touch `pointerup`, because iOS Safari sometimes delivers a tap with no click, and skips the click that follows within 800 ms. It also cancels that tap's late mousedown, which took the focus away on the iPhone simulator. CI measured +96 gzip bytes for the first half; the declaration covers the mousedown handler and the gzip wobble a moved main can bring.
