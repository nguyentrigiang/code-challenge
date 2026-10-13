# Problem 4: Three ways to sum to n

> ⏰ Duration: You should not spend more than **2 hours** on this problem.
> *Time estimation is for internship roles, if you are a software professional you should spend significantly less time.*

# Task

Provide 3 unique implementations of the following function in TypeScript.

- Comment on the complexity or efficiency of each function.

**Input**: `n` - any integer

*Assuming this input will always produce a result lesser than `Number.MAX_SAFE_INTEGER`*.

**Output**: `return` - summation to `n`, i.e. `sum_to_n(5) === 1 + 2 + 3 + 4 + 5 === 15`.

```go
func sum_to_n_a(n: number): number {
    // your code here
}

func sum_to_n_b(n: number): number {
    // your code here
}

func sum_to_n_c(n: number): number {
    // your code here
}
```

---

# Solution

Implementation: [`sum_to_n.ts`](./sum_to_n.ts) · Tests: [`sum_to_n.test.ts`](./sum_to_n.test.ts)

| Function | Approach | Time | Space | Notes |
|---|---|---|---|---|
| `sum_to_n_a` | Gauss's formula `n(n+1)/2` | O(1) | O(1) | The one to use. The intermediate `n(n+1)` can pass `MAX_SAFE_INTEGER`, but it is even and below 2^54, where doubles are still exact, so the result is correct for every valid input. |
| `sum_to_n_b` | Loop from 1 to `n` | O(n) | O(1) | Simple, but the work grows with `n`: about 134 million additions at the largest valid `n`. |
| `sum_to_n_c` | Recursion that halves `n`: `S(m) = 2·S(⌊m/2⌋) + ⌊m/2⌋²`, plus `m` when `m` is odd | O(log n) | O(log n) | 28 calls at the largest valid `n`. The textbook `n + S(n - 1)` needs one stack frame per number and overflows long before that. |

### Assumptions

- `sum_to_n(0) === 0`.
- For negative `n`, the sum runs from `-1` down to `n`: `sum_to_n(-5) === -15`.
  The problem says "any integer" without defining the negative case, so I chose this reading.
- Non-integer input (`1.5`, `NaN`, `Infinity`) throws a `RangeError`.

### Run the tests

Requires Node.js >= 22.18, which runs TypeScript directly. There are no dependencies to install.

```bash
cd src/problem4
npm test
```
