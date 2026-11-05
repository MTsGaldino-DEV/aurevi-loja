import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

const COOKIE = 'aurevi_cart';
export const CART_DAYS = 30;

export function readCartToken(request: Request) {
  const match = request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return match?.[1];
}

export function newCartToken(response: Response) {
  const token = randomBytes(32).toString('base64url');
  response.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: CART_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}
