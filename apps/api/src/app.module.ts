import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CartController } from './cart/cart.controller.js';
import { CartService } from './cart/cart.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { HealthController } from './health/health.controller.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersJobs } from './orders/orders.jobs.js';
import { OrdersService } from './orders/orders.service.js';
import { StockService } from './orders/stock.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { ShippingController } from './shipping/shipping.controller.js';
import { ShippingService } from './shipping/shipping.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, SettingsModule],
  controllers: [
    HealthController,
    CatalogController,
    ShippingController,
    CartController,
    OrdersController,
  ],
  providers: [
    CatalogService,
    ShippingService,
    CartService,
    OrdersService,
    StockService,
    OrdersJobs,
  ],
})
export class AppModule {}
