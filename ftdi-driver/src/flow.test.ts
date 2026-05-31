import { describe, it, expect } from 'vitest';
import { encodeFlowControl } from './flow.js';
import type { FlowMode } from './flow.js';

describe('encodeFlowControl', () => {
  it('encodes none mode', () => {
    expect(encodeFlowControl('none')).toEqual({ wValue: 0x0000, wIndex: 0x0000 });
  });

  it('encodes rtscts mode', () => {
    expect(encodeFlowControl('rtscts')).toEqual({ wValue: 0x0000, wIndex: 0x0100 });
  });

  it('encodes dtrdsr mode', () => {
    expect(encodeFlowControl('dtrdsr')).toEqual({ wValue: 0x0000, wIndex: 0x0200 });
  });

  it('encodes xonxoff with default chars (XON=0x11, XOFF=0x13)', () => {
    expect(encodeFlowControl('xonxoff')).toEqual({ wValue: 0x1311, wIndex: 0x0400 });
  });

  it('encodes xonxoff with explicit default chars', () => {
    expect(encodeFlowControl('xonxoff', { xonChar: 0x11, xoffChar: 0x13 })).toEqual({
      wValue: 0x1311,
      wIndex: 0x0400,
    });
  });

  it('encodes xonxoff with custom chars', () => {
    expect(encodeFlowControl('xonxoff', { xonChar: 0x05, xoffChar: 0x06 })).toEqual({
      wValue: 0x0605,
      wIndex: 0x0400,
    });
  });

  it('throws RangeError for invalid flow mode', () => {
    expect(() => encodeFlowControl('invalid' as FlowMode)).toThrow(RangeError);
  });
});
