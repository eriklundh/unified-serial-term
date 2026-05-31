const DTR_STATE = 0x0001;
const RTS_STATE = 0x0002;
const DTR_MASK = 0x0100;
const RTS_MASK = 0x0200;

export function encodeModemControl(opts: { dtr?: boolean; rts?: boolean }): { wValue: number } {
  let mask = 0;
  let state = 0;

  if ('dtr' in opts) {
    mask |= DTR_MASK;
    if (opts.dtr) state |= DTR_STATE;
  }
  if ('rts' in opts) {
    mask |= RTS_MASK;
    if (opts.rts) state |= RTS_STATE;
  }

  return { wValue: mask | state };
}
