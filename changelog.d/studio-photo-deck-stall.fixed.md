- The Studio no longer freezes for half a minute after a deck with phone photos lands in the editor. The slide-metadata
  memo copied each photo slide (megabytes of `data:` URI) on every read and evicted every other slide to make room, and
  the deck was cut into slides again for each of the 35 readers that ask per edit. A deck of three phone photos now
  copies 61 characters per keystroke instead of 15 million, and is cut once instead of 35 times; Firefox's longest stall
  on that deck fell from 29 s to 11 s.
