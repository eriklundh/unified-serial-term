import { describe, it, expect } from 'vitest';
import { encodeModemControl } from './modem.js';

describe('encodeModemControl', () => {
  it('sets DTR high', () => {
    expect(encodeModemControl({ dtr: true })).toEqual({ wValue: 0x0101 });
  });

  it('sets DTR low', () => {
    expect(encodeModemControl({ dtr: false })).toEqual({ wValue: 0x0100 });
  });

  it('sets RTS high', () => {
    expect(encodeModemControl({ rts: true })).toEqual({ wValue: 0x0202 });
  });

  it('sets RTS low', () => {
    expect(encodeModemControl({ rts: false })).toEqual({ wValue: 0x0200 });
  });

  it('sets both DTR and RTS high', () => {
    expect(encodeModemControl({ dtr: true, rts: true })).toEqual({ wValue: 0x0303 });
  });

  it('sets both DTR and RTS low', () => {
    expect(encodeModemControl({ dtr: false, rts: false })).toEqual({ wValue: 0x0300 });
  });

  it('sets DTR high and RTS low', () => {
    expect(encodeModemControl({ dtr: true, rts: false })).toEqual({ wValue: 0x0301 });
  });

  it('returns zero change-mask for empty opts (no-op)', () => {
    expect(encodeModemControl({})).toEqual({ wValue: 0x0000 });
  });
});
