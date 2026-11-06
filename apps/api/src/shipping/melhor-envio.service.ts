import type { ShippingOption } from '@aurevi/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import type { IntegrationCredential } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ShippingProduct = {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
};

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(31 * 86400),
});
const serviceSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    company: z.object({ name: z.string().min(1) }),
    custom_price: z.union([z.string().regex(/^\d+(?:\.\d{1,2})?$/), z.number().nonnegative()]),
    custom_delivery_range: z.object({
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    }),
  })
  .refine((s) => s.custom_delivery_range.max >= s.custom_delivery_range.min);

@Injectable()
export class MelhorEnvioService {
  private readonly logger = new Logger(MelhorEnvioService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; result: Promise<ShippingOption[]> }
  >();
  private refreshing: Promise<string> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  private get baseUrl() {
    return env.MELHOR_ENVIO_ENVIRONMENT === 'production'
      ? 'https://melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';
  }

  private get provider() {
    return `melhor_envio:${env.MELHOR_ENVIO_ENVIRONMENT}`;
  }

  private get configured() {
    return Boolean(
      env.MELHOR_ENVIO_CLIENT_ID &&
      env.MELHOR_ENVIO_CLIENT_SECRET &&
      env.MELHOR_ENVIO_USER_AGENT &&
      env.MELHOR_ENVIO_REDIRECT_URI &&
      env.INTEGRATION_ENCRYPTION_KEY,
    );
  }

  authorizationUrl(state: string) {
    if (!this.configured)
      throw new Error('Configure as variáveis MELHOR_ENVIO e INTEGRATION_ENCRYPTION_KEY na API.');
    const url = new URL('/oauth/authorize', this.baseUrl);
    url.search = new URLSearchParams({
      client_id: env.MELHOR_ENVIO_CLIENT_ID!,
      redirect_uri: env.MELHOR_ENVIO_REDIRECT_URI!,
      response_type: 'code',
      scope: 'shipping-calculate',
      state,
    }).toString();
    return url.toString();
  }

  // Called only by the local CLI until admin authentication exists.
  async connect(callbackUrl: string, expectedState: string) {
    this.authorizationUrl(expectedState);
    const callback = new URL(callbackUrl);
    const expected = new URL(env.MELHOR_ENVIO_REDIRECT_URI!);
    const code = callback.searchParams.get('code');
    if (
      !expectedState ||
      callback.origin !== expected.origin ||
      callback.pathname !== expected.pathname ||
      callback.searchParams.get('state') !== expectedState ||
      callback.searchParams.has('error') ||
      !code
    ) {
      throw new Error('Retorno OAuth inválido. Inicie a conexão novamente.');
    }
    await this.exchange({
      grant_type: 'authorization_code',
      redirect_uri: expected.toString(),
      code,
    });
    this.cache.clear();
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(env.INTEGRATION_ENCRYPTION_KEY!, 'hex'),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }

  private decrypt(value: string) {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(env.INTEGRATION_ENCRYPTION_KEY!, 'hex'),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }

  private async json(path: string, body: unknown, accessToken?: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': env.MELHOR_ENVIO_USER_AGENT!,
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Melhor Envio HTTP ${response.status}`, { cause: response.status });
    return response.json() as Promise<unknown>;
  }

  private async exchange(grant: Record<string, string>) {
    const tokens = tokensSchema.parse(
      await this.json('/oauth/token', {
        client_id: Number(env.MELHOR_ENVIO_CLIENT_ID),
        client_secret: env.MELHOR_ENVIO_CLIENT_SECRET,
        ...grant,
      }),
    );
    const data = {
      accessTokenEnc: this.encrypt(tokens.access_token),
      refreshTokenEnc: this.encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };
    await this.prisma.integrationCredential.upsert({
      where: { provider: this.provider },
      create: { provider: this.provider, ...data },
      update: data,
    });
    return tokens.access_token;
  }

  private async accessToken(forceRefresh = false): Promise<string | null> {
    const row = await this.prisma.integrationCredential.findUnique({
      where: { provider: this.provider },
    });
    if (!row) return null;
    if (!forceRefresh && row.expiresAt.getTime() > Date.now() + 86400_000)
      return this.decrypt(row.accessTokenEnc);
    if (!this.refreshing) {
      this.refreshing = this.renew(row, forceRefresh).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  private async renew(row: IntegrationCredential, forceRefresh: boolean) {
    // A read started before another rotation can finish after it; reload while owning the guard.
    const latest = await this.prisma.integrationCredential.findUniqueOrThrow({
      where: { provider: this.provider },
    });
    if (
      latest.refreshTokenEnc !== row.refreshTokenEnc ||
      (!forceRefresh && latest.expiresAt.getTime() > Date.now() + 86400_000)
    ) {
      return this.decrypt(latest.accessTokenEnc);
    }
    return this.exchange({
      grant_type: 'refresh_token',
      refresh_token: this.decrypt(latest.refreshTokenEnc),
    });
  }

  @Cron('0 3 * * *')
  async renewCredentials() {
    if (!this.configured) return;
    try {
      await this.accessToken();
    } catch {
      this.logger.warn('Não foi possível renovar o Melhor Envio. Verifique a conexão no servidor.');
    }
  }

  async quote(
    from: string,
    to: string,
    products: ShippingProduct[],
    fresh = false,
  ): Promise<ShippingOption[]> {
    if (!this.configured || products.length === 0) return [];
    const body = {
      from: { postal_code: from },
      to: { postal_code: to },
      products,
      options: { receipt: false, own_hand: false },
    };
    const key = JSON.stringify(body);
    const cached = this.cache.get(key);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.result;
    const result = this.loadQuote(body);
    if (!fresh) {
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expiresAt: Date.now() + 60_000, result });
    }
    return result;
  }

  private async loadQuote(body: unknown): Promise<ShippingOption[]> {
    try {
      let token = await this.accessToken();
      if (!token) return [];
      let response: unknown;
      try {
        response = await this.json('/api/v2/me/shipment/calculate', body, token);
      } catch (error) {
        if (!(error instanceof Error) || error.cause !== 401) throw error;
        token = await this.accessToken(true);
        if (!token) return [];
        response = await this.json('/api/v2/me/shipment/calculate', body, token);
      }
      return z
        .array(z.unknown())
        .max(100)
        .parse(response)
        .flatMap((value) => {
          if (
            value &&
            typeof value === 'object' &&
            ('error' in value || ('has_error' in value && value.has_error))
          )
            return [];
          const parsed = serviceSchema.safeParse(value);
          if (!parsed.success) return [];
          const service = parsed.data;
          const cents = Math.round(Number(service.custom_price) * 100);
          if (!Number.isSafeInteger(cents)) return [];
          return [
            {
              id: `me-${service.id}`,
              label: `${service.company.name} — ${service.name}`,
              cents,
              minDays: service.custom_delivery_range.min,
              maxDays: service.custom_delivery_range.max,
            },
          ];
        });
    } catch {
      // Never log provider payloads: they can contain credentials or personal data.
      this.logger.warn('Melhor Envio indisponível; usando a tabela de frete por UF.');
      return [];
    }
  }
}
