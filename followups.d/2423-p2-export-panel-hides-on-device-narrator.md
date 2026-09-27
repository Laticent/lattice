---
origin: 2423
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2423
---

# The webpage export panel does not offer the on-device narrator after Kokoro is loaded

why now   — an author with no OpenRouter key who loads the on-device voice cannot export a
            narrated deck: turning "Narration audio" on keeps the cloud voice and the bake
            refuses ("Connect OpenRouter in the Workspace…"), so the free path is unreachable.
where     — docs/src/components/studio/NarrationExportOptions.tsx: `onDevice` is set only when
            `voiceAvailability().kokoroReady` is true at mount; `defaultsToDevice` then needs it.
            Observed on PR #2423's head (headless Chromium, built docs site): Workspace →
            On-device → "Get ~80MB" → "Loaded — ready to use", Present speaks as "Aria · local",
            yet Share → Webpage shows no "Narrator" choice and quotes "0 of 28 prepared" against
            the cloud voice. #2423 does not touch this logic; not yet reproduced on `main`.
done when — with only the on-device voice loaded, turning narration audio on selects it and the
            export downloads with audio; a Playwright spec pins it.
evidence  — the panel text captured by the probe above: no "This device" button, the cloud quote,
            and the OpenRouter refusal after Download.
verify    — reproduce on `main` first (to confirm it predates #2423), then fix and drive the real
            panel end to end.
