import { describe, it, expect } from 'vitest';
import { encodeLineProperties } from './line.js';

describe('encodeLineProperties', () => {
  it('returns 0x0008 for 8N1', () => {
    expect(encodeLineProperties({ dataBits: 8, parity: 'none', stopBits: 1 })).toBe(0x0008);
  });
});
