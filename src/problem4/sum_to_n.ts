/**
 * Problem 4: Three ways to sum to n
 *
 * Assumptions
 * - n must be an integer. Anything else (1.5, NaN, Infinity) throws a RangeError.
 * - sum_to_n(0) is 0.
 * - For a negative n we add the numbers from -1 down to n, so
 *   sum_to_n(-5) = -1 + -2 + -3 + -4 + -5 = -15. The problem says "any integer"
 *   without defining this case, and this reading gives sum_to_n(-n) = -sum_to_n(n).
 * - The result fits in Number.MAX_SAFE_INTEGER, as the problem guarantees.
 *   That holds while |n| <= 134_217_727.
 *
 * All three functions follow the same steps:
 *   1. check that n is an integer,
 *   2. add up 1 + 2 + ... + |n|,
 *   3. make the result negative if n was negative.
 */

function requireInteger(n: number): void {
  if (!Number.isInteger(n)) {
    throw new RangeError(`n must be an integer, received ${n}`);
  }
}

/** Gives the positive total the same sign as n. */
function applySignOf(n: number, positiveTotal: number): number {
  if (n < 0) {
    return -positiveTotal;
  }
  return positiveTotal;
}

/**
 * A. Gauss's formula: 1 + 2 + ... + m = m * (m + 1) / 2
 *
 * Time:  O(1). A few arithmetic operations, whatever the size of n.
 * Space: O(1).
 *
 * This is the one to use in practice.
 *
 * About precision: m * (m + 1) is twice the result, so for the largest inputs it
 * goes above MAX_SAFE_INTEGER before the division. It is still exact, because
 * m * (m + 1) is always even and stays below 2^54, and a double can store every
 * even integer below 2^54.
 */
export function sum_to_n_a(n: number): number {
  requireInteger(n);

  const lastNumber = Math.abs(n);
  const total = (lastNumber * (lastNumber + 1)) / 2;

  return applySignOf(n, total);
}

/**
 * B. A loop that adds every number from 1 to |n|.
 *
 * Time:  O(n). One addition per number.
 * Space: O(1). Only the running total is kept.
 *
 * Easy to read and to trust, but the time grows with n: at the largest
 * allowed n it does about 134 million additions.
 */
export function sum_to_n_b(n: number): number {
  requireInteger(n);

  const lastNumber = Math.abs(n);
  let total = 0;
  for (let currentNumber = 1; currentNumber <= lastNumber; currentNumber++) {
    total += currentNumber;
  }

  return applySignOf(n, total);
}

/**
 * C. Recursion that halves n at every step.
 *
 * Write S(m) for 1 + 2 + ... + m, and let k = floor(m / 2).
 * The numbers 1..m split into:
 *   - the lower half 1..k, which adds up to S(k),
 *   - the upper half (k + 1)..2k, where each number is k bigger than its partner
 *     in the lower half, so it adds up to S(k) + k * k,
 *   - and, when m is odd, the last number m on its own.
 * So:  S(m) = 2 * S(k) + k * k        (+ m when m is odd)
 *
 * Time:  O(log n). Each call halves m, so the largest allowed n needs only
 *        28 calls.
 * Space: O(log n) for the call stack, far from the stack limit. The textbook
 *        `m + S(m - 1)` needs one stack frame per number and crashes long
 *        before the largest allowed n.
 *
 * It is not faster than the formula in A, but it is a recursive solution
 * that works for every valid input.
 */
export function sum_to_n_c(n: number): number {
  requireInteger(n);

  const total = sumFromOneTo(Math.abs(n));

  return applySignOf(n, total);
}

function sumFromOneTo(lastNumber: number): number {
  if (lastNumber === 0) {
    return 0;
  }

  const half = Math.floor(lastNumber / 2);
  const sumOfLowerHalf = sumFromOneTo(half);
  const sumOfUpperHalf = sumOfLowerHalf + half * half;
  let total = sumOfLowerHalf + sumOfUpperHalf;

  const isOdd = lastNumber % 2 === 1;
  if (isOdd) {
    total += lastNumber;
  }
  return total;
}
