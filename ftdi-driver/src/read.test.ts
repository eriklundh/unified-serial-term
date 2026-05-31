import { describe, it, expect } from 'vitest';
import { stripStatus } from './read.js';

describe('stripStatus', () => {
  it('returns empty payload for idle packet (2 bytes only)', () => {
    const result = stripStatus(new Uint8Array([0x01, 0x60]));
    expect(result.payload).toEqual(new Uint8Array(0));
    expect(result.modemStatus.raw).toBe(0x01);
    expect(result.lineStatus.raw).toBe(0x60);
  });

  it('returns payload bytes for non-idle packet', () => {
    const data = new Uint8Array([0x01, 0x60, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const result = stripStatus(data);
    expect(Array.from(result.payload)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });
});
