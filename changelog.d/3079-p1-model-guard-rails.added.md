- **Added: a nightly check of every model id the Studio names, and one file that holds them.** The
  Studio's chat, image and voice defaults, its curated families and its picker lists now come from
  `docs/src/lib/models.config.json`, so a provider retiring a model is a one-line fix. The
  `model-guard-nightly` workflow checks each id against OpenRouter's public lists and, when their
  secrets are set, Gemini's, Anthropic's and OpenAI's, and opens one rolling issue when an id is gone.
  An id in the file's `retired` list makes a stored selection read "Model retired" at once, with no
  substitute model. Its first run removed three gone ids from the pickers: `qwen/qwq` and the two
  `zyphra/zonos` voices.
