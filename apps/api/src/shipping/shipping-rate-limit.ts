import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class ShippingRateLimit implements CanActivate {
  private readonly clients = new Map<string, { count: number; expiresAt: number }>();

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Express defaults to the connection IP; forwarded headers require trusted proxy setup at deploy.
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let client = this.clients.get(ip);
    if (!client || client.expiresAt <= now) {
      if (this.clients.size >= 5000) {
        for (const [key, entry] of this.clients)
          if (entry.expiresAt <= now) this.clients.delete(key);
        if (this.clients.size >= 5000) this.reject();
      }
      client = { count: 0, expiresAt: now + 60_000 };
      this.clients.set(ip, client);
    }
    if (++client.count > 30) this.reject();
    return true;
  }

  private reject(): never {
    throw new HttpException(
      'Muitas consultas de frete. Aguarde um minuto e tente de novo.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
