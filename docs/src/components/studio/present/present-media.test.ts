import { describe, expect, it, vi } from 'vitest';
import { bindPresentMedia, setPresentPlaybackState } from './present-media';

const handlers = () => ({ play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), stop: vi.fn() });
function fakeNav(type?: string) {
	const map = new Map<string, (() => void) | null>();
	return {
		map,
		nav: {
			mediaSession: { setActionHandler: (a: string, h: (() => void) | null) => void map.set(a, h), playbackState: 'none' as 'none' | 'paused' | 'playing', metadata: null as unknown },
			...(type ? { audioSession: { type } } : {}),
		},
	};
}

describe('present-media', () => {
	it('binds every transport verb and unbinds them all', () => {
		const h = handlers();
		const { map, nav } = fakeNav();
		const unbind = bindPresentMedia(h, 'Deck', nav);
		map.get('nexttrack')?.();
		map.get('previoustrack')?.();
		map.get('play')?.();
		expect(h.next).toHaveBeenCalledOnce();
		expect(h.prev).toHaveBeenCalledOnce();
		expect(h.play).toHaveBeenCalledOnce();
		setPresentPlaybackState(true, nav);
		expect(nav.mediaSession.playbackState).toBe('playing');
		unbind();
		expect([...map.values()].every((v) => v === null)).toBe(true);
		expect(nav.mediaSession.playbackState).toBe('none');
	});

	it('marks the audio session as media playback while open and puts it back on close', () => {
		const { nav } = fakeNav('auto');
		const unbind = bindPresentMedia(handlers(), 'Deck', nav);
		expect(nav.audioSession?.type).toBe('playback');
		unbind();
		expect(nav.audioSession?.type).toBe('auto');
	});

	it('never touches a Live call’s play-and-record session (it would end the mic track)', () => {
		const { nav } = fakeNav('play-and-record');
		const unbind = bindPresentMedia(handlers(), 'Deck', nav);
		expect(nav.audioSession?.type).toBe('play-and-record');
		unbind();
		expect(nav.audioSession?.type).toBe('play-and-record');
	});

	it('leaves a session that was already playback as playback on close', () => {
		const { nav } = fakeNav('playback');
		bindPresentMedia(handlers(), 'Deck', nav)();
		expect(nav.audioSession?.type).toBe('playback');
	});

	it('does nothing, and throws nothing, where the APIs are absent', () => {
		expect(() => bindPresentMedia(handlers(), '', {})()).not.toThrow();
		expect(() => setPresentPlaybackState(true, {})).not.toThrow();
	});
});
