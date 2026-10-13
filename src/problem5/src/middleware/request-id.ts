import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Gives every request a correlation id: reuses a sane incoming `X-Request-Id`
 * (e.g. from a load balancer), otherwise generates one. It is echoed in the response
 * header, included in error bodies and logged, so a user's bug report can be matched
 * to the exact log line.
 */
export function assignRequestId({ log }: { log: boolean }): RequestHandler {
  return (req, res, next) => {
    // Step 1: pick the request id (keep the caller's one only if it looks safe to log).
    const incomingId = req.get("X-Request-Id");
    const isValidIncomingId = incomingId !== undefined && VALID_REQUEST_ID.test(incomingId);
    const requestId = isValidIncomingId ? incomingId : randomUUID();

    // Step 2: make it available to the error handler and send it back to the client.
    res.locals.requestId = requestId;
    res.set("X-Request-Id", requestId);

    // Step 3: when the response is sent, write one JSON log line for this request.
    if (log) {
      const startedAt = performance.now();
      res.on("finish", () => {
        const durationMs = Math.round(performance.now() - startedAt);
        console.log(
          JSON.stringify({
            time: new Date().toISOString(),
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs,
          }),
        );
      });
    }
    next();
  };
}
