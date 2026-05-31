import { describe, it, expect } from 'vitest';
import { stripStatus } from './read.js';

describe('stripStatus payload', () => {
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

describe('stripStatus modemStatus flags', () => {
  it('decodes CTS asserted (bit 4)', () => {
    const r = stripStatus(new Uint8Array([0x10, 0x00]));
    expect(r.modemStatus.cts).toBe(true);
    expect(r.modemStatus.dsr).toBe(false);
    expect(r.modemStatus.ri).toBe(false);
    expect(r.modemStatus.rlsd).toBe(false);
  });

  it('decodes RLSD/DCD asserted (bit 7)', () => {
    const r = stripStatus(new Uint8Array([0x80, 0x00]));
    expect(r.modemStatus.rlsd).toBe(true);
  });

  it('decodes all four modem flags asserted (0xF0)', () => {
    const r = stripStatus(new Uint8Array([0xf0, 0x00]));
    expect(r.modemStatus).toMatchObject({ cts: true, dsr: true, ri: true, rlsd: true });
  });
});

describe('stripStatus lineStatus flags', () => {
  it('decodes THRE asserted (bit 5)', () => {
    const r = stripStatus(new Uint8Array([0x00, 0x20]));
    expect(r.lineStatus.transmitHoldingRegisterEmpty).toBe(true);
  });

  it('decodes framing error (bit 3)', () => {
    const r = stripStatus(new Uint8Array([0x00, 0x08]));
    expect(r.lineStatus.framingError).toBe(true);
  });

  it('decodes all error flags (0xfe)', () => {
    const r = stripStatus(new Uint8Array([0x00, 0xfe]));
    expect(r.lineStatus).toMatchObject({
      overrunError: true,
      parityError: true,
      framingError: true,
      breakInterrupt: true,
      transmitHoldingRegisterEmpty: true,
      transmitterEmpty: true,
      fifoError: true,
    });
  });
});

describe('stripStatus validation', () => {
  it('throws RangeError for empty packet', () => {
    expect(() => stripStatus(new Uint8Array(0))).toThrow(RangeError);
  });

  it('throws RangeError for 1-byte packet', () => {
    expect(() => stripStatus(new Uint8Array([0x01]))).toThrow(RangeError);
  });
});
