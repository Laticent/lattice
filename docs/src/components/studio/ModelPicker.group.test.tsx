import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ArchitectStatus } from './architect';
import { useModelCatalog } from './ModelPicker';

// The chat's model list and the image model list sit on one Workspace panel. Radios that share a `name` are ONE group to the
// browser, so an arrow key in one list moved the check, and fired the pick, in the other. jsdom does not enforce groups, so the
// rule is pinned where it is made: each catalog hands its list a name of its own.
const status = { openRouterReady: false, modelId: null } as unknown as ArchitectStatus;

describe('model lists are separate radio groups', () => {
	it('gives every picker its own group name', () => {
		const { result } = renderHook(() => ({ chat: useModelCatalog(status), image: useModelCatalog(status, { visionOnly: true, currentId: 'x/y', select: () => {} }) }));
		expect(result.current.chat.groupName).toBeTruthy();
		expect(result.current.image.groupName).toBeTruthy();
		expect(result.current.chat.groupName).not.toBe(result.current.image.groupName);
	});
});
