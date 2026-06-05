# TESTING.md — testing strategy

## Layers

We have three layers of tests, each with a different speed/fidelity trade-off:

1. **Pure-logic unit tests** (instant, run on every save in watch mode).
   Functions like `baudToDivisor`, `encodeLineProperties`, `stripStatus`.
   No I/O, no async, no mocks needed.

2. **Driver tests against `MockUsbTransport`** (still instant).
   Assert that `FtdiUart.configure()`, `read()`, `write()`, and the
   stream API call the underlying transport with the right parameters
   in the right order. Uses the mock from Phase 5.

3. **Hardware-in-loop tests** (slow, requires real FT231XS plugged in).
   Live in `test-hw/`. Excluded from default `npm test`. Run with
   `FTDI_HW_TEST=1 npm run test:hw`. See `docs/phases/PHASE-09-hw-tests.md`.

## TDD discipline

For every behavioural change:

1. **Red:** Write a test that captures the desired behaviour. Run it.
   See it fail. Commit it: `test(scope): describe the case`.
2. **Green:** Write the minimum code to pass. Run it. See it pass.
   Commit: `feat(scope): implement <thing>` (or `fix(scope): ...`).
3. **Refactor:** Clean up, extract named constants, improve naming.
   Re-run tests. Commit: `refactor(scope): explain the cleanup`.

Three commits per cycle is normal. Don't squash unless the cycle was
itself a mistake to be undone.

## Naming tests

Use Vitest's `describe`/`it` pattern. Test names read as sentences:

```ts
describe('baudToDivisor', () => {
  it('returns 0x4138 for 9600 baud', () => { ... });
  it('throws RangeError for baud=0', () => { ... });
  it('treats 1.5 baud as 1', () => { ... });
});
```

The describe is the unit under test; the `it` is "it does X under
condition Y". Avoid "should" — it adds words without information.

## Mocking WebUSB

We don't mock `USBDevice` directly; we abstract it behind `UsbTransport`
(Phase 5) and mock at that boundary. This keeps the mock surface small
(8 methods) and means the WebUSB type defs don't leak into test files
beyond a couple of common types.

The `MockUsbTransport` is a class, not a Vitest mock function. It records
every call in arrays we can assert against:

```ts
const mock = new MockUsbTransport();
const driver = new FtdiUart(mock);
await driver.configure({ baud: 115200 });

expect(mock.controlOutCalls).toEqual([
  { request: 0x00, value: 0x0000, index: 0x0000, data: undefined },
  { request: 0x04, value: 0x0008, index: 0x0000, data: undefined },
  // ... etc
]);
```

For bulk-IN responses (`controlTransferIn`, `transferIn`), the test
pre-loads the mock with a queue of `Uint8Array` chunks that get returned
in order.

## Coverage targets

- Pure-logic modules: 100% line and branch coverage. Anything less means
  a code path isn't tested.
- Driver class: 100% line coverage of the configuration path. Read/write
  paths covered via mock.
- Stream API: lifecycle (start, data, cancel, error) all covered.
- Hardware tests: smoke only — they prove the chip is happy, not exhaustive.

Add `vitest --coverage` to CI when CI exists.

## CI (future)

GitHub Actions running `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build` on every push to a branch and every PR. Don't set this
up until after Phase 2 — premature CI is a tar pit.

## What we don't test

- The browser's WebUSB implementation. That's Chromium's job.
- The OS USB stack. Same.
- xterm.js. Same.
- The chip's correct response to malformed setup packets. The chip will
  STALL on invalid requests; the host throws `DOMException: TransferError`.
  We surface that to the caller via `try/catch`; we don't try to exhaustively
  enumerate which malformed requests STALL.
