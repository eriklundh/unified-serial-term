import type { ITheme } from '@xterm/xterm'

/**
 * A colour theme applied to both the xterm canvas (`xterm`) and the app chrome
 * (`tokens`, written as CSS custom properties on the document root). Keeping the
 * two together is what makes the terminal and the surrounding UI stay visually
 * consistent.
 */
export interface AppTheme {
  id: string
  label: string
  dark: boolean
  xterm: ITheme
  /** CSS custom-property name -> value, e.g. `--bg` -> `#1e1e1e`. */
  tokens: Record<string, string>
}

export const DEFAULT_DARK_ID = 'dark'
export const DEFAULT_LIGHT_ID = 'light'

export const THEMES: AppTheme[] = [
  {
    id: 'dark',
    label: 'Dark',
    dark: true,
    tokens: {
      '--bg': '#1e1e1e',
      '--fg': '#e6e6e6',
      '--surface': '#252526',
      '--surface-2': '#2d2d30',
      '--border': '#3c3c3c',
      '--muted': '#9a9a9a',
      '--accent': '#3b82f6',
      '--accent-fg': '#ffffff',
      '--danger': '#ef4444',
    },
    xterm: {
      background: '#1e1e1e',
      foreground: '#e6e6e6',
      cursor: '#e6e6e6',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#264f78',
      black: '#1e1e1e', red: '#f44747', green: '#6a9955', yellow: '#d7ba7d',
      blue: '#569cd6', magenta: '#c586c0', cyan: '#4ec9b0', white: '#d4d4d4',
      brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#b5cea8',
      brightYellow: '#dcdcaa', brightBlue: '#9cdcfe', brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0', brightWhite: '#ffffff',
    },
  },
  {
    id: 'light',
    label: 'Light',
    dark: false,
    tokens: {
      '--bg': '#ffffff',
      '--fg': '#1f2328',
      '--surface': '#f6f8fa',
      '--surface-2': '#eaeef2',
      '--border': '#d0d7de',
      '--muted': '#57606a',
      '--accent': '#0969da',
      '--accent-fg': '#ffffff',
      '--danger': '#cf222e',
    },
    xterm: {
      background: '#ffffff',
      foreground: '#1f2328',
      cursor: '#1f2328',
      cursorAccent: '#ffffff',
      selectionBackground: '#b6dbff',
      black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
      blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
      brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
      brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9',
      brightCyan: '#3192aa', brightWhite: '#8c959f',
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    dark: true,
    tokens: {
      '--bg': '#002b36',
      '--fg': '#93a1a1',
      '--surface': '#073642',
      '--surface-2': '#0a4250',
      '--border': '#0a4a59',
      '--muted': '#657b83',
      '--accent': '#268bd2',
      '--accent-fg': '#002b36',
      '--danger': '#dc322f',
    },
    xterm: {
      background: '#002b36',
      foreground: '#93a1a1',
      cursor: '#93a1a1',
      cursorAccent: '#002b36',
      selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    dark: true,
    tokens: {
      '--bg': '#2e3440',
      '--fg': '#d8dee9',
      '--surface': '#3b4252',
      '--surface-2': '#434c5e',
      '--border': '#4c566a',
      '--muted': '#7b88a1',
      '--accent': '#88c0d0',
      '--accent-fg': '#2e3440',
      '--danger': '#bf616a',
    },
    xterm: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      cursorAccent: '#2e3440',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
]

const BY_ID: Record<string, AppTheme> = Object.fromEntries(THEMES.map((t) => [t.id, t]))

/** The theme with `id`, or the default dark theme if `id` is unknown. */
export function getTheme(id: string): AppTheme {
  return BY_ID[id] ?? BY_ID[DEFAULT_DARK_ID]
}

/** Default theme id, honouring the user's OS light/dark preference. */
export function defaultThemeId(prefersDark: boolean): string {
  return prefersDark ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID
}

/** Write a theme's design tokens (and `color-scheme`) onto a root element. */
export function applyThemeTokens(theme: AppTheme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(name, value)
  }
  root.style.setProperty('color-scheme', theme.dark ? 'dark' : 'light')
}
