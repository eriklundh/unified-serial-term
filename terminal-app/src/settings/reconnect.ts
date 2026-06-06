// Auto-reconnect suppression.
//
// On load the app auto-reconnects to the last-authorised device (the browser
// still lists it via getPorts() after a manual close). That is the wanted
// behaviour after an *accidental* reload while connected — but not after the
// user has explicitly clicked Disconnect, where a reload should stay
// disconnected. We persist a single flag: set it on an explicit Disconnect,
// clear it on an explicit Connect. An unexpected device drop deliberately does
// NOT set it, so a replug/reload still auto-reconnects.

const KEY = 'connection.autoReconnectSuppressed'

export function isAutoReconnectSuppressed(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function suppressAutoReconnect(): void {
  localStorage.setItem(KEY, '1')
}

export function allowAutoReconnect(): void {
  localStorage.removeItem(KEY)
}
