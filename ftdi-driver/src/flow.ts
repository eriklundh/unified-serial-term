/** Hardware and software flow-control modes for `SIO_SET_FLOW_CTRL`. */
export type FlowMode = 'none' | 'rtscts' | 'dtrdsr' | 'xonxoff';

const FLOW_INDEX: Record<FlowMode, number> = {
  none: 0x0000,
  rtscts: 0x0100,
  dtrdsr: 0x0200,
  xonxoff: 0x0400,
};

const DEFAULT_XON = 0x11;
const DEFAULT_XOFF = 0x13;

/**
 * Encode flow-control parameters for the `SIO_SET_FLOW_CTRL` control request
 * (request `0x02`).
 *
 * For `'xonxoff'` mode the XON/XOFF characters default to `0x11`/`0x13`
 * (Ctrl-Q / Ctrl-S) unless overridden via `opts`.
 *
 * @throws {RangeError} if `mode` is not a recognised {@link FlowMode}.
 */
export function encodeFlowControl(
  mode: FlowMode,
  opts?: { xonChar?: number; xoffChar?: number },
): { wValue: number; wIndex: number } {
  if (!(mode in FLOW_INDEX)) {
    throw new RangeError(`unknown flow mode: ${String(mode)}`);
  }

  const wIndex = FLOW_INDEX[mode];
  let wValue = 0;

  if (mode === 'xonxoff') {
    const xon = opts?.xonChar ?? DEFAULT_XON;
    const xoff = opts?.xoffChar ?? DEFAULT_XOFF;
    wValue = ((xoff & 0xff) << 8) | (xon & 0xff);
  }

  return { wValue, wIndex };
}
