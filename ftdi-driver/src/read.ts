/** Raw bit masks for modem-status byte 0 of a bulk-IN packet. */
export const ModemStatusBits = {
  CTS: 0x10,
  DSR: 0x20,
  RI: 0x40,
  RLSD: 0x80,
} as const;

/** Raw bit masks for line-status byte 1 of a bulk-IN packet. */
export const LineStatusBits = {
  OVERRUN_ERROR: 0x02,
  PARITY_ERROR: 0x04,
  FRAMING_ERROR: 0x08,
  BREAK_INTERRUPT: 0x10,
  TRANSMIT_HOLDING_REGISTER_EMPTY: 0x20,
  TRANSMITTER_EMPTY: 0x40,
  FIFO_ERROR: 0x80,
} as const;

/** Decoded modem-status flags from bulk-IN packet byte 0. */
export interface ModemStatusFlags {
  /** Clear to Send. */
  readonly cts: boolean;
  /** Data Set Ready. */
  readonly dsr: boolean;
  /** Ring Indicator. */
  readonly ri: boolean;
  /** Received Line Signal Detect (DCD). */
  readonly rlsd: boolean;
  /** Raw byte value for diagnostics. */
  readonly raw: number;
}

/** Decoded line-status flags from bulk-IN packet byte 1. */
export interface LineStatusFlags {
  readonly overrunError: boolean;
  readonly parityError: boolean;
  readonly framingError: boolean;
  readonly breakInterrupt: boolean;
  readonly transmitHoldingRegisterEmpty: boolean;
  readonly transmitterEmpty: boolean;
  readonly fifoError: boolean;
  /** Raw byte value for diagnostics. */
  readonly raw: number;
}

/** Result of {@link stripStatus}: the two status bytes decoded plus the data payload. */
export interface StrippedPacket {
  readonly modemStatus: ModemStatusFlags;
  readonly lineStatus: LineStatusFlags;
  /** Data bytes following the two status header bytes. Length 0 on idle packets. */
  readonly payload: Uint8Array;
}

function decodeModemStatus(byte: number): ModemStatusFlags {
  return {
    raw: byte,
    cts: (byte & ModemStatusBits.CTS) !== 0,
    dsr: (byte & ModemStatusBits.DSR) !== 0,
    ri: (byte & ModemStatusBits.RI) !== 0,
    rlsd: (byte & ModemStatusBits.RLSD) !== 0,
  };
}

function decodeLineStatus(byte: number): LineStatusFlags {
  return {
    raw: byte,
    overrunError: (byte & LineStatusBits.OVERRUN_ERROR) !== 0,
    parityError: (byte & LineStatusBits.PARITY_ERROR) !== 0,
    framingError: (byte & LineStatusBits.FRAMING_ERROR) !== 0,
    breakInterrupt: (byte & LineStatusBits.BREAK_INTERRUPT) !== 0,
    transmitHoldingRegisterEmpty: (byte & LineStatusBits.TRANSMIT_HOLDING_REGISTER_EMPTY) !== 0,
    transmitterEmpty: (byte & LineStatusBits.TRANSMITTER_EMPTY) !== 0,
    fifoError: (byte & LineStatusBits.FIFO_ERROR) !== 0,
  };
}

/**
 * Strip the mandatory 2-byte FTDI status header from a bulk-IN packet.
 *
 * Every bulk-IN packet from the chip begins with a modem-status byte and a
 * line-status byte. Idle packets contain only those two bytes; data follows
 * from byte 2 onward.
 *
 * @throws {RangeError} if `packet` is shorter than 2 bytes.
 */
export function stripStatus(packet: Uint8Array): StrippedPacket {
  if (packet.length < 2) {
    throw new RangeError(`bulk-IN packet too short (${packet.length} bytes), need ≥ 2`);
  }
  return {
    modemStatus: decodeModemStatus(packet[0] ?? 0),
    lineStatus: decodeLineStatus(packet[1] ?? 0),
    payload: packet.subarray(2),
  };
}
