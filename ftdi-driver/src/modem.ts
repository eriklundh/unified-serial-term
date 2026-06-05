const DTR_STATE = 0x0001;
const RTS_STATE = 0x0002;
const DTR_MASK = 0x0100;
const RTS_MASK = 0x0200;

/**
 * Encode DTR/RTS state changes into the `wValue` for the `SIO_MODEM_CTRL`
 * control request (request `0x01`).
 *
 * Only the pins present in `opts` are changed; omitted pins keep their
 * current hardware state (the change-mask bits are set only for supplied
 * keys).
 */
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
