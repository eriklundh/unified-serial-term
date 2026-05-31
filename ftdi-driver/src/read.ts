export const ModemStatusBits = {
  CTS: 0x10,
  DSR: 0x20,
  RI: 0x40,
  RLSD: 0x80,
} as const;

export const LineStatusBits = {
  OVERRUN_ERROR: 0x02,
  PARITY_ERROR: 0x04,
  FRAMING_ERROR: 0x08,
  BREAK_INTERRUPT: 0x10,
  TRANSMIT_HOLDING_REGISTER_EMPTY: 0x20,
  TRANSMITTER_EMPTY: 0x40,
  FIFO_ERROR: 0x80,
} as const;

export interface ModemStatusFlags {
  readonly cts: boolean;
  readonly dsr: boolean;
  readonly ri: boolean;
  readonly rlsd: boolean;
  readonly raw: number;
}

export interface LineStatusFlags {
  readonly overrunError: boolean;
  readonly parityError: boolean;
  readonly framingError: boolean;
  readonly breakInterrupt: boolean;
  readonly transmitHoldingRegisterEmpty: boolean;
  readonly transmitterEmpty: boolean;
  readonly fifoError: boolean;
  readonly raw: number;
}

export interface StrippedPacket {
  readonly modemStatus: ModemStatusFlags;
  readonly lineStatus: LineStatusFlags;
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
