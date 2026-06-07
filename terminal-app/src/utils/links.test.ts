import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openLink } from './links'

describe('openLink', () => {
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens http:// URLs with _blank + noopener,noreferrer', () => {
    openLink(new MouseEvent('click'), 'http://example.com')
    expect(openSpy).toHaveBeenCalledWith('http://example.com', '_blank', 'noopener,noreferrer')
  })

  it('opens https:// URLs with _blank + noopener,noreferrer', () => {
    openLink(new MouseEvent('click'), 'https://example.com/path?q=1#hash')
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/path?q=1#hash',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('rejects javascript: scheme', () => {
    openLink(new MouseEvent('click'), 'javascript:alert(1)')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('rejects file:// scheme', () => {
    openLink(new MouseEvent('click'), 'file:///etc/passwd')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('rejects ftp:// scheme', () => {
    openLink(new MouseEvent('click'), 'ftp://example.com')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('rejects bare strings that are not URLs', () => {
    openLink(new MouseEvent('click'), 'not-a-url')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('is case-insensitive on the scheme', () => {
    openLink(new MouseEvent('click'), 'HTTPS://example.com')
    expect(openSpy).toHaveBeenCalledWith('HTTPS://example.com', '_blank', 'noopener,noreferrer')
  })
})
