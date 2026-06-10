# brand/ — The Joy of Engineering artwork

Erik Lundh's personal brand mark: a silhouette of a hand-standing man
(a Capoeira move), from his business cards.

Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se

| File | What it is |
|---|---|
| `joy-of-engineering-original.svg` | The original CorelDRAW 2019 export, unmodified (UTF-16 encoded, seven filled paths in brand blue `#0083BE`). Source of truth lives on Erik's OneDrive. |
| `joy-of-engineering-contour.svg` | The reusable traced outline: the seven filled shapes geometrically unioned and reduced to the single outer boundary (plus the one genuine interior gap), so the figure renders as one continuous drawn line with no internal seam edges. ~4 KB. |

## Using the contour in other projects

The contour strokes with `currentColor` — set the CSS `color` of the
embedding element to pick the line colour (brand blue is `#0083BE`):

```html
<!-- inline the file's <svg> element, then: -->
<div style="color: #0083be; width: 8rem">…inlined svg…</div>
```

Inline it (Vite: `import logo from './joy-of-engineering-contour.svg?raw'`)
rather than using `<img src>` — an external `<img>` cannot inherit
`currentColor`, and the stroke would render black. Adjust line weight via
the `stroke-width` attribute (viewBox is `0 0 7669 10068`; `120` ≈ a 2 px
line at ~140 px display height).

`terminal-app/src/assets/joy-of-engineering.svg` is a copy of the contour
used by the splash screen; the app deliberately keeps its own copy so the
npm package stays self-contained. If the artwork ever changes, regenerate
both.
