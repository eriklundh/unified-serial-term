import { describe, it, expect } from 'vitest';
import { baudToDivisor } from './baud.js';

const vectors: readonly (readonly [number, number, number])[] = [
  // baud,      wValue, wIndex
  [300, 0x2710, 0x0000],
  [600, 0x1388, 0x0000],
  [1200, 0x09c4, 0x0000],
  [2400, 0x04e2, 0x0000],
  [4800, 0x0271, 0x0000],
  [9600, 0x4138, 0x0000],
  [19200, 0x809c, 0x0000],
  [38400, 0xc04e, 0x0000],
  [57600, 0x0034, 0x0000],
  [115200, 0x001a, 0x0000],
  [230400, 0x000d, 0x0000],
  [460800, 0x4006, 0x0000],
  [921600, 0x8003, 0x0000],
  [1_000_000, 0x0003, 0x0000],
];

describe('baudToDivisor', () => {
  it.each(vectors)('%d baud → wValue=0x%s wIndex=0x%s', (baud, wValue, wIndex) => {
    expect(baudToDivisor(baud)).toEqual({ wValue, wIndex });
  });
});

describe('baudToDivisor special cases', () => {
  it('returns wValue=0x0001 for 2 Mbaud (remapped from raw 0x4001)', () => {
    expect(baudToDivisor(2_000_000)).toEqual({ wValue: 0x0001, wIndex: 0x0000 });
  });

  it('returns wValue=0x0000 for 3 Mbaud (remapped from raw 0x0001)', () => {
    expect(baudToDivisor(3_000_000)).toEqual({ wValue: 0x0000, wIndex: 0x0000 });
  });
});

describe('baudToDivisor input validation', () => {
  it.each([0, -1, -115200])('throws RangeError for non-positive baud %d', (baud) => {
    expect(() => baudToDivisor(baud)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -Infinity])('throws RangeError for non-finite baud %s', (baud) => {
    expect(() => baudToDivisor(baud)).toThrow(RangeError);
  });

  it('throws RangeError for baud above 3 Mbaud (unreachable)', () => {
    expect(() => baudToDivisor(4_000_000)).toThrow(RangeError);
  });

  it('truncates fractional baud input without throwing', () => {
    expect(baudToDivisor(115200.7)).toEqual(baudToDivisor(115200));
  });
});
