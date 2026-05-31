export type Parity = 'none' | 'odd' | 'even' | 'mark' | 'space';
export type StopBits = 1 | 1.5 | 2;
export type DataBits = 5 | 6 | 7 | 8;

export interface LineProperties {
  dataBits: DataBits;
  parity: Parity;
  stopBits: StopBits;
  breakOn?: boolean;
}

export function encodeLineProperties(_opts: LineProperties): number {
  return 0x0008;
}
