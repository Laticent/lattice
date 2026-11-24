---
origin: 3356
priority: P2
recorded: 2026-11-22
area: website
severity: medium
swimlane: docs/src/components/studio/reference-doc.ts
deferred: large — a design note first, confirmed with the owner, then code; the owner asked for it after #3304 and #3356 merge
source: https://github.com/Laticent/lattice/pull/3356#issuecomment-7070872119
---
# Chat attachments: a drop target, model-aware types, and published limits

why now   — The owner's expectations (2026-11-22, verbatim intent):
            - the chat has a drop target, not only the paperclip;
            - a .lattice (a zip) shared to the chat is sent quietly as its extracted text, and the model is told it was
              a deck archive;
            - accept what we care about AND what the models accept ("we really can't accept anything and everything
              here. we need to discriminate because claude and other llm models do");
            - respect each model's limits and tell the user when a file is over one;
            - sensible file limits, starting from the published limits of the curated models.
            Today: MAX_CHAT_PHOTOS=4, MAX_DOC_BYTES=5 MB, MAX_GROUND_DOCS=8; REF_DOC_ACCEPT='.txt,.md,.markdown,.text,.pdf';
            the paperclip's accept is `${LIBRARY_MEDIA_ACCEPT},${REF_DOC_ACCEPT}`; PDFs go through OpenRouter's pdf-text
            file parser.
where     — design note in engineering/decisions/; the per-model limits table in lib/models.config.json beside
            MODELS.openrouter.chatFeatured / chatValue (or-catalog.js), each limit with its source URL;
            architecture.input_modalities from the OpenRouter catalog (architect-model.js listOpenRouterModels reads only
            image and video today; it also lists file and audio).
done when — the owner has confirmed the design note; then: a drop target; .lattice/.pptx sent as text; the accept
            list follows the picked model's input_modalities; over-limit files are refused with a message naming the
            limit and the model.
evidence  — the design note's table of curated models and their published limits, each with a source link.
verify    — design: a fact-checker on the limits table. Code: unit tests on the accept and limit logic, e2e on the
            drop target and the refusal message (HARD RULE #34), and never spend OUR OpenRouter key (HARD RULE #24).
