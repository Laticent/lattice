- **Fixed: the Studio assistant's speech preview reads what the voice reads.** On a slide with a
  spoken line (`<!-- say: … -->`), `preview_speech` showed the on-screen text, words the voice never
  says. It now follows the same order as Present and the export: the spoken line, a front-matter
  `say:` entry, chart narration, then the slide text, which it labels approximate. It previews up to
  10 slides at once, lists each term that fired as written and as spoken (a possessive or plural on
  its own line), and names words no term covers that a voice may stumble on, such as `Ilcea.K` or
  `McKinsey`.
