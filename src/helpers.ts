// Copyright (C) 2024 Todd Kulesza <todd@dropline.net>

// This file is part of TopHat.

// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.

const ONE_MB_IN_B = 1000000;
const TEN_MB_IN_B = 10000000;
const ONE_GB_IN_B = 1000000000;
const TEN_GB_IN_B = 10000000000;
const ONE_TB_IN_B = 1000000000000;
const TEN_TB_IN_B = 10000000000000;

/**
 * Convert a number of bytes to a more logical human-readable string (e.g., 1024 -> 1 K).
 *
 * @param {number} bytes - Number of bytes to convert
 * @param {string} [unit='bytes']  - Either bytes or bits
 * @param {boolean} [imprecise=false] - Reduce precision to 0
 */
export function bytesToHumanString(
  bytes: number,
  unit = 'bytes',
  imprecise = false
): string {
  let quantity = bytes;
  let precision = 1;
  if (imprecise) {
    precision = 0;
  }
  let suffix = 'B';
  if (unit === 'bits') {
    quantity *= 8;
    suffix = 'b';
  }
  if (quantity < 1) {
    return `0 K${suffix}`;
  } else if (quantity < 1000) {
    // Indicate activity, but don't clutter the UI w/ # of bytes
    return `< 1 K${suffix}`;
  } else if (quantity < ONE_MB_IN_B) {
    return `${(quantity / 1000).toFixed(0)} K${suffix}`;
  } else if (quantity < TEN_MB_IN_B) {
    // Show one decimal of precision for < 100 MB
    return `${(quantity / ONE_MB_IN_B).toFixed(precision)} M${suffix}`;
  } else if (quantity < ONE_GB_IN_B) {
    return `${(quantity / ONE_MB_IN_B).toFixed(0)} M${suffix}`;
  } else if (quantity < TEN_GB_IN_B) {
    return `${(quantity / ONE_GB_IN_B).toFixed(precision)} G${suffix}`;
  } else if (quantity < ONE_TB_IN_B) {
    return `${(quantity / ONE_GB_IN_B).toFixed(0)} G${suffix}`;
  } else if (quantity < TEN_TB_IN_B) {
    return `${(quantity / ONE_TB_IN_B).toFixed(precision)} T${suffix}`;
  } else {
    return `${(quantity / ONE_TB_IN_B).toFixed(0)} T${suffix}`;
  }
}

/**
 * Round up to the nearest power of 10 (or half that).
 *
 * @param {number} bytes - Value of bytes to round
 */
export function roundMax(bytes: number) {
  let result = Math.pow(10, Math.ceil(Math.log10(bytes)));
  while (result / 2 > bytes && result > 20000) {
    result /= 2;
  }
  return result;
}