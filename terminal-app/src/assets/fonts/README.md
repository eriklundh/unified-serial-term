# Self-hosted terminal fonts

Latin subset, weight 400 (`-400.woff2`), sourced via [Fontsource](https://fontsource.org/)
(jsdelivr). Loaded lazily through `src/fonts.css` (`@font-face` +
`font-display: swap`) — a file is only downloaded when its family is selected
in Settings → Appearance, so the default system-monospace stack costs nothing.

All five are licensed **SIL Open Font License 1.1** (redistribution allowed):

| File | Font | Upstream |
|---|---|---|
| `source-code-pro-400.woff2` | Source Code Pro | Adobe |
| `jetbrains-mono-400.woff2` | JetBrains Mono | JetBrains |
| `fira-code-400.woff2` | Fira Code (ligatures) | Tonsky / Mozilla |
| `cascadia-code-400.woff2` | Cascadia Code | Microsoft |
| `ibm-plex-mono-400.woff2` | IBM Plex Mono | IBM |
