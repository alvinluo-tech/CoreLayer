import type { Context } from "hono";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";

type HonoHandler = (c: Context) => Promise<Response> | Response;

/**
 * Wrap a route handler with automatic error handling.
 *
 * Catches any thrown error, logs it via `logError`, and returns
 * a standardized `apiError` response — eliminating repetitive
 * try/catch/logError/apiError blocks in route files.
 *
 * @param context - Label for log messages (e.g. "articles/create")
 * @param handler - The actual route handler
 */
export function withErrorHandling(
  context: string,
  handler: HonoHandler,
): HonoHandler {
  return async (c) => {
    try {
      return await handler(c);
    } catch (err) {
      logError(context, err);
      return apiError(c, extractErrorMessage(err));
    }
  };
}
