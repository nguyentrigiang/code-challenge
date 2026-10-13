import { test } from "node:test";
import assert from "node:assert/strict";
import { sum_to_n_a, sum_to_n_b, sum_to_n_c } from "./sum_to_n.ts";

const implementations = { sum_to_n_a, sum_to_n_b, sum_to_n_c };

// [n, expected sum]
const knownSums: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [2, 3],
  [5, 15],
  [10, 55],
  [100, 5050],
  [-1, -1],
  [-5, -15],
  [-100, -5050],
];

for (const [name, sumToN] of Object.entries(implementations)) {
  test(`${name}: known values`, () => {
    for (const [n, expectedSum] of knownSums) {
      assert.equal(sumToN(n), expectedSum, `${name}(${n})`);
    }
  });

  test(`${name}: rejects non-integers`, () => {
    for (const notAnInteger of [1.5, NaN, Infinity]) {
      assert.throws(() => sumToN(notAnInteger), RangeError);
    }
  });
}

test("all implementations agree for every n from -2000 to 2000", () => {
  for (let n = -2000; n <= 2000; n++) {
    const formulaResult = sum_to_n_a(n);
    assert.equal(sum_to_n_b(n), formulaResult, `sum_to_n_b(${n})`);
    assert.equal(sum_to_n_c(n), formulaResult, `sum_to_n_c(${n})`);
  }
});

test("largest n whose sum is still a safe integer", () => {
  // 134_217_727 * 134_217_728 / 2 = 9_007_199_187_632_128 <= MAX_SAFE_INTEGER
  const largestN = 134_217_727;
  const expectedSum = 9_007_199_187_632_128;
  assert.ok(expectedSum <= Number.MAX_SAFE_INTEGER);
  assert.equal(sum_to_n_a(largestN), expectedSum);
  assert.equal(sum_to_n_a(-largestN), -expectedSum);
  assert.equal(sum_to_n_b(largestN), expectedSum);
  assert.equal(sum_to_n_c(largestN), expectedSum);
});
