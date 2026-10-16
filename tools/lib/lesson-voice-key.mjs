// The key a Studio lesson clip is stored under — shared by the recorder
// (tools/record-lesson-voice.mjs) and the check that every line has a current clip
// (docs/src/components/studio/lessons/lesson-voice.test.ts), so the two cannot disagree.
//
// Every input that changes the audio is in the key: the line's text and the voice settings. A
// reworded line, another voice or another bitrate is a new key, and the old clip reads as stale.

import { createHash } from 'node:crypto';

/** 48 kbps mono: speech at Kokoro's 24 kHz loses nothing audible below 64, and every lesson's
 *  clips download with the lesson. */
export const LESSON_VOICE_KBPS = 48;

/**
 * @param {string} text the line exactly as the lesson says it
 * @param {{model: string, voice: string, dtype: string, speed: number}} voice
 */
export function lineKey(text, voice) {
	return createHash('sha256')
		.update(JSON.stringify({ ...voice, kbps: LESSON_VOICE_KBPS, text }))
		.digest('hex')
		.slice(0, 12);
}
