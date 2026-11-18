import { describe, expect, it } from 'vitest';
import { generateSyncKey, createSyncEngine } from 'sync-kit';

describe('골격', () => {
  it('sync-kit 을 가져와 쓸 수 있다', () => {
    expect(typeof createSyncEngine).toBe('function');
    expect(generateSyncKey()).toMatch(/^[0-9A-Z-]+$/);
  });
});
