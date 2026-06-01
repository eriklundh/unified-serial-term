/**
 * ftdi-webusb-driver — pure-TypeScript WebUSB driver for FTDI FT-X family chips.
 * @packageDocumentation
 */
export const VERSION = '0.1.0';

export type { BaudDivisor } from './baud.js';
export { baudToDivisor } from './baud.js';

export type { Parity, StopBits, DataBits, LineProperties } from './types.js';
export { encodeLineProperties } from './line.js';

export { encodeModemControl } from './modem.js';
export type { FlowMode } from './flow.js';
export { encodeFlowControl } from './flow.js';

export type {
  ModemStatusFlags,
  LineStatusFlags,
  StrippedPacket,
} from './read.js';
export { stripStatus, ModemStatusBits, LineStatusBits } from './read.js';

export type { ControlSetup, UsbTransport } from './transport.js';
export { WebUsbTransport, TransferError } from './transport.webusb.js';

export type { SerialOptions, FtdiUartOptions } from './ftdi-uart.js';
export { FtdiUart } from './ftdi-uart.js';
export { VendorRequest, ResetSubcommand } from './ftdi-protocol.js';
