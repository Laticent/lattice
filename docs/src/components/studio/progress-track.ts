// The deck `progress-track:` register (lib/core/resolve-progress-track.js) as the Inspector reads it:
// ONE line, up to one word per axis, written back with the default word left out and the key
// removed once every axis is default — the `logo-finish:` shape. This MIRRORS the kernel, which the
// docs build cannot import (CJS with its own require); progress-track.test.ts pins every word and its
// order to the engine's register, so the two cannot drift.

import { axisLineValue, parseAxisLine } from './axis-line';

export type ProgressTrackAxis = 'placement' | 'style' | 'show';
export type ProgressTrackWords = Partial<Record<ProgressTrackAxis, string>>;

export const PROGRESS_TRACK_AXES: readonly { axis: ProgressTrackAxis; names: readonly string[] }[] = [
	{ axis: 'placement', names: ['right', 'center', 'edge'] },
	{ axis: 'style', names: ['dots', 'bar'] },
	{ axis: 'show', names: ['on', 'off'] },
];
const AXES = PROGRESS_TRACK_AXES;

export const PROGRESS_TRACK_AXIS_ORDER: readonly ProgressTrackAxis[] = AXES.map((a) => a.axis);

/** An axis's words, default first. */
export const progressTrackWords = (axis: ProgressTrackAxis): string[] => [...(AXES.find((a) => a.axis === axis)?.names ?? [])];

/** The deck's current words, by axis: the first recognized word on each axis, as the kernel reads it. */
export const parseProgressRail = (value: string): ProgressTrackWords => parseAxisLine(AXES, value);

/** Words → the line's value: axis order, every DEFAULT word dropped, `''` when nothing is left (the
 *  caller then drops the key). `on` is a default too — the rail shows unless a deck says `off`. */
export const progressTrackValue = (words: ProgressTrackWords): string => axisLineValue(AXES, words, true);

const LABELS: Record<string, string> = {
	right: 'Beside the page number', center: 'Footer center', edge: 'Right edge',
	dots: 'Dots', bar: 'Bar',
	on: 'On', off: 'Off',
};
export const progressTrackLabel = (word: string): string => LABELS[word] ?? word;

/** The non-default words an axis offers; its default is the Inspector's "auto" row. */
export const progressTrackOptions = (axis: ProgressTrackAxis): string[] => progressTrackWords(axis).slice(1);
