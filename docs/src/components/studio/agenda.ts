// The deck `agenda:` register (lib/core/resolve-agenda.js) as the Inspector reads it: ONE line, up to one
// word per axis, written back with the default word left out and the key removed once every axis is
// default — the `progress-rail:` shape. This MIRRORS the kernel, which the docs build cannot import (CJS
// with its own require); agenda.test.ts pins every word and its order to the engine's register.

import { axisLineValue, parseAxisLine } from './axis-line';

export type AgendaAxis = 'style' | 'pages';
export type AgendaWords = Partial<Record<AgendaAxis, string>>;

export const AGENDA_AXES: readonly { axis: AgendaAxis; names: readonly string[] }[] = [
	{ axis: 'style', names: ['ledger', 'circles', 'checks'] },
	{ axis: 'pages', names: ['pages', 'no-pages'] },
];

export const AGENDA_AXIS_ORDER: readonly AgendaAxis[] = AGENDA_AXES.map((a) => a.axis);

/** An axis's words, default first. */
export const agendaWords = (axis: AgendaAxis): string[] => [...(AGENDA_AXES.find((a) => a.axis === axis)?.names ?? [])];

/** The deck's current words, by axis: the first recognized word on each axis, as the kernel reads it. */
export const parseAgenda = (value: string): AgendaWords => parseAxisLine(AGENDA_AXES, value);

/** Words → the line's value: axis order, every DEFAULT word dropped, `''` when nothing is left. */
export const agendaValue = (words: AgendaWords): string => axisLineValue(AGENDA_AXES, words, true);

const LABELS: Record<string, string> = {
	ledger: 'Ledger', circles: 'Circles', checks: 'Checks',
	pages: 'Page numbers', 'no-pages': 'No page numbers',
};
export const agendaLabel = (word: string): string => LABELS[word] ?? word;

/** The non-default words an axis offers; its default is the Inspector's "auto" row. */
export const agendaOptions = (axis: AgendaAxis): string[] => agendaWords(axis).slice(1);
