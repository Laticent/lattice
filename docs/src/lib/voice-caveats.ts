// Voices that read a word differently from the text they are sent, MEASURED, with the note the Studio shows when
// one is picked. The text Lattice sends every voice is deterministic (Cadenza, `terms:`); what a language-model
// voice then says is not, and an author who hears a term misread blames their `terms:` entry. This list says which
// voices do it, so the author learns it where the voice is chosen (the Voice model card) rather than from a deck.
//
// One row per measured finding. A row needs the evidence that earned it (the note, the date, the reproduction):
// a voice is never listed on a hunch, and a voice that measured clean has no row. The audit of every curated
// voice (followups.d/3319-p2-voice-model-pronunciation-caveats.md) adds rows here, not code.

export interface VoiceCaveat {
	/** Matches the provider's model id. */
	readonly model: RegExp;
	/** What the author sees: plain words, what happens, and what to do about it. */
	readonly note: string;
	/** Where the measurement lives. */
	readonly evidence: string;
}

export const VOICE_CAVEATS: readonly VoiceCaveat[] = [
	{
		// gemini-3.8-flash-lite-tts (#3319): the owner heard "Yearn" misread in the Studio, then heard four later clips read
		// right, so the voice varies by sentence and by run. Only the on-device voice is shown to read a term the same way
		// every time (it works from phonemes); no machine judge is reliable on Gemini's voice (the follow-up says why).
		model: /flash-lite(?:-preview)?-tts/,
		note: 'Flash-Lite can read the same word differently from one line, or one play, to the next: a name it reads right once can come out wrong the next time. If a term sounds wrong, switch to the on-device voice, which reads it the same way every time.',
		evidence: 'followups.d/3319-p1-gemini-tts-misreads-yearn-by-position.md',
	},
];

/** The caveat for a voice model, or null when none is measured. */
export function voiceCaveat(modelId: string | null | undefined): VoiceCaveat | null {
	const id = String(modelId ?? '');
	return VOICE_CAVEATS.find((c) => c.model.test(id)) ?? null;
}
