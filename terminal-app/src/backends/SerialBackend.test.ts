import { describe, it, expect, beforeEach } from 'vitest'
import type { SerialBackend, SerialOptions } from './SerialBackend'
import { MockSerialBackend } from './MockSerialBackend'

describe('SerialBackend contract (via MockSerialBackend)', () => {
  let backend: SerialBackend

  beforeEach(() => {
    backend = new MockSerialBackend()
  })

  it('starts closed', () => {
    expect(backend.isOpen).toBe(false)
  })

  it('flips isOpen after open()', async () => {
    const options: SerialOptions = { baudRate: 115200 }
    await backend.open(options)
    expect(backend.isOpen).toBe(true)
  })

  it('flips isOpen back after close()', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.close()
    expect(backend.isOpen).toBe(false)
  })

  it('readable yields bytes pushed by the test harness', async () => {
    await backend.open({ baudRate: 115200 })
    const mock = backend as MockSerialBackend

    const reader = backend.readable.getReader()
    mock.simulateReceive(new Uint8Array([0x41, 0x42, 0x43]))
    const { value, done } = await reader.read()
    reader.releaseLock()

    expect(done).toBe(false)
    expect(value).toEqual(new Uint8Array([0x41, 0x42, 0x43]))
  })

  it('writable records written bytes', async () => {
    await backend.open({ baudRate: 115200 })
    const mock = backend as MockSerialBackend

    const writer = backend.writable.getWriter()
    await writer.write(new Uint8Array([0x48, 0x69]))
    writer.releaseLock()

    expect(mock.written).toEqual([new Uint8Array([0x48, 0x69])])
  })

  it('has the expected id and label fields', () => {
    expect(typeof backend.id).toBe('string')
    expect(typeof backend.label).toBe('string')
  })

  it('reconfigure() does not throw when called on an open backend', async () => {
    await backend.open({ baudRate: 9600 })
    await expect(backend.reconfigure({ baudRate: 115200 })).resolves.toBeUndefined()
  })
})
