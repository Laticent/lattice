- **Changed: exporting a narrated webpage keeps the Studio responsive while it packs the audio.**
  The export used to compress, encode and hash every clip on the main thread, about 0.1 s each,
  so the progress bar froze and Cancel stopped answering on a long deck. That work now runs in a
  small pool of background workers. On a 75-clip export, the main thread's blocked time fell from
  about 4.9 s to 2.4 s. If workers cannot run, the export packs on the main thread as before and
  produces the same file.
