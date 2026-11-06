import { Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const MAX_KEYS = 5000;

// ponytail: em memória, uma instância; mover para o banco se a API escalar
@Injectable()
export class LoginRateLimit {
  private readonly keys = new Map<string, { count: number; resetAt: number }>();

  /** Registers a failed login. Returns false once the key exceeded 5 failures in 15 minutes. */
  hit(key: string, now = Date.now()) {
    let entry = this.keys.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.keys.size >= MAX_KEYS) this.makeRoom(now);
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.keys.set(key, entry);
    }
    return ++entry.count <= MAX_FAILURES;
  }

  reset(key: string) {
    this.keys.delete(key);
  }

  private makeRoom(now: number) {
    for (const [key, entry] of this.keys) if (entry.resetAt <= now) this.keys.delete(key);
    // Still full: drop the oldest key so a legitimate admin is never locked out by key flooding.
    if (this.keys.size >= MAX_KEYS) this.keys.delete(this.keys.keys().next().value as string);
  }
}
