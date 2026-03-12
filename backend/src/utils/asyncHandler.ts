import { Request, Response, NextFunction, RequestHandler } from 'express';


/**
 * Wraps an async route handler so any thrown error is forwarded
 * to Express's next() — no try/catch boilerplate in every controller.
 */

const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
    (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
};


export default asyncHandler;