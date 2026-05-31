#!/usr/bin/env node
/**
 * Regenerates the baud-rate vector table for docs/BAUD-VECTORS.md.
 * Run: npm run build && node scripts/gen-baud-vectors.mjs
 */
import { baudToDivisor } from '../dist/index.js';

const BAUDS = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600,
  115200, 230400, 460800, 921600, 1_000_000, 2_000_000, 3_000_000,
];

const BASE_CLOCK = 48_000_000;

function effectiveBaud(wValue, wIndex) {
  const divisor = wValue | (wIndex << 16);

  // Reverse the special-case remappings to recover the real encoded divisor.
  let encoded = divisor;
  if (encoded === 0) encoded = 1; // was remapped from 1 (3 Mbaud)
  else if (encoded === 1) encoded = 0x4001; // was remapped from 0x4001 (2 Mbaud)

  const fracBits = (encoded >>> 14) & 7;
  const intPart = encoded & 0x3fff;

  // Reconstruct divisor3 (the BRG divisor × 8).
  // DIVFRAC is [0,3,2,4,1,5,6,7]; invert it to get the frac index.
  const DIVFRAC_INV = [0, 4, 2, 1, 3, 5, 6, 7];
  const fracIdx = DIVFRAC_INV[fracBits] ?? 0;
  const divisor3 = intPart * 8 + fracIdx;

  return BASE_CLOCK / 2 / divisor3;
}

console.log('| Requested baud | wValue   | wIndex   | Effective baud  | Error % |');
console.log('|----------------|----------|----------|-----------------|---------|');

for (const baud of BAUDS) {
  try {
    const { wValue, wIndex } = baudToDivisor(baud);
    const eff = effectiveBaud(wValue, wIndex);
    const errPct = Math.abs((eff - baud) / baud * 100);
    const baudStr = baud.toLocaleString('en').padStart(15);
    const wvStr = `\`0x${wValue.toString(16).toUpperCase().padStart(4, '0')}\``;
    const wiStr = `\`0x${wIndex.toString(16).toUpperCase().padStart(4, '0')}\``;
    const effStr = eff.toFixed(2).padStart(15);
    const errStr = errPct.toFixed(2).padStart(7);
    console.log(`|${baudStr} | ${wvStr} | ${wiStr} |${effStr} |${errStr}  |`);
  } catch (e) {
    const baudStr = baud.toLocaleString('en').padStart(15);
    console.log(`|${baudStr} | ERROR    | ERROR    | ${e.message}`);
  }
}
