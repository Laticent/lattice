- **Playground: a quick Explore and back no longer leaves the preview hidden.** Switching Explore, Edit, Explore within
  a frame or two kept the preview covered while it waited on the Edit switch in between, which can only finish in
  Edit: about a second on an idle machine, several on a loaded one (seen on Firefox, where the preview did not come
  back within 4 s). Explore's reveal now drops that wait, and a switch that is overtaken stops its own wait loop.
