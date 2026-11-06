import type { Request, Response } from 'express';

const COOKIE = 'aurevi_admin';

export function readAdminToken(request: Request) {
  const match = request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return match?.[1];
}

const options = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env['NODE_ENV'] === 'production',
  path: '/',
} as const;

export function setAdminCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(COOKIE, token, { ...options, expires: expiresAt });
}

export function clearAdminCookie(response: Response) {
  response.clearCookie(COOKIE, options);
}
