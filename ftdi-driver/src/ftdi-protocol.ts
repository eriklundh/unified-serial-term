export const VendorRequest = {
  RESET: 0x00,
  MODEM_CTRL: 0x01,
  SET_FLOW_CTRL: 0x02,
  SET_BAUD_RATE: 0x03,
  SET_DATA: 0x04,
  GET_MODEM_STATUS: 0x05,
  SET_EVENT_CHAR: 0x06,
  SET_ERROR_CHAR: 0x07,
  SET_LATENCY_TIMER: 0x09,
  GET_LATENCY_TIMER: 0x0a,
  SET_BITMODE: 0x0b,
  READ_PINS: 0x0c,
} as const;

export const ResetSubcommand = {
  RESET_SIO: 0x0000,
  PURGE_RX: 0x0001,
  PURGE_TX: 0x0002,
} as const;
