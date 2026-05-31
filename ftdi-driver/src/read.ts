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

export function stripStatus(packet: Uint8Array): StrippedPacket {
  return {
    modemStatus: { raw: packet[0] ?? 0, cts: false, dsr: false, ri: false, rlsd: false },
    lineStatus: {
      raw: packet[1] ?? 0,
      overrunError: false,
      parityError: false,
      framingError: false,
      breakInterrupt: false,
      transmitHoldingRegisterEmpty: false,
      transmitterEmpty: false,
      fifoError: false,
    },
    payload: packet.subarray(2),
  };
}
