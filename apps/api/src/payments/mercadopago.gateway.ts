import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { env } from '../env.js';

export type ProviderPayment = {
  id?: number | undefined;
  status?: string | undefined;
  status_detail?: string | undefined;
  transaction_amount?: number | undefined;
  external_reference?: string | undefined;
  installments?: number | undefined;
  date_of_expiration?: string | undefined;
  point_of_interaction?:
    | {
        transaction_data?:
          { qr_code?: string | undefined; qr_code_base64?: string | undefined } | undefined;
      }
    | undefined;
};

type CreateBody = Parameters<Payment['create']>[0]['body'];

@Injectable()
export class MercadoPagoGateway {
  private readonly client = new Payment(
    new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN, options: { timeout: 15_000 } }),
  );

  create(body: CreateBody, idempotencyKey: string): Promise<ProviderPayment> {
    return this.client.create({ body, requestOptions: { idempotencyKey } });
  }

  get(id: string): Promise<ProviderPayment> {
    return this.client.get({ id });
  }

  cancel(id: string): Promise<ProviderPayment> {
    return this.client.cancel({ id });
  }
}
