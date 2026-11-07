import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAuthController } from './admin/admin-auth.controller.js';
import { AdminOriginGuard, AdminSessionGuard } from './admin/admin-auth.guard.js';
import { AdminAuthService } from './admin/admin-auth.service.js';
import { AdminOrdersController } from './admin/admin-orders.controller.js';
import { AdminOrdersService } from './admin/admin-orders.service.js';
import { DashboardController } from './admin/dashboard.controller.js';
import { DashboardService } from './admin/dashboard.service.js';
import { LoginRateLimit } from './admin/login-rate-limit.js';
import { CartController } from './cart/cart.controller.js';
import { CartService } from './cart/cart.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { HealthController } from './health/health.controller.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersJobs } from './orders/orders.jobs.js';
import { OrdersService } from './orders/orders.service.js';
import { StockService } from './orders/stock.service.js';
import { MercadoPagoGateway } from './payments/mercadopago.gateway.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PaymentsService } from './payments/payments.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { ShippingController } from './shipping/shipping.controller.js';
import { ShippingService } from './shipping/shipping.service.js';
import { MelhorEnvioService } from './shipping/melhor-envio.service.js';
import { ShippingRateLimit } from './shipping/shipping-rate-limit.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, SettingsModule],
  controllers: [
    HealthController,
    CatalogController,
    ShippingController,
    CartController,
    OrdersController,
    PaymentsController,
    AdminAuthController,
    DashboardController,
    AdminOrdersController,
  ],
  providers: [
    CatalogService,
    ShippingService,
    MelhorEnvioService,
    ShippingRateLimit,
    CartService,
    OrdersService,
    StockService,
    OrdersJobs,
    MercadoPagoGateway,
    PaymentsService,
    AdminAuthService,
    LoginRateLimit,
    DashboardService,
    AdminOrdersService,
    AdminSessionGuard,
    AdminOriginGuard,
  ],
})
export class AppModule {}
