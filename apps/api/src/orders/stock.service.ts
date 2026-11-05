import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

type Line = { variantId: string; quantity: number };

// Every stock change goes through here, in the caller's transaction, with its audit row.
@Injectable()
export class StockService {
  async reserve(tx: Prisma.TransactionClient, orderId: string, lines: Line[]) {
    // Fixed order, so two orders with the same pieces cannot deadlock.
    const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const { variantId, quantity } of sorted) {
      const updated = await tx.$executeRaw`
        UPDATE product_variants
        SET stock_reserved = stock_reserved + ${quantity}, updated_at = now()
        WHERE id = ${variantId}::uuid AND is_active AND stock_on_hand - stock_reserved >= ${quantity}`;
      if (updated === 0) throw new ConflictException('Uma das peças da sacola ficou sem estoque.');
      await tx.stockMovement.create({
        data: { variantId, orderId, type: 'reserve', reservedDelta: quantity },
      });
    }
  }

  async release(tx: Prisma.TransactionClient, orderId: string, lines: Line[]) {
    for (const { variantId, quantity } of lines) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stockReserved: { decrement: quantity } },
      });
      await tx.stockMovement.create({
        data: { variantId, orderId, type: 'release', reservedDelta: -quantity },
      });
    }
  }

  async commitSale(tx: Prisma.TransactionClient, orderId: string, lines: Line[]) {
    for (const { variantId, quantity } of lines) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stockOnHand: { decrement: quantity }, stockReserved: { decrement: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantId,
          orderId,
          type: 'sale',
          onHandDelta: -quantity,
          reservedDelta: -quantity,
        },
      });
    }
  }
}
