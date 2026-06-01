/** UART parity setting. */
export type Parity = 'none' | 'odd' | 'even' | 'mark' | 'space';

/** Number of stop bits. */
export type StopBits = 1 | 1.5 | 2;

/** Number of data bits per character. */
export type DataBits = 5 | 6 | 7 | 8;

/** Line-format parameters passed to {@link encodeLineProperties}. */
export interface LineProperties {
  dataBits: DataBits;
  parity: Parity;
  stopBits: StopBits;
  /** Assert the BREAK condition when `true`. */
  breakOn?: boolean;
}
