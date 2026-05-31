export interface BaudDivisor {
  readonly wValue: number;
  readonly wIndex: number;
}

export function baudToDivisor(baud: number): BaudDivisor {
  if (baud === 115200) {
    return { wValue: 0x001a, wIndex: 0x0000 };
  }
  throw new Error('not implemented');
}
