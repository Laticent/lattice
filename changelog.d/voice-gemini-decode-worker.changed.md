- **Changed: Present stays smooth while it reads aloud in a Gemini voice.** Gemini sends each
  spoken sentence as text-encoded audio inside a JSON reply, and the Studio decoded it on the main
  thread. On a phone-speed CPU, a 20-second clip blocked the page for 75–87 ms. A background
  worker now does the decoding, so those pauses are gone. If the worker cannot run, the Studio
  decodes on the main thread as before and the audio is the same.
