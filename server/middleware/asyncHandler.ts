import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not catch a rejected promise returned by an async route
 * handler — an unhandled rejection there never reaches error middleware and
 * the request just hangs. Wrap every handler in this so thrown/rejected
 * errors (typed ApiErrors or not) flow to `next(err)` → errorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
