import { describe, it, expect } from 'vitest';
import { baudToDivisor } from './baud.js';

describe('baudToDivisor', () => {
  it('returns wValue=0x001A wIndex=0x0000 for 115200 baud', () => {
    expect(baudToDivisor(115200)).toEqual({ wValue: 0x001a, wIndex: 0x0000 });
  });
});
