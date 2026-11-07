import type { NextFunction, Request, Response } from 'express';

/** Admin responses carry orders and customer data: no browser or proxy may cache them. */
export function noStore(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('Cache-Control', 'no-store');
  next();
}
