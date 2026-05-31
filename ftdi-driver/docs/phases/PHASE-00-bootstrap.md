# PHASE-00-bootstrap.md — Project bootstrap

Branch: `phase/00-bootstrap`

## Goal

A buildable, testable, lintable, **empty** TypeScript library project.
By the end of this phase:

- `npm test` runs and passes
- `npm run typecheck` is clean
- `npm run lint` is clean
- `npm run build` produces `dist/index.js` and `dist/index.d.ts`
- A single `VERSION` constant is exported and tested

No FTDI code yet. The goal is to verify the toolchain end-to-end on a
trivial deliverable so we don't discover a misconfiguration mid-way
through Phase 1.

## Step-by-step

### Step 0.1 — Initialise the repo

Assuming the user has already created the empty git repo and Claude Code
has cloned it. From the repo root:

```
npm init -y
```

Edit `package.json`:

```json
{
  "name": "ftdi-webusb-driver",
  "version": "0.0.1",
  "type": "module",
  "description": "Pure-TypeScript WebUSB driver for FTDI FT-X family chips",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:hw": "FTDI_HW_TEST=1 vitest run --config vitest.hw.config.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "build": "vite build && tsc -p tsconfig.build.json",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["ftdi", "webusb", "uart", "ft232", "ft231"],
  "license": "MIT",
  "engines": { "node": ">=20" }
}
```

**Commit:** `chore(proj): initialise package.json with scripts and exports`

### Step 0.2 — Install dev dependencies

```
npm install --save-dev \
  typescript \
  vitest \
  @types/w3c-web-usb \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint \
  prettier \
  vite \
  @types/node
```

**Commit:** `chore(proj): add dev dependencies`

### Step 0.3 — TypeScript config

`tsconfig.json` (for editor/typecheck, no emit):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["w3c-web-usb", "node"]
  },
  "include": ["src/**/*", "test-hw/**/*"]
}
```

`tsconfig.build.json` (extends; only generates declarations):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "emitDeclarationOnly": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "test-hw/**/*"]
}
```

**Commit:** `chore(proj): add TypeScript configuration`

### Step 0.4 — Vite config (library mode)

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        testing: resolve(__dirname, 'src/testing.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      external: [],
    },
  },
});
```

**Commit:** `chore(proj): add Vite library build configuration`

### Step 0.5 — Vitest config

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['test-hw/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
```

`vitest.hw.config.ts` (used by `test:hw` only):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test-hw/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
```

**Commit:** `chore(proj): add Vitest configurations for unit and hw tests`

### Step 0.6 — ESLint and Prettier

`.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json' },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};
```

`.prettierrc`:

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always",
  "semi": true
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
*.log
.DS_Store
.vitest-cache/
```

`.editorconfig`:

```
root = true
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

**Commit:** `chore(proj): add ESLint, Prettier, .gitignore, .editorconfig`

### Step 0.7 — First failing test

`src/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('package entry', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

Run `npm test`. **Red** (no `index.ts` yet).

**Commit:** `test(proj): add smoke test for package entry VERSION export`

### Step 0.8 — Make it green

`src/index.ts`:

```ts
/**
 * ftdi-webusb-driver — pure-TypeScript WebUSB driver for FTDI FT-X family chips.
 * @packageDocumentation
 */
export const VERSION = '0.0.1';
```

`src/testing.ts` (placeholder for the `./testing` subpath export):

```ts
/**
 * Test utilities. Imported via `ftdi-webusb-driver/testing`.
 *
 * MockUsbTransport will be added in Phase 5.
 */
export {};
```

Run `npm test`. **Green.**

**Commit:** `feat(proj): export VERSION from package entry`

### Step 0.9 — Verify the full toolchain

```
npm run typecheck   # must be clean
npm run lint        # must be clean (may need .eslintignore tweaks)
npm run build       # must produce dist/index.js, dist/index.d.ts,
                    # dist/testing.js, dist/testing.d.ts
```

If `lint` complains about `vite.config.ts`, `vitest.config.ts`, etc.
being unparseable because they're outside `tsconfig.json`'s `include`,
add an `.eslintignore`:

```
*.config.ts
*.config.cjs
dist/
node_modules/
```

Or extend the lint config to handle them with a separate parserOptions
project. Pick the simpler fix.

**Commit:** `chore(proj): tune lint config to ignore build configs`
(only if needed)

### Step 0.10 — Add LICENSE and minimal README

`LICENSE` — MIT, with the user's name.

`README.md` (minimal for now; expanded in Phase 10):

```markdown
# ftdi-webusb-driver

Pure-TypeScript WebUSB driver for FTDI FT-X family chips (FT231XS, FT230X).

## Status

In active development. See [PLAN.md](./PLAN.md) for the phased plan and
[CLAUDE.md](./CLAUDE.md) for project-level conventions.

## License

MIT
```

**Commit:** `docs: add LICENSE and minimal README`

### Step 0.11 — Push and merge

Push `phase/00-bootstrap`. Merge into `main` with `--no-ff`:

```
git checkout main
git merge --no-ff phase/00-bootstrap -m "Merge phase/00-bootstrap

A working build/test/lint/typecheck loop on an empty library."
git push origin main
```

## Acceptance checklist

- [ ] `npm test` runs and passes
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` produces `dist/index.js`, `dist/index.d.ts`,
      `dist/testing.js`, `dist/testing.d.ts`
- [ ] LICENSE present
- [ ] Minimal README present
- [ ] Branch merged to `main` with `--no-ff`
- [ ] All bootstrap commits have meaningful messages per
      `CLAUDE.md` convention
