# Backend submission: Problems 4, 5, 6

**Candidate:** Nguyen Tri Giang · nguyentrigiang1991@gmail.com · Role: **Backend Engineer**

| Problem | Where | Run | In one line |
|---|---|---|---|
| 4. Three ways to sum to n | [`src/problem4`](src/problem4) | `npm test` | Formula, loop, and a recursion that halves `n`, with complexity notes and edge cases |
| 5. A Crude Server | [`src/problem5`](src/problem5) | `npm install && npm run dev` | CRUD API in Express 5, TypeScript and SQLite, with OpenAPI docs and optimistic concurrency |
| 6. Architecture | [`src/problem6`](src/problem6) | (read) | Spec for a live top-10 scoreboard that a cheating client cannot inflate |

Requirements: Node.js 22.13 or later. No database server, Docker or native build is needed. CI runs Problems 4 and 5 on Node 22 and 24.

## What I would look at first

**Problem 4.** All three functions handle `0` and negative `n` (`sum_to_n(-5) === -15`), and reject non-integers. The recursive version halves `n` on every call using `S(m) = 2·S(m/2) + (m/2)²`, so the largest valid `n` (134,217,727) takes 28 calls. The usual `n + S(n - 1)` would need one stack frame per number. The tests check that largest `n`.

**Problem 5.**
- Optimistic concurrency with `ETag` and `If-Match`: when two clients edit the same product, one gets `200` and the other `412`, so neither change is lost without notice. The version check and the write are a single SQL statement.
- OpenAPI 3.1 at `/docs`, generated from the same Zod schemas that validate requests (passes `redocly lint`).
- Every error has the same shape and a `requestId`, which also appears in the `X-Request-Id` header and in the JSON log line for that request.
- Queries use bound parameters and whitelisted sort and update columns. LIKE wildcards are escaped, money is stored as integer cents, and pagination is stable.
- 36 end-to-end tests run through HTTP against a real SQLite database.

**Problem 6.** The client never sends points. To score, it sends the id of an action that the server started for that user. A `UNIQUE` constraint in the database allows one score per action, so retries and concurrent requests award points exactly once. The spec also covers SSE fan-out across instances through Redis pub/sub, failure modes, a test plan, and the kinds of cheating this design cannot prevent.

## Assumptions

Each README lists its assumptions. The main ones:

- Problem 4: the result fits in `Number.MAX_SAFE_INTEGER`, as stated, and negative `n` sums towards `-1`.
- Problem 5: the resource is a `product`.
- Problem 6: authentication already exists and the action itself is opaque.
